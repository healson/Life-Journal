package com.healson.lifejournal;

import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Environment;

/** 普通 http(s) 文件下载走系统 DownloadManager。 */
final class DownloadManagerRequestShim {

    private DownloadManagerRequestShim() {
    }

    static void enqueue(Context context, String url, String userAgent, String fileName, String mimeType) {
        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
        if (mimeType != null && !mimeType.isEmpty()) {
            request.setMimeType(mimeType);
        }
        if (userAgent != null && !userAgent.isEmpty()) {
            request.addRequestHeader("User-Agent", userAgent);
        }
        request.setTitle(fileName);
        DownloadManager dm = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
        if (dm != null) {
            dm.enqueue(request);
        }
    }
}
