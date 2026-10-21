package com.healson.lifejournal;

import android.Manifest;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.provider.CalendarContract;

import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;

/**
 * 待办 → 系统日历同步（Calendar Provider）。
 *
 * 自建本地账户日历「人生记趣录·待办」（ACCOUNT_TYPE_LOCAL），事件按
 * UID_2445 = "todo-{id}@life-journal" 幂等 upsert；传入列表之外的本应用事件删除。
 * 已完成、或既无提醒时间也无截止日期的待办不进日历。
 * 同步语义与后端 ICS 订阅源保持一致：
 * - 有提醒时间 → 30 分钟定时事件 + 到点 DISPLAY 闹钟（本地时区）
 * - 仅截止日期 → 全天事件（Android 惯例：allDay=1、UTC 时区、UTC 午夜起止）
 */
final class CalendarSync {

    private static final String CALENDAR_NAME = "人生记趣录·待办";
    private static final String ACCOUNT_NAME = "life-journal";
    private static final String UID_PREFIX = "todo-";
    private static final String UID_SUFFIX = "@life-journal";
    private static final String[] PRIORITY_NAMES = {"", "高", "中", "低"};

    private CalendarSync() {}

    static boolean hasPermission(Context ctx) {
        return ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_CALENDAR)
                == PackageManager.PERMISSION_GRANTED
            && ContextCompat.checkSelfPermission(ctx, Manifest.permission.WRITE_CALENDAR)
                == PackageManager.PERMISSION_GRANTED;
    }

    /** 全量幂等同步，返回 "ok" 或 "error:原因"。todosJson 为前端 Todo 数组。 */
    static synchronized String syncTodos(Context ctx, String todosJson) {
        try {
            long calId = ensureCalendar(ctx);
            if (calId < 0) return "error:无法创建日历";

            // 现有事件 eventId -> uid，仅关心本应用写入的（uid 带前缀）
            Map<Long, String> existing = new HashMap<>();
            try (Cursor c = ctx.getContentResolver().query(
                    CalendarContract.Events.CONTENT_URI,
                    new String[]{CalendarContract.Events._ID, CalendarContract.Events.UID_2445},
                    CalendarContract.Events.CALENDAR_ID + "=?",
                    new String[]{String.valueOf(calId)},
                    null)) {
                if (c != null) {
                    while (c.moveToNext()) {
                        String uid = c.getString(1);
                        if (uid != null && uid.startsWith(UID_PREFIX)) {
                            existing.put(c.getLong(0), uid);
                        }
                    }
                }
            }

            JSONArray arr = new JSONArray(todosJson);
            Set<String> wanted = new HashSet<>();
            String localTz = TimeZone.getDefault().getID();

            for (int i = 0; i < arr.length(); i++) {
                JSONObject t = arr.optJSONObject(i);
                if (t == null) continue;
                String status = t.optString("status", "pending");
                String remindAt = optStr(t, "remindAt");
                String dueDate = optStr(t, "dueDate");
                if ("done".equals(status) || (remindAt == null && dueDate == null)) continue;

                boolean timed = remindAt != null;
                long start = timed ? parseLocal(remindAt) : parseDateUtc(dueDate);
                if (start < 0) continue;

                String uid = UID_PREFIX + t.optString("id") + UID_SUFFIX;
                int priority = t.optInt("priority", 2);
                priority = Math.max(1, Math.min(3, priority));
                StringBuilder desc = new StringBuilder("优先级：").append(PRIORITY_NAMES[priority]);
                String d = optStr(t, "description");
                if (d != null) desc.append('\n').append(d);

                ContentValues ev = new ContentValues();
                ev.put(CalendarContract.Events.CALENDAR_ID, calId);
                ev.put(CalendarContract.Events.TITLE, t.optString("title", "待办"));
                ev.put(CalendarContract.Events.DESCRIPTION, desc.toString());
                ev.put(CalendarContract.Events.UID_2445, uid);
                if (timed) {
                    ev.put(CalendarContract.Events.DTSTART, start);
                    ev.put(CalendarContract.Events.DTEND, start + 30 * 60_000L);
                    ev.put(CalendarContract.Events.EVENT_TIMEZONE, localTz);
                    ev.put(CalendarContract.Events.ALL_DAY, 0);
                } else {
                    ev.put(CalendarContract.Events.DTSTART, start);
                    ev.put(CalendarContract.Events.DTEND, start + 24 * 3600_000L);
                    ev.put(CalendarContract.Events.EVENT_TIMEZONE, "UTC");
                    ev.put(CalendarContract.Events.ALL_DAY, 1);
                }
                wanted.add(uid);

                Long eventId = findByUid(existing, uid);
                if (eventId != null) {
                    Uri uri = ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, eventId);
                    ctx.getContentResolver().update(uri, ev, null, null);
                    // 重建提醒，保证与最新状态一致
                    ctx.getContentResolver().delete(
                            CalendarContract.Reminders.CONTENT_URI,
                            CalendarContract.Reminders.EVENT_ID + "=?",
                            new String[]{String.valueOf(eventId)});
                    if (timed) insertReminder(ctx, eventId);
                } else {
                    Uri created = ctx.getContentResolver()
                            .insert(CalendarContract.Events.CONTENT_URI, ev);
                    if (created != null && timed) {
                        insertReminder(ctx, ContentUris.parseId(created));
                    }
                }
            }

            // 删除本应用中已不存在（完成/删日期/被删除）的事件
            for (Map.Entry<Long, String> e : existing.entrySet()) {
                if (!wanted.contains(e.getValue())) {
                    Uri uri = ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, e.getKey());
                    ctx.getContentResolver().delete(uri, null, null);
                }
            }
            return "ok";
        } catch (Exception e) {
            return "error:" + e.getMessage();
        }
    }

    /** 关闭同步时调用：连日历一起删除（重新开启时 ensureCalendar 会重建）。 */
    static synchronized boolean clearCalendar(Context ctx) {
        if (!hasPermission(ctx)) return false;
        try (Cursor c = ctx.getContentResolver().query(
                CalendarContract.Calendars.CONTENT_URI,
                new String[]{CalendarContract.Calendars._ID},
                CalendarContract.Calendars.ACCOUNT_NAME + "=? AND "
                        + CalendarContract.Calendars.ACCOUNT_TYPE + "=?",
                new String[]{ACCOUNT_NAME, CalendarContract.ACCOUNT_TYPE_LOCAL},
                null)) {
            boolean ok = true;
            if (c != null) {
                while (c.moveToNext()) {
                    Uri uri = asSyncAdapter(ContentUris.withAppendedId(
                            CalendarContract.Calendars.CONTENT_URI, c.getLong(0)));
                    ok &= ctx.getContentResolver().delete(uri, null, null) > 0;
                }
            }
            return ok;
        } catch (Exception e) {
            return false;
        }
    }

    /** 找到（或创建）本应用日历，返回 calendar_id；失败返回 -1。 */
    private static long ensureCalendar(Context ctx) {
        try (Cursor c = ctx.getContentResolver().query(
                CalendarContract.Calendars.CONTENT_URI,
                new String[]{CalendarContract.Calendars._ID},
                CalendarContract.Calendars.ACCOUNT_NAME + "=? AND "
                        + CalendarContract.Calendars.ACCOUNT_TYPE + "=?",
                new String[]{ACCOUNT_NAME, CalendarContract.ACCOUNT_TYPE_LOCAL},
                null)) {
            if (c != null && c.moveToFirst()) {
                return c.getLong(0);
            }
        } catch (Exception ignored) {
        }
        ContentValues v = new ContentValues();
        v.put(CalendarContract.Calendars.ACCOUNT_NAME, ACCOUNT_NAME);
        v.put(CalendarContract.Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL);
        v.put(CalendarContract.Calendars.NAME, ACCOUNT_NAME);
        v.put(CalendarContract.Calendars.CALENDAR_DISPLAY_NAME, CALENDAR_NAME);
        v.put(CalendarContract.Calendars.CALENDAR_COLOR, Color.parseColor("#5B7C5D"));
        v.put(CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL,
                CalendarContract.Calendars.CAL_ACCESS_OWNER);
        v.put(CalendarContract.Calendars.OWNER_ACCOUNT, ACCOUNT_NAME);
        v.put(CalendarContract.Calendars.VISIBLE, 1);
        v.put(CalendarContract.Calendars.SYNC_EVENTS, 1);
        try {
            Uri created = ctx.getContentResolver()
                    .insert(asSyncAdapter(CalendarContract.Calendars.CONTENT_URI), v);
            return created == null ? -1 : ContentUris.parseId(created);
        } catch (Exception e) {
            return -1;
        }
    }

    /** 本地账户的日历写入必须伪装 sync adapter 身份。 */
    private static Uri asSyncAdapter(Uri uri) {
        return uri.buildUpon()
                .appendQueryParameter(CalendarContract.CALLER_IS_SYNCADAPTER, "true")
                .appendQueryParameter(CalendarContract.Calendars.ACCOUNT_NAME, ACCOUNT_NAME)
                .appendQueryParameter(CalendarContract.Calendars.ACCOUNT_TYPE,
                        CalendarContract.ACCOUNT_TYPE_LOCAL)
                .build();
    }

    private static void insertReminder(Context ctx, long eventId) {
        ContentValues r = new ContentValues();
        r.put(CalendarContract.Reminders.EVENT_ID, eventId);
        r.put(CalendarContract.Reminders.MINUTES, 0);
        r.put(CalendarContract.Reminders.METHOD, CalendarContract.Reminders.METHOD_ALERT);
        ctx.getContentResolver().insert(CalendarContract.Reminders.CONTENT_URI, r);
    }

    private static Long findByUid(Map<Long, String> existing, String uid) {
        for (Map.Entry<Long, String> e : existing.entrySet()) {
            if (uid.equals(e.getValue())) return e.getKey();
        }
        return null;
    }

    private static String optStr(JSONObject obj, String key) {
        String v = obj.optString(key, null);
        return (v == null || v.isEmpty() || "null".equals(v)) ? null : v;
    }

    /** "yyyy-MM-dd'T'HH:mm[:ss]" → 设备本地墙钟毫秒（SimpleDateFormat 默认设备时区）。 */
    private static long parseLocal(String s) {
        try {
            String v = s.length() > 16 ? s.substring(0, 16) : s;
            Date d = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm", Locale.US).parse(v);
            return d == null ? -1 : d.getTime();
        } catch (Exception e) {
            return -1;
        }
    }

    /** "yyyy-MM-dd" → 当日 UTC 午夜毫秒（Android 全天事件惯例）。 */
    private static long parseDateUtc(String s) {
        try {
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            f.setTimeZone(TimeZone.getTimeZone("UTC"));
            Date d = f.parse(s.substring(0, Math.min(10, s.length())));
            return d == null ? -1 : d.getTime();
        } catch (Exception e) {
            return -1;
        }
    }
}
