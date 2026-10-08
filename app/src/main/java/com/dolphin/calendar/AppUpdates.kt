package com.dolphin.calendar

import android.app.AlarmManager
import android.app.DownloadManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.os.Build
import org.json.JSONObject
import java.net.URL
import java.time.LocalDate
import java.time.ZoneId
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.CopyOnWriteArrayList
import javax.net.ssl.HttpsURLConnection

object AppUpdates {
    const val RELEASES = "https://github.com/tequed232/Dolphin-Calendar/releases"
    private const val API = "https://api.github.com/repos/tequed232/Dolphin-Calendar/releases/latest"
    private val busy = AtomicBoolean(false)
    private val observers = CopyOnWriteArrayList<() -> Unit>()
    fun observe(listener: () -> Unit): () -> Unit { observers.add(listener); return { observers.remove(listener) } }
    private fun changed() { observers.forEach { runCatching { it() } } }
    private fun prefs(context: Context) = context.getSharedPreferences("updates", Context.MODE_PRIVATE)
    private fun settings(context: Context) = ReminderScheduler.settings(context)

    fun state(context: Context): JSONObject {
        val saved = prefs(context)
        val release = runCatching { JSONObject(saved.getString("release", "{}")!!) }.getOrDefault(JSONObject())
        val available = UpdateVersion.newer(release.optString("version"), BuildConfig.VERSION_NAME)
        val result = JSONObject().put("installed", BuildConfig.VERSION_NAME).put("available", available)
            .put("busy", busy.get()).put("checkedAt", saved.getLong("checkedAt", 0))
            .put("message", saved.getString("message", "尚未检查更新"))
            .put("release", if (release.has("version")) release else JSONObject.NULL)
        if (saved.getString("downloadVersion", "") == release.optString("version") && saved.getLong("downloadId", 0) > 0) {
            val manager = context.getSystemService(DownloadManager::class.java)
            runCatching {
                manager.query(DownloadManager.Query().setFilterById(saved.getLong("downloadId", 0))).use { cursor ->
                    if (cursor.moveToFirst()) {
                        val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
                        result.put("download", when (status) { DownloadManager.STATUS_SUCCESSFUL -> "complete"; DownloadManager.STATUS_FAILED -> "failed"; else -> "running" })
                        result.put("downloaded", cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)))
                        result.put("total", cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)))
                    }
                }
            }
        }
        return result
    }

    fun schedule(context: Context) {
        val alarm = context.getSystemService(AlarmManager::class.java)
        val pending = PendingIntent.getBroadcast(context, 401, Intent(context, UpdateCheckReceiver::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        alarm.cancel(pending)
        if (!settings(context).optBoolean("autoUpdate", true)) return
        // One inexact daily check; no boot, exact-alarm, or foreground-service permission.
        val tomorrow = LocalDate.now().plusDays(1).atTime(9, 0).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
        alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, tomorrow, pending)
    }

    fun check(context: Context, force: Boolean = false, finished: (JSONObject) -> Unit = {}) {
        val app = context.applicationContext
        val saved = prefs(app)
        val today = LocalDate.now().toString()
        if ((!force && (!settings(app).optBoolean("autoUpdate", true) || saved.getString("attemptDay", "") == today)) || !busy.compareAndSet(false, true)) {
            finished(state(app)); return
        }
        saved.edit().putString("attemptDay", today).apply()
        changed()
        Thread {
            try {
                val connection = URL(API).openConnection() as HttpsURLConnection
                connection.connectTimeout = 5000; connection.readTimeout = 5000; connection.instanceFollowRedirects = false
                connection.setRequestProperty("Accept", "application/vnd.github+json")
                connection.setRequestProperty("X-GitHub-Api-Version", "2022-11-28")
                connection.setRequestProperty("User-Agent", "Dolphin-Calendar/${BuildConfig.VERSION_NAME}")
                try {
                    when (connection.responseCode) {
                        404 -> saved.edit().remove("release").putLong("checkedAt", System.currentTimeMillis()).putString("message", "GitHub 尚未发布正式版本").apply()
                        200 -> {
                            val bytes = connection.inputStream.use { input ->
                                val output = java.io.ByteArrayOutputStream()
                                val buffer = ByteArray(8192)
                                while (output.size() <= 2_000_000) { val count = input.read(buffer); if (count < 0) break; output.write(buffer, 0, count) }
                                output.toByteArray()
                            }
                            check(bytes.size <= 2_000_000) { "版本信息过大" }
                            val raw = JSONObject(bytes.toString(Charsets.UTF_8))
                            check(!raw.optBoolean("draft") && !raw.optBoolean("prerelease")) { "不是正式版本" }
                            val version = raw.getString("tag_name")
                            check(Regex("^[vV]?\\d{1,4}\\.\\d{1,4}\\.\\d{1,4}$").matches(version)) { "版本号格式不支持" }
                            val page = raw.getString("html_url")
                            check(trustedRelease(page)) { "更新页面地址不匹配" }
                            val release = JSONObject().put("version", version).put("url", page).put("notes", raw.optString("body").take(12000)).put("title", raw.optString("name", version)).put("publishedAt", raw.optString("published_at"))
                            val assets = raw.optJSONArray("assets")
                            val candidates = (0 until (assets?.length() ?: 0)).map { assets!!.getJSONObject(it) }.filter {
                                it.optString("name").endsWith(".apk", true) && !it.optString("name").contains("debug", true) && trustedAsset(it.optString("browser_download_url"))
                            }
                            val asset = candidates.firstOrNull { it.optString("name").contains("universal", true) } ?: candidates.singleOrNull()
                            if (asset != null) release.put("assetUrl", asset.getString("browser_download_url")).put("assetSize", asset.optLong("size")).put("assetName", asset.getString("name"))
                            saved.edit().putString("release", release.toString()).putLong("checkedAt", System.currentTimeMillis())
                                .putString("message", if (UpdateVersion.newer(version, BuildConfig.VERSION_NAME)) "发现新版本 $version" else "当前已是最新正式版本").apply()
                        }
                        403, 429 -> error("GitHub 暂时限制请求，请稍后重试")
                        else -> error("GitHub 暂时不可用（${connection.responseCode}）")
                    }
                } finally { connection.disconnect() }
            } catch (_: Exception) {
                // Preserve a previously discovered release when offline or a request fails.
                saved.edit().putString("message", "检查未完成，请检查网络后重试；已保留上次版本信息").apply()
            } finally {
                busy.set(false)
                runCatching { schedule(app) }
                changed()
                finished(state(app))
            }
        }.start()
    }

    private fun trustedRelease(value: String): Boolean = runCatching { val uri = Uri.parse(value); uri.scheme == "https" && uri.host == "github.com" && uri.userInfo == null && uri.port == -1 && uri.path?.startsWith("/tequed232/Dolphin-Calendar/releases/tag/") == true }.getOrDefault(false)
    private fun trustedAsset(value: String): Boolean = runCatching { val uri = Uri.parse(value); uri.scheme == "https" && uri.host == "github.com" && uri.userInfo == null && uri.port == -1 && uri.path?.startsWith("/tequed232/Dolphin-Calendar/releases/download/") == true }.getOrDefault(false)

    fun download(context: Context) {
        check(settings(context).optBoolean("directDownload", false)) { "请先开启应用内下载" }
        check(!BuildConfig.DEBUG) { "调试版请前往 GitHub 下载正式安装包" }
        val status = state(context)
        check(status.optBoolean("available")) { "没有可下载的新版本" }
        check(status.optString("download") != "running") { "安装包正在下载，请稍候" }
        val release = status.getJSONObject("release")
        val url = release.optString("assetUrl")
        check(trustedAsset(url)) { "该版本没有唯一可选的正式 APK，请前往 GitHub Release 选择" }
        val filename = "Dolphin-Calendar-${release.getString("version").removePrefix("v").removePrefix("V")}-${System.currentTimeMillis()}.apk"
        val request = DownloadManager.Request(Uri.parse(url)).setTitle("Dolphin Calendar ${release.getString("version")}")
            .setDescription("完成后点开系统下载列表，由你确认安装")
            .setMimeType("application/vnd.android.package-archive")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
        // Android 10+ hides app-private downloads in the system Downloads UI.
        // Its DownloadManager can write to public Downloads without a storage permission.
        if (Build.VERSION.SDK_INT >= 29) request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename)
        else request.setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, filename)
        val id = context.getSystemService(DownloadManager::class.java).enqueue(request)
        prefs(context).edit().putLong("downloadId", id).putString("downloadVersion", release.getString("version")).apply()
    }
}

class UpdateCheckReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        AppUpdates.check(context) { pending.finish() }
    }
}
