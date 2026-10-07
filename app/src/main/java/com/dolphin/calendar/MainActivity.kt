package com.dolphin.calendar

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.DatePickerDialog
import android.app.NotificationManager
import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Rect
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.provider.Settings
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.WindowManager
import android.webkit.*
import android.window.BackEvent
import android.window.OnBackAnimationCallback
import android.window.OnBackInvokedDispatcher
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.io.File
import java.time.LocalDate

class MainActivity : Activity() {
    private lateinit var web: EdgeWebView
    private var canGoBack = false
    private var pageReady = false
    private var topInset = 0f
    private var bottomInset = 0f
    private var keyboardInset = 0f
    private var fullWindowHeight = 0f
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var captureUri: Uri? = null
    private var captureFile: File? = null
    private var lastBack = 0L
    private var systemPreview = false
    private var calendarAction: String? = null
    @Volatile private var calendarBusy = false
    private var pendingHoliday: JSONObject? = null
    @Volatile private var holidayBusy = false
    private var exportText: String? = null
    private var pendingTestNotification = false
    private var pendingJourney: JSONObject? = null
    private var stopObservingUpdates: (() -> Unit)? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        window.attributes = window.attributes.apply { preferredRefreshRate = windowManager.defaultDisplay.supportedModes.maxOfOrNull { it.refreshRate } ?: 60f }
        web = EdgeWebView()
        web.setBackgroundColor(Color.rgb(247,247,247))
        setContentView(web)
        stopObservingUpdates = AppUpdates.observe { updatesStatus() }
        with(web.settings) {
            javaScriptEnabled = true; domStorageEnabled = true
            allowFileAccess = false; allowContentAccess = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(false)
            mediaPlaybackRequiresUserGesture = true
        }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        val loader = WebViewAssetLoader.Builder().addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this)).build()
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest): WebResourceResponse? {
                return loader.shouldInterceptRequest(request.url)
                    ?: WebResourceResponse("text/plain", "utf-8", 403, "Offline only", emptyMap(), "外部资源不可用".byteInputStream())
            }
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest): Boolean {
                if(request.url.host == "appassets.androidplatform.net" && request.url.path?.startsWith("/assets/web/") == true) return false
                if(request.isForMainFrame && request.hasGesture()) openExternal(request.url)
                return true
            }
            override fun onPageFinished(view: WebView?, url: String?) { injectInsets() }
        }
        web.addJavascriptInterface(Bridge(), "Dolphin")
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView?, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null); fileCallback = callback
                captureFile?.delete(); captureFile = null; captureUri = null
                try {
                    if(params.isCaptureEnabled && params.acceptTypes.any { it.startsWith("image/") }) {
                        val folder = File(cacheDir, "captures").apply { mkdirs() }
                        val file = File.createTempFile("cover-", ".jpg", folder); captureFile = file
                        val uri = FileProvider.getUriForFile(this@MainActivity, "$packageName.files", file); captureUri = uri
                        val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT, uri)
                            .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        intent.clipData = ClipData.newRawUri("Dolphin cover", uri)
                        startActivityForResult(intent, 100)
                    } else {
                        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                        val types = params.acceptTypes.filter { it.isNotBlank() && !it.startsWith('.') }
                        intent.type = if(types.size == 1) types[0] else "*/*"
                        if(types.size > 1) intent.putExtra(Intent.EXTRA_MIME_TYPES, types.toTypedArray())
                        startActivityForResult(intent, 100)
                    }
                } catch(e: Exception) { fileCallback?.onReceiveValue(null); fileCallback = null; captureFile?.delete(); message("无法打开相机或文件选择器：${e.localizedMessage}") }
                return true
            }
        }
        ViewCompat.setOnApplyWindowInsetsListener(web) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            val density = resources.displayMetrics.density
            // 系统安全区固定到窗口边缘；键盘只让输入区域避让，不能推动 Dock。
            topInset = bars.top / density; bottomInset = bars.bottom / density
            keyboardInset = if(insets.isVisible(WindowInsetsCompat.Type.ime())) ime.bottom / density else 0f
            injectInsets(); updateGestureExclusion(); insets
        }
        web.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> injectInsets(); updateGestureExclusion() }
        if(Build.VERSION.SDK_INT >= 34) onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, object : OnBackAnimationCallback {
            override fun onBackStarted(event: BackEvent) { systemPreview = canGoBack; if(canGoBack) backPhase("start", 0f, event.touchX / web.width, event.touchY / web.height) }
            override fun onBackProgressed(event: BackEvent) { if(canGoBack) backPhase("progress", event.progress) }
            override fun onBackCancelled() { if(systemPreview) backPhase("cancel"); systemPreview = false }
            override fun onBackInvoked() { if(systemPreview) { backPhase("commit"); lastBack = android.os.SystemClock.elapsedRealtime(); systemPreview = false } else dispatchBack() }
        }) else if(Build.VERSION.SDK_INT >= 33) onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) { dispatchBack() }
        Notifications.channels(this)
        web.loadUrl("https://appassets.androidplatform.net/assets/web/index.html")
    }
    private fun injectInsets() {
        // 旧版 WebView/Android 可能缩小布局视口，仍用完整窗口高度定位底栏。
        val density = resources.displayMetrics.density
        if(Build.VERSION.SDK_INT >= 30) fullWindowHeight = windowManager.currentWindowMetrics.bounds.height() / density
        else if(keyboardInset == 0f || fullWindowHeight == 0f) fullWindowHeight = window.decorView.height / density
        web.evaluateJavascript("window.dolphinInsets?.($topInset,$bottomInset,$keyboardInset,$fullWindowHeight)", null)
    }
    private fun backPhase(phase: String, progress: Float = 0f, originX: Float = 0f, originY: Float = .65f) { web.evaluateJavascript("window.dolphinBack?.('${phase}',${progress},${originX},${originY})", null) }
    private fun dispatchBack() {
        val now = android.os.SystemClock.elapsedRealtime()
        if(now - lastBack < 350) return
        lastBack = now
        if(canGoBack) backPhase("back") else finish()
    }
    @Deprecated("旧系统返回入口仍需保留")
    @SuppressLint("GestureBackNavigation") // API 33+ 已注册原生回调；此方法只为 API 26–32 保留。
    override fun onBackPressed() { dispatchBack() }
    private fun updateGestureExclusion() {
        if(Build.VERSION.SDK_INT >= 29) {
            val dp = resources.displayMetrics.density
            // 系统单侧排除区域有 200dp 高度上限；其余边缘继续由系统预测返回接管。
            val middle = web.height / 2
            web.systemGestureExclusionRects = if(canGoBack) listOf(Rect(0, (middle-100*dp).toInt(), (24*dp).toInt(), (middle+100*dp).toInt())) else emptyList()
        }
    }
    private fun updatesStatus() { runOnUiThread { if(!isDestroyed) send(JSONObject().put("type","updateStatus").put("update",AppUpdates.state(this))) } }
    private fun send(event: JSONObject) { if(pageReady) web.evaluateJavascript("window.dolphinNative?.($event)", null) }
    private fun message(text: String) = send(JSONObject().put("type", "message").put("message", text))
    private fun openExternal(uri: Uri): Boolean {
        if(uri.scheme !in listOf("https", "geo", "amapuri", "baidumap")) { message("无法打开此导航地址"); return false }
        return try { startActivity(Intent(Intent.ACTION_VIEW, uri)); true } catch(_: Exception) { message("未找到可打开此地址的地图或浏览器，请先安装地图应用"); false }
    }
    private fun startJourney(data: JSONObject, canNotify: Boolean = true) {
        val uri = runCatching { Uri.parse(data.getString("url")) }.getOrNull() ?: run { message("无法打开此导航地址"); return }
        if(!openExternal(uri)) return
        val courseId = data.optString("courseId")
        Notifications.dismissCourse(this,courseId)
        if(!ReminderScheduler.settings(this).optBoolean("notificationsEnabled",true) || !ReminderScheduler.settings(this).optBoolean("journeyLive",true)) return
        if(canNotify && !Notifications.journey(this,courseId,data.optString("title"),data.optString("room"),uri.toString())) message("导航已打开；通知权限未开启，行程不会显示在通知栏")
        else if(!canNotify) message("导航已打开；未授予通知权限，行程不会显示在通知栏")
    }
    private fun theme() {
        if(Build.VERSION.SDK_INT >= 31) send(JSONObject().put("type", "theme").put("primary", String.format("#%06X", 0xFFFFFF and getColor(android.R.color.system_accent1_600))))
        send(JSONObject().put("type","systemTheme").put("dark",resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES))
    }
    private fun notifyPermission() { if(Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 200) }
    private fun calendarPermission() = checkSelfPermission(Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED &&
        checkSelfPermission(Manifest.permission.WRITE_CALENDAR) == PackageManager.PERMISSION_GRANTED
    private fun calendarResult(action: String, success: Boolean, text: String = "") {
        val permission = calendarPermission()
        val result = JSONObject().put("type", "calendarResult").put("action", action)
            .put("success", success).put("message", text).put("permission", permission).put("busy", calendarBusy)
        if(permission) {
            runCatching { result.put("count", CalendarSync.count(this)).put("canRestore", CalendarSync.canRestore(this)) }
        }
        runOnUiThread { send(result) }
    }
    private fun calendar(action: String) {
        if(calendarBusy) return
        calendarBusy = true
        if(!calendarPermission()) {
            calendarAction = action
            requestPermissions(arrayOf(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR), 201)
        } else executeCalendar(action)
    }
    private fun executeCalendar(action: String) {
        Thread {
            val result = runCatching { when(action) {
                "calendarClear" -> CalendarSync.clear(this)
                "calendarRestore" -> CalendarSync.restore(this)
                else -> CalendarSync.sync(this)
            } }
            calendarBusy = false
            calendarResult(action, result.isSuccess, result.getOrElse { "日历操作未完成：${it.localizedMessage}" })
        }.start()
    }
    private fun holidayPermission() = checkSelfPermission(Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED
    private fun holidayResult(request: JSONObject, success: Boolean, text: String = "", payload: JSONObject? = null) {
        val result = JSONObject().put("type", "holidayResult").put("action", request.optString("type"))
            .put("success", success).put("permission", holidayPermission()).put("message", text)
        // Match the selected sources and range even on a failure. Never return empty days/calendars on failure:
        // the web layer keeps its last successfully read cache when permissions or the provider are unavailable.
        if(request.optString("type") == "calendarHolidays") {
            result.put("from", request.optString("from")).put("to", request.optString("to"))
            request.optJSONArray("calendarIds")?.let { result.put("calendarIds", it) }
        }
        if(success && payload != null) payload.keys().forEach { key -> result.put(key, payload.get(key)) }
        runOnUiThread { if(!isFinishing && !isDestroyed) send(result) }
    }
    private fun holidays(request: JSONObject) {
        if(holidayBusy) { holidayResult(request, false, "正在读取系统日历，请稍后重试"); return }
        if(request.optString("type") == "calendarHolidays") {
            try { SystemHolidays.range(request) }
            catch(error: Exception) { holidayResult(request, false, error.localizedMessage ?: "请选择有效的日期范围和日历来源"); return }
        }
        holidayBusy = true
        if(!holidayPermission()) {
            pendingHoliday = JSONObject(request.toString())
            // Independent read-only flow; course calendar write permissions retain request code 201.
            try { requestPermissions(arrayOf(Manifest.permission.READ_CALENDAR), 204) }
            catch(error: Exception) {
                pendingHoliday = null; holidayBusy = false
                holidayResult(request, false, "无法申请日历读取权限：${error.localizedMessage ?: "请稍后重试"}")
            }
        } else executeHolidays(request)
    }
    private fun executeHolidays(request: JSONObject) {
        Thread {
            val result = runCatching {
                if(request.optString("type") == "holidayCalendars") JSONObject().put("calendars", SystemHolidays.calendars(this))
                else SystemHolidays.read(this, request)
            }
            holidayBusy = false
            result.fold(
                onSuccess = { holidayResult(request, true, payload = it) },
                onFailure = { holidayResult(request, false, if(it is SecurityException) "系统日历读取权限未开启，已保留上次读取结果" else "读取节假日未完成：${it.localizedMessage ?: "系统日历暂时不可用"}") }
            )
        }.start()
    }
    inner class Bridge {
        @JavascriptInterface fun postMessage(raw: String) {
            if(raw.length > 3_000_000) return
            runOnUiThread {
                try {
                    val data = JSONObject(raw)
                    when(data.getString("type")) {
                        "ready" -> { pageReady = true; injectInsets(); theme(); handleIntent(intent); updatesStatus(); AppUpdates.check(this@MainActivity) { updatesStatus() } }
                        "updateStatus" -> updatesStatus()
                        "checkUpdate" -> { AppUpdates.check(this@MainActivity, true) { updatesStatus() }; updatesStatus() }
                        "downloadUpdate" -> { AppUpdates.download(this@MainActivity); updatesStatus(); message("已交给系统下载，完成后可在下载列表打开安装包") }
                        "updateDownloads" -> startActivity(Intent(android.app.DownloadManager.ACTION_VIEW_DOWNLOADS))
                        "history" -> { canGoBack = data.optBoolean("canGoBack"); updateGestureExclusion() }
                        "exit" -> finish()
                        "haptic" -> web.performHapticFeedback(when(data.optString("kind")) { "confirm" -> if(Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.CLOCK_TICK; "edge" -> if(Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS; "heavy" -> HapticFeedbackConstants.LONG_PRESS; else -> HapticFeedbackConstants.CLOCK_TICK })
                        "date" -> { val date = runCatching { LocalDate.parse(data.optString("value")) }.getOrDefault(LocalDate.now()); DatePickerDialog(this@MainActivity, { _, y, m, d -> send(JSONObject().put("type","date").put("value",LocalDate.of(y,m+1,d).toString())) }, date.year, date.monthValue-1,date.dayOfMonth).show() }
                        "sync" -> { val settings=data.getJSONObject("settings"); getSharedPreferences("native", MODE_PRIVATE).edit().putString("schedule", data.getJSONObject("schedule").toString()).putString("settings", settings.toString()).putString("bookTitles", data.optJSONObject("bookTitles")?.toString() ?: "{}").apply(); ReminderScheduler.enqueue(this@MainActivity); AppUpdates.schedule(this@MainActivity); AppUpdates.check(this@MainActivity) { updatesStatus() }; if(!settings.optBoolean("notificationsEnabled",true)) Notifications.clearAll(this@MainActivity) else if(!settings.optBoolean("journeyLive",true)) Notifications.stopJourney(this@MainActivity) else Notifications.pet(this@MainActivity) }
                        "bookCovers" -> getSharedPreferences("native", MODE_PRIVATE).edit().putString("bookCovers",data.optJSONObject("covers")?.toString() ?: "{}").apply()
                        "notificationPermission" -> notifyPermission()
                        "notificationStatus" -> { val nm = getSystemService(NotificationManager::class.java); message("通知${if(nm.areNotificationsEnabled())"已允许" else "未允许"}；提醒由系统调度，省电状态下可能延迟；${ReminderScheduler.status(this@MainActivity)}") }
                        "liveNotificationStatus" -> Thread {
                            val result = runCatching {
                                if(Notifications.journeyActive(this@MainActivity)) "当前导航课程正在显示。\n${LiveNotificationSupport.describe(this@MainActivity)}"
                                else if(Notifications.testJourney(this@MainActivity)) "已展示模拟导航课程（约 1 分钟后自动结束）。\n${LiveNotificationSupport.describe(this@MainActivity)}"
                                else "通知未开启，无法展示模拟导航课程。\n${LiveNotificationSupport.describe(this@MainActivity)}"
                            }.getOrDefault("暂时无法创建模拟行程，请检查系统通知设置")
                            runOnUiThread { message(result) }
                        }.start()
                        "notificationSettings" -> startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,packageName))
                        "promotedNotificationSettings" -> {
                            val action = if(Build.VERSION.SDK_INT >= 36) Settings.ACTION_APP_NOTIFICATION_PROMOTION_SETTINGS else Settings.ACTION_APP_NOTIFICATION_SETTINGS
                            val target = Intent(action).putExtra(Settings.EXTRA_APP_PACKAGE,packageName)
                            try { startActivity(target) } catch(_: Exception) { startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,packageName)) }
                        }
                        "testNotification" -> { if(Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) { pendingTestNotification = true; notifyPermission() } else message(if(Notifications.test(this@MainActivity)) "已发送测试通知，请查看通知栏" else "通知总开关或系统通知权限未开启") }
                        "openExternal" -> { val uri = Uri.parse(data.optString("url")); if(uri.scheme == "https") openExternal(uri) }
                        "navigate" -> {
                            if(ReminderScheduler.settings(this@MainActivity).optBoolean("notificationsEnabled",true) && ReminderScheduler.settings(this@MainActivity).optBoolean("journeyLive",true) && Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                                pendingJourney = JSONObject(data.toString())
                                requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS),202)
                            } else startJourney(data)
                        }
                        "stopJourney" -> { Notifications.stopJourney(this@MainActivity); message("上课行程已结束") }
                        "calendarStatus" -> Thread { calendarResult("calendarStatus", true) }.start()
                        "holidayCalendars", "calendarHolidays" -> holidays(JSONObject(data.toString()))
                        "calendarSync", "calendarClear", "calendarRestore" -> {
                            if(!calendarBusy) {
                                if(data.getString("type") == "calendarSync") data.optJSONObject("schedule")?.let {
                                    getSharedPreferences("native", MODE_PRIVATE).edit().putString("schedule", it.toString()).apply()
                                }
                                calendar(data.getString("type"))
                            }
                        }
                        "calendarOpen" -> {
                            try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("content://com.android.calendar/time/${System.currentTimeMillis()}"))) }
                            catch(_: android.content.ActivityNotFoundException) { calendarResult("calendarOpen", false, "未找到可打开的系统日历，请先安装或启用日历应用") }
                        }
                        "theme" -> theme()
                        "appearance" -> { val dark = if(data.optString("mode")=="system") resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES else data.optBoolean("dark"); WindowCompat.getInsetsController(window,web).apply { isAppearanceLightStatusBars = !dark; isAppearanceLightNavigationBars = !dark }; web.setBackgroundColor(if(dark) Color.BLACK else Color.rgb(247,247,247)) }
                        "export" -> { exportText = data.getString("text"); startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json").putExtra(Intent.EXTRA_TITLE, data.getString("name")), 101) }
                    }
                } catch(e: Exception) { message("操作未完成：${e.localizedMessage}") }
            }
        }
    }
    @Deprecated("兼容平台 Activity 文件返回")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if(requestCode == 100) {
            // 原生相机成功时 data 往往为空，必须返回预先分配的输出 URI。
            val result = if(resultCode == RESULT_OK) captureUri?.let { arrayOf(it) } ?: WebChromeClient.FileChooserParams.parseResult(resultCode, data) else null
            fileCallback?.onReceiveValue(result); fileCallback = null
            if(result == null) { captureFile?.delete(); captureFile = null }
            captureUri = null
        }
        if(requestCode == 101) {
            if(resultCode == RESULT_OK && data?.data != null) try { contentResolver.openOutputStream(data.data!!)?.use { it.write((exportText ?: "").toByteArray()) }; message("课表已导出") } catch(e: Exception) { message("导出失败：${e.localizedMessage}") }
            exportText = null
        }
    }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, results)
        if(requestCode == 200) { if(results.firstOrNull() == PackageManager.PERMISSION_GRANTED) { ReminderScheduler.enqueue(this); Notifications.pet(this); if(pendingTestNotification)Notifications.test(this); message("通知权限已允许") } else message("未授予通知权限，课表与教材仍可正常使用"); pendingTestNotification = false }
        if(requestCode == 201) {
            val action = calendarAction; calendarAction = null
            if(calendarPermission() && action != null) executeCalendar(action)
            else { calendarBusy = false; calendarResult(action ?: "calendarSync", false, "未授予日历权限，系统日历未更改") }
        }
        if(requestCode == 202) { val journey = pendingJourney; pendingJourney = null; if(journey != null) startJourney(journey,results.firstOrNull() == PackageManager.PERMISSION_GRANTED) }
        if(requestCode == 204) {
            val request = pendingHoliday; pendingHoliday = null
            if(request != null && holidayPermission()) executeHolidays(request)
            else {
                holidayBusy = false
                if(request != null) holidayResult(request, false, "未授予日历读取权限，已保留上次读取结果")
            }
        }
    }
    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); setIntent(intent); handleIntent(intent) }
    override fun onConfigurationChanged(newConfig: Configuration) { super.onConfigurationChanged(newConfig); theme() }
    private fun handleIntent(intent: Intent) { if(!pageReady) return; intent.getStringExtra("courseId")?.let { send(JSONObject().put("type",if(intent.getBooleanExtra("navigateCourse",false)) "navigateCourse" else "course").put("courseId",it)); intent.removeExtra("courseId"); intent.removeExtra("navigateCourse") }; if(intent.getBooleanExtra("poke",false)) { message("海豚收到啦，今天也一起加油！"); intent.removeExtra("poke") } }
    override fun onResume() { super.onResume(); if(::web.isInitialized) web.onResume(); if(pageReady) { ReminderScheduler.enqueue(this); Notifications.pet(this); AppUpdates.schedule(this); AppUpdates.check(this) { updatesStatus() }; updatesStatus() } }
    override fun onPause() { if(::web.isInitialized) web.onPause(); super.onPause() }
    override fun onDestroy() { stopObservingUpdates?.invoke(); stopObservingUpdates = null; fileCallback?.onReceiveValue(null); fileCallback = null; captureFile?.delete(); if(::web.isInitialized) { web.removeJavascriptInterface("Dolphin"); web.destroy() }; super.onDestroy() }

    private inner class EdgeWebView : WebView(this@MainActivity) {
        private var tracking = false
        private var startX = 0f
        private var startY = 0f
        private var velocity: VelocityTracker? = null
        override fun onTouchEvent(event: MotionEvent): Boolean {
            val dp = resources.displayMetrics.density
            when(event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    tracking = canGoBack && event.x < 24*dp && event.y in (height/2-100*dp)..(height/2+100*dp)
                    if(tracking) { startX = event.x; startY = event.y; velocity = VelocityTracker.obtain(); velocity?.addMovement(event); backPhase("start", 0f, event.x / width, event.y / height); return true }
                }
                MotionEvent.ACTION_MOVE -> if(tracking) { velocity?.addMovement(event); val distance = (event.x-startX).coerceAtLeast(0f); backPhase("progress", (distance/(width/3f)).coerceIn(0f,1f)); return true }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> if(tracking) {
                    velocity?.addMovement(event); velocity?.computeCurrentVelocity(1000)
                    val dx = event.x-startX
                    val commit = event.actionMasked != MotionEvent.ACTION_CANCEL && kotlin.math.abs(event.y-startY) < width && (dx > width*.35f || (dx > 24*dp && (velocity?.xVelocity ?: 0f) > 600))
                    backPhase(if(commit) "commit" else "cancel"); velocity?.recycle(); velocity = null; tracking = false
                    if(commit) lastBack = android.os.SystemClock.elapsedRealtime()
                    return true
                }
            }
            return super.onTouchEvent(event)
        }
    }
}
