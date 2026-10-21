package com.healson.lifejournal;

import android.annotation.SuppressLint;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.os.Message;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.net.http.SslError;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.SslErrorHandler;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;

import org.json.JSONObject;

import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * WebView 壳：直连飞牛 NAS 上的人生记趣录网页版。
 * 首次启动输入 NAS 的 IP 与端口，之后记住；左下角齿轮可随时修改。
 */
public class MainActivity extends AppCompatActivity {

    private static final String PREFS = "lj_prefs";
    private static final String KEY_HOST = "host";
    private static final String KEY_PORT = "port";
    private static final String KEY_SCHEME = "scheme";
    private static final String DEFAULT_SCHEME = "http";
    private static final int REQ_CHOOSE_FILE = 1101;
    private static final int REQ_CALENDAR_PERM = 1102;
    private static final String DEFAULT_PORT = "8080";

    private WebView webView;
    private View setupView;
    private View errorView;
    private View gearButton;
    private TextView errorMsg;
    private ProgressBar progressBar;
    private SharedPreferences prefs;
    /** 页面脚本错误缓冲，空白页诊断时展示最近一条。 */
    private final List<String> consoleErrors = new ArrayList<>();
    /** PDF 导出用的临时打印窗口。 */
    private WebView popupWebView;

    private ValueCallback<Uri[]> fileCallback;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        // 允许 chrome://inspect 远程排查页面问题
        WebView.setWebContentsDebuggingEnabled(true);
        webView = findViewById(R.id.webView);
        setupView = findViewById(R.id.setupView);
        errorView = findViewById(R.id.errorView);
        gearButton = findViewById(R.id.gearButton);
        errorMsg = findViewById(R.id.errorMsg);
        progressBar = findViewById(R.id.progressBar);

        setupWebView();

        findViewById(R.id.btnConnect).setOnClickListener(v -> connectFromSetup());
        gearButton.setOnClickListener(v -> showServerDialog());
        findViewById(R.id.btnRetry).setOnClickListener(v -> {
            errorView.setVisibility(View.GONE);
            progressBar.setVisibility(View.VISIBLE);
            webView.reload();
        });
        findViewById(R.id.btnSettingsFromError).setOnClickListener(v -> showServerDialog());

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (setupView.getVisibility() == View.VISIBLE) {
                    finish();
                } else if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    finish();
                }
            }
        });

        String host = prefs.getString(KEY_HOST, "");
        if (host.isEmpty()) {
            showSetup();
        } else {
            showWeb();
            boolean restored = false;
            if (savedInstanceState != null) {
                restored = webView.restoreState(savedInstanceState) != null;
            }
            if (!restored) {
                webView.loadUrl(baseUrl());
            }
        }
    }

    // ---------- 配置页 ----------

    private void showSetup() {
        setupView.setVisibility(View.VISIBLE);
        webView.setVisibility(View.INVISIBLE);
        gearButton.setVisibility(View.GONE);
        // 登录页留空：无预置、无提示
        ((EditText) findViewById(R.id.inputHost)).setText("");
    }

    private void showWeb() {
        setupView.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
    }

    private void connectFromSetup() {
        EditText hostInput = findViewById(R.id.inputHost);
        ServerInput server = parseServer(hostInput.getText().toString());
        if (server.host.isEmpty()) {
            hostInput.setError("请输入服务器地址");
            hostInput.requestFocus();
            return;
        }
        prefs.edit()
                .putString(KEY_SCHEME, server.scheme)
                .putString(KEY_HOST, server.host)
                .putString(KEY_PORT, server.port)
                .apply();
        showWeb();
        webView.loadUrl(baseUrl());
    }

    private void showServerDialog() {
        View form = getLayoutInflater().inflate(R.layout.dialog_server, null);
        EditText hostEt = form.findViewById(R.id.dialogHost);
        // 预填完整地址（协议://主机:端口），与登录页输入方式一致
        String base = baseUrl();
        hostEt.setText(base.endsWith("/") ? base.substring(0, base.length() - 1) : base);

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("服务器设置")
                .setView(form)
                .setPositiveButton("保存并重连", null)
                .setNegativeButton("取消", null)
                .create();
        dialog.setOnShowListener(l -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            ServerInput server = parseServer(hostEt.getText().toString());
            if (server.host.isEmpty()) {
                hostEt.setError("请输入服务器地址");
                hostEt.requestFocus();
                return;
            }
            prefs.edit()
                    .putString(KEY_SCHEME, server.scheme)
                    .putString(KEY_HOST, server.host)
                    .putString(KEY_PORT, server.port)
                    .apply();
            dialog.dismiss();
            errorView.setVisibility(View.GONE);
            showWeb();
            webView.loadUrl(baseUrl());
        }));
        dialog.show();
    }

    /** 解析出的服务器地址（协议 + 主机 + 端口）。 */
    private static final class ServerInput {
        final String scheme;
        final String host;
        final String port;

        ServerInput(String scheme, String host, String port) {
            this.scheme = scheme;
            this.host = host;
            this.port = port;
        }
    }

    /**
     * 支持两种输入（单一地址框，无端口栏）：
     * 1. 完整 URL（如 https://life.yilei.fun:10086）→ 协议与端口以输入为准，无端口则按协议默认端口；
     * 2. 仅域名/IP（可带 :端口）→ 协议沿用已保存值，未写端口时默认 8080（本项目 NAS 映射端口）。
     */
    private ServerInput parseServer(String raw) {
        String h = raw == null ? "" : raw.trim();
        String scheme = prefs.getString(KEY_SCHEME, DEFAULT_SCHEME);
        String explicitPort = null;
        boolean hasScheme = false;
        if (h.regionMatches(true, 0, "https://", 0, 8)) {
            scheme = "https";
            h = h.substring(8);
            hasScheme = true;
        } else if (h.regionMatches(true, 0, "http://", 0, 7)) {
            scheme = "http";
            h = h.substring(7);
            hasScheme = true;
        }
        int slash = h.indexOf('/');
        if (slash >= 0) h = h.substring(0, slash);
        int query = h.indexOf('?');
        if (query >= 0) h = h.substring(0, query);
        int colon = h.lastIndexOf(':');
        if (colon > 0 && h.indexOf(']') < colon) { // 排除 IPv6 字面量
            explicitPort = h.substring(colon + 1).trim();
            h = h.substring(0, colon);
        }
        h = h.trim();

        String port;
        if (explicitPort != null && !explicitPort.isEmpty()) {
            port = explicitPort;
        } else if (hasScheme) {
            // 带协议的完整 URL 未写端口 → 使用协议默认端口（80/443），URL 中不拼端口
            port = "";
        } else {
            port = DEFAULT_PORT;
        }
        if (!port.isEmpty() && !port.matches("\\d{1,5}")) {
            port = DEFAULT_PORT;
        }
        return new ServerInput(scheme.toLowerCase(Locale.ROOT), h, port);
    }

    private String baseUrl() {
        String scheme = prefs.getString(KEY_SCHEME, DEFAULT_SCHEME);
        String host = prefs.getString(KEY_HOST, "");
        String port = prefs.getString(KEY_PORT, DEFAULT_PORT);
        return scheme + "://" + host + (port.isEmpty() ? "" : ":" + port) + "/";
    }

    private boolean isSavedHost(Uri uri) {
        String host = prefs.getString(KEY_HOST, "");
        return uri.getHost() != null && uri.getHost().equalsIgnoreCase(host);
    }

    // ---------- WebView ----------

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // JWT / 闲置登出时间戳存 localStorage
        s.setDatabaseEnabled(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);

        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);

        // 待办 → 系统日历同步桥（前端检测 window.LifeJournalCalendar 判断是否可用）
        webView.addJavascriptInterface(new CalendarJsBridge(), "LifeJournalCalendar");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
                if ("http".equals(scheme) || "https".equals(scheme)) {
                    if (isSavedHost(u)) {
                        return false; // NAS 内链接，应用内打开
                    }
                    openExternal(u);
                    return true;
                }
                if ("about".equals(scheme)) {
                    return false;
                }
                openExternal(u); // mailto: 等交由系统处理
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    errorView.setVisibility(View.VISIBLE);
                    gearButton.setVisibility(View.GONE);
                    errorMsg.setText("无法连接到 " + baseUrl() + "\n请确认 NAS 已启动、地址与手机在同一网络");
                }
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                // 新一轮加载开始，清掉上一次的错误页与脚本错误缓冲；若仍失败 onReceivedError 会再次显示
                errorView.setVisibility(View.GONE);
                consoleErrors.clear();
                progressBar.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                if (errorView.getVisibility() != View.VISIBLE) {
                    gearButton.setVisibility(View.VISIBLE);
                }
                // 空白页诊断：加载完成 2000ms 后判定，避免慢设备 React 未挂载完误报
                scheduleBlankCheck(view, 2000);
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel(); // 不放行不安全证书
                final String errUrl = error.getUrl();
                final String reason = sslReason(error.getPrimaryError());
                runOnUiThread(() -> {
                    if (errUrl != null && errUrl.startsWith(baseUrl())) {
                        errorView.setVisibility(View.VISIBLE);
                        gearButton.setVisibility(View.GONE);
                        progressBar.setVisibility(View.GONE);
                        errorMsg.setText("HTTPS 证书错误：" + reason + "\n地址：" + errUrl);
                    }
                });
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
                if (newProgress >= 100) {
                    progressBar.setVisibility(View.GONE);
                }
            }

            // 收集页面脚本错误，空白页诊断时展示
            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                if (consoleMessage != null
                        && consoleMessage.messageLevel() == ConsoleMessage.MessageLevel.ERROR
                        && consoleErrors.size() < 5) {
                    consoleErrors.add(consoleMessage.message()
                            + " (" + consoleMessage.sourceId() + ":" + consoleMessage.lineNumber() + ")");
                }
                return super.onConsoleMessage(consoleMessage);
            }

            // 图片上传（ToolBar）与 JSON 备份导入（SettingsModal）
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                }
                fileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                String[] accept = params.getAcceptTypes();
                if (accept != null && accept.length > 0 && accept[0] != null
                        && !accept[0].trim().isEmpty()) {
                    intent.putExtra(Intent.EXTRA_MIME_TYPES, accept);
                }
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    startActivityForResult(Intent.createChooser(intent, "选择文件"), REQ_CHOOSE_FILE);
                } catch (Exception e) {
                    ValueCallback<Uri[]> cb = fileCallback;
                    fileCallback = null;
                    if (cb != null) cb.onReceiveValue(null);
                }
                return true;
            }

            // PDF 导出：window.open("", "_blank") + win.print()
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture,
                                          Message resultMsg) {
                // 复用前先移除上一次的打印窗口，避免累积
                if (popupWebView != null) {
                    FrameLayout frame = findViewById(R.id.mainFrame);
                    frame.removeView(popupWebView);
                    popupWebView = null;
                }
                WebView nw = new WebView(MainActivity.this);
                WebSettings ns = nw.getSettings();
                ns.setJavaScriptEnabled(true);
                ns.setDomStorageEnabled(true);
                ns.setUseWideViewPort(true);
                nw.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                        Uri u = request.getUrl();
                        if (isSavedHost(u)) {
                            return false;
                        }
                        openExternal(u);
                        return true;
                    }
                });
                nw.setWebChromeClient(new WebChromeClient());
                nw.setDownloadListener(MainActivity.this::onDownloadStart);
                // 隐藏挂载：JS 与打印渲染都正常，1px 不可见
                FrameLayout frame = findViewById(R.id.mainFrame);
                FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(1, 1);
                frame.addView(nw, lp);
                nw.setAlpha(0f);
                popupWebView = nw;

                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(nw);
                resultMsg.sendToTarget();
                return true;
            }
        });

        webView.setDownloadListener(this::onDownloadStart);
    }

    // ---------- 文件选择结果 ----------

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_CHOOSE_FILE) return;
        ValueCallback<Uri[]> cb = fileCallback;
        fileCallback = null;
        if (cb == null) return;
        if (resultCode != RESULT_OK || data == null) {
            cb.onReceiveValue(null);
            return;
        }
        Uri[] uris;
        ClipData clip = data.getClipData();
        if (clip != null && clip.getItemCount() > 0) {
            uris = new Uri[clip.getItemCount()];
            for (int i = 0; i < clip.getItemCount(); i++) {
                uris[i] = clip.getItemAt(i).getUri();
            }
        } else if (data.getData() != null) {
            uris = new Uri[]{data.getData()};
        } else {
            cb.onReceiveValue(null);
            return;
        }
        cb.onReceiveValue(uris);
    }

    // ---------- 下载：blob 导出（md/doc/备份 JSON）与普通 http ----------

    private void onDownloadStart(String url, String userAgent, String contentDisposition,
                                 String mimeType, long contentLength) {
        if (url != null && url.startsWith("blob:")) {
            fetchBlobViaJs(url, contentDisposition, mimeType);
            return;
        }
        try {
            String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
            DownloadManagerRequestShim.enqueue(this, url, userAgent, name, mimeType);
        } catch (Exception e) {
            toast("下载失败：" + e.getMessage());
        }
    }

    /**
     * WebView 的 DownloadListener 拿到 blob: 无法直接下载，
     * 改为在页面内 fetch 后回传 base64，再写入系统「下载」目录。
     */
    private void fetchBlobViaJs(String blobUrl, String contentDisposition, String mimeType) {
        String js = "(async()=>{try{"
                + "const r=await fetch(" + JSONObject.quote(blobUrl) + ");"
                + "const b=new Uint8Array(await r.arrayBuffer());"
                + "let s='';const C=8192;"
                + "for(let i=0;i<b.length;i+=C){s+=String.fromCharCode.apply(null,b.subarray(i,i+C));}"
                + "return JSON.stringify({ok:1,d:btoa(s)});"
                + "}catch(e){return JSON.stringify({ok:0,e:String(e)});}})()";
        webView.evaluateJavascript(js, value -> {
            try {
                JSONObject obj = new JSONObject(value == null ? "null" : value);
                if (obj.optInt("ok") != 1) {
                    toast("导出失败：" + obj.optString("e"));
                    return;
                }
                byte[] bytes = Base64.decode(obj.getString("d"), Base64.DEFAULT);
                String name = resolveFileName(blobUrl, contentDisposition, mimeType);
                saveBytesToDownloads(name, mimeType, bytes);
            } catch (Exception e) {
                toast("导出失败：" + e.getMessage());
            }
        });
    }

    private String resolveFileName(String url, String contentDisposition, String mimeType) {
        String stamp = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.getDefault()).format(new Date());
        String ext = extOf(mimeType);
        if (contentDisposition == null || contentDisposition.trim().isEmpty()) {
            return "人生记趣录-" + stamp + ext;
        }
        String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
        if (name == null || name.isEmpty()) {
            return "人生记趣录-" + stamp + ext;
        }
        return name;
    }

    private String extOf(String mimeType) {
        if (mimeType == null) return ".bin";
        String m = mimeType.toLowerCase(Locale.ROOT);
        if (m.contains("markdown")) return ".md";
        if (m.contains("json")) return ".json";
        if (m.contains("html")) return ".html";
        if (m.contains("msword")) return ".doc";
        if (m.contains("plain")) return ".txt";
        String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(m);
        return ext == null ? ".bin" : "." + ext;
    }

    private void saveBytesToDownloads(String name, String mimeType, byte[] data) {
        try {
            ContentValues cv = new ContentValues();
            cv.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            cv.put(MediaStore.MediaColumns.MIME_TYPE,
                    (mimeType == null || mimeType.isEmpty()) ? "application/octet-stream" : mimeType);
            cv.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
            if (uri == null) throw new IllegalStateException("无法创建文件");
            try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                if (os == null) throw new IllegalStateException("无法写入文件");
                os.write(data);
            }
            toast("已保存到「下载」：" + name);
        } catch (Exception e) {
            toast("保存失败：" + e.getMessage());
        }
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception e) {
            toast("没有可打开该链接的应用");
        }
    }

    /**
     * 空白页诊断：页面结束后检查 SPA 挂载点 #root 是否渲染出内容；
     * 仍为空则显示错误页并附上捕获到的脚本错误，便于定位「一片空白」的原因。
     */
    private void scheduleBlankCheck(final WebView view, long delayMs) {
        view.postDelayed(() -> {
            if (errorView.getVisibility() == View.VISIBLE) return;
            view.evaluateJavascript(
                    "(function(){var r=document.getElementById('root');return r?r.childElementCount:-1;})()",
                    value -> {
                        if (errorView.getVisibility() == View.VISIBLE) return;
                        // 0 = 挂载点为空；-1 = 无挂载点（非预期页面）
                        if (!"0".equals(value) && !"-1".equals(value)) return;
                        errorView.setVisibility(View.VISIBLE);
                        gearButton.setVisibility(View.GONE);
                        progressBar.setVisibility(View.GONE);
                        StringBuilder sb = new StringBuilder();
                        sb.append("页面加载成功，但内容为空白\n地址：").append(view.getUrl());
                        if (!consoleErrors.isEmpty()) {
                            sb.append("\n\n脚本错误：\n")
                              .append(consoleErrors.get(consoleErrors.size() - 1));
                        } else {
                            sb.append("\n\n未捕获到脚本错误，可点「重试」再试");
                        }
                        errorMsg.setText(sb.toString());
                    });
        }, delayMs);
    }

    private String sslReason(int primaryError) {
        switch (primaryError) {
            case SslError.SSL_NOTYETVALID: return "证书尚未生效";
            case SslError.SSL_EXPIRED: return "证书已过期";
            case SslError.SSL_IDMISMATCH: return "证书域名不匹配";
            case SslError.SSL_UNTRUSTED: return "证书颁发机构不受信任";
            case SslError.SSL_DATE_INVALID: return "证书日期无效";
            default: return "安全校验未通过（错误码 " + primaryError + "）";
        }
    }

    private void toast(String msg) {
        runOnUiThread(() -> Toast.makeText(this, msg, Toast.LENGTH_LONG).show());
    }

    // ---------- 待办 → 系统日历同步桥 ----------

    /**
     * 注入为 window.LifeJournalCalendar。方法运行在 WebView 私有线程，
     * ContentResolver 读写可直接进行；权限申请必须切回 UI 线程。
     */
    private final class CalendarJsBridge {
        @JavascriptInterface
        public boolean hasPermission() {
            return CalendarSync.hasPermission(MainActivity.this);
        }

        /**
         * 全量同步待办（json 为 Todo 数组）。
         * 返回 "ok" / "requesting"（已弹权限框，结果经 window.__onCalendarPermission 回调）/ "error:原因"。
         */
        @JavascriptInterface
        public String syncTodos(String todosJson) {
            if (!CalendarSync.hasPermission(MainActivity.this)) {
                runOnUiThread(() -> ActivityCompat.requestPermissions(
                        MainActivity.this,
                        new String[]{
                                android.Manifest.permission.READ_CALENDAR,
                                android.Manifest.permission.WRITE_CALENDAR,
                        },
                        REQ_CALENDAR_PERM));
                return "requesting";
            }
            return CalendarSync.syncTodos(MainActivity.this, todosJson);
        }

        /** 关闭同步时清除已写入的日历与全部事件。 */
        @JavascriptInterface
        public String clearTodos() {
            if (!CalendarSync.hasPermission(MainActivity.this)) return "no_permission";
            return CalendarSync.clearCalendar(MainActivity.this) ? "ok" : "error";
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQ_CALENDAR_PERM) return;
        boolean granted = true;
        for (int r : grantResults) {
            if (r != PackageManager.PERMISSION_GRANTED) {
                granted = false;
                break;
            }
        }
        if (grantResults.length == 0) granted = false;
        // 通知页面权限结果，前端据此立即同步或提示
        webView.evaluateJavascript(
                "(window.__onCalendarPermission && window.__onCalendarPermission(" + granted + ")) || 0",
                null);
    }

    // ---------- 状态保存 ----------

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (setupView.getVisibility() != View.VISIBLE && webView != null) {
            webView.saveState(outState);
        }
    }
}
