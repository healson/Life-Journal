/**
 * Android APK 注入的日历桥（window.LifeJournalCalendar）封装。
 * 仅 APK 内可用；浏览器环境下 calendarBridge() 返回 null。
 * 开关状态存 localStorage，待办变化后由 store 调用 scheduleCalendarSync 防抖全量同步。
 */
import type { Todo } from "../types"

interface CalendarBridge {
  hasPermission(): boolean
  /** 返回 "ok" / "requesting"（权限弹窗中）/ "error:原因" */
  syncTodos(json: string): string
  clearTodos(): string
}

export function calendarBridge(): CalendarBridge | null {
  const b = (window as unknown as Record<string, unknown>).LifeJournalCalendar
  if (b && typeof (b as CalendarBridge).syncTodos === "function") {
    return b as CalendarBridge
  }
  return null
}

const KEY = "lj_calendar_sync"

export function isCalendarSyncEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === "1"
  } catch {
    return false
  }
}

export function setCalendarSyncEnabled(v: boolean) {
  try {
    localStorage.setItem(KEY, v ? "1" : "0")
  } catch {
    /* localStorage 不可用时静默 */
  }
}

/** 同步载荷：与原生 CalendarSync 约定的小写蛇形无关，直接 camelCase 字段。 */
function toPayload(todos: Todo[]) {
  return todos.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description ?? null,
    priority: t.priority,
    status: t.status,
    dueDate: t.dueDate ?? null,
    remindAt: t.remindAt ?? null,
  }))
}

/** 立即全量同步；返回桥的结果字符串。 */
export function syncNow(todos: Todo[]): string {
  const b = calendarBridge()
  if (!b) return "unavailable"
  try {
    return b.syncTodos(JSON.stringify(toPayload(todos)))
  } catch {
    return "error"
  }
}

export function clearCalendarEvents(): string {
  const b = calendarBridge()
  if (!b) return "unavailable"
  try {
    return b.clearTodos()
  } catch {
    return "error"
  }
}

let timer: ReturnType<typeof setTimeout> | undefined

/** 待办变化后调用；开关开启且桥可用时，防抖 1.2s 做一次全量同步（连续编辑合并为一次写日历）。 */
export function scheduleCalendarSync(getTodos: () => Todo[]) {
  if (!isCalendarSyncEnabled() || !calendarBridge()) return
  clearTimeout(timer)
  timer = setTimeout(() => syncNow(getTodos()), 1200)
}

/**
 * 注册权限结果回调（原生申请完日历权限后调用）。
 * granted=true 时由调用方决定立即同步；返回清理函数。
 */
export function onCalendarPermissionResult(cb: (granted: boolean) => void): () => void {
  const w = window as unknown as Record<string, unknown>
  const prev = w.__onCalendarPermission
  w.__onCalendarPermission = cb
  return () => {
    if (w.__onCalendarPermission === cb) {
      w.__onCalendarPermission = prev
    }
  }
}
