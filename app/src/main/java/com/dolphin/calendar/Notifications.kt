package com.dolphin.calendar

import android.app.Notification
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Base64
import org.json.JSONObject

object Notifications {
    private const val COURSE_CHANNEL = "classes-v1"
    private const val PET_CHANNEL = "companion-v1"
    private const val JOURNEY_CHANNEL = "journey-v1"
    private const val PET_ID = 10
    private const val JOURNEY_ID = 11
    private const val ARRIVAL_ID = 12
    private const val JOURNEY_TIMEOUT = "com.dolphin.calendar.JOURNEY_TIMEOUT"
    const val ACTIVE_JOURNEY_ID = JOURNEY_ID
    @Volatile private var cachedAppIcon: Bitmap? = null
    private val colorOSIcon: Boolean
        get() = Build.VERSION.SDK_INT >= 36 && listOf(Build.MANUFACTURER, Build.BRAND).any {
            it.equals("oppo", true) || it.equals("realme", true) || it.equals("oneplus", true)
        }

    private fun appIcon(context: Context): Bitmap = cachedAppIcon ?: synchronized(this) {
        cachedAppIcon ?: run {
            val resources = context.applicationContext.resources
            val icon = requireNotNull(BitmapFactory.decodeResource(resources, R.drawable.live_icon,
                BitmapFactory.Options().apply { inScaled = false }))
            cachedAppIcon = icon
            icon
        }
    }
    fun channels(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannels(listOf(
            NotificationChannel(COURSE_CHANNEL,"上课提醒",NotificationManager.IMPORTANCE_HIGH).apply { description = "根据本地课表在上课前提醒" },
            NotificationChannel(PET_CHANNEL,"通知栏桌宠",NotificationManager.IMPORTANCE_LOW).apply { description = "可选的海豚台词与互动" },
            NotificationChannel(JOURNEY_CHANNEL,"上课行程",NotificationManager.IMPORTANCE_DEFAULT).apply { description = "主动开始的上课导航状态" }
        ))
    }
    private fun open(context: Context, courseId: String = "", poke: Boolean = false): PendingIntent {
        val intent = Intent(context,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP).putExtra("courseId",courseId).putExtra("poke",poke)
        return PendingIntent.getActivity(context, if(poke) 12 else courseId.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    private fun navigate(context: Context, courseId: String): PendingIntent {
        val intent = Intent(context,MainActivity::class.java).setAction("com.dolphin.calendar.NAVIGATE_COURSE")
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra("courseId",courseId).putExtra("navigateCourse",true)
        return PendingIntent.getActivity(context,courseId.hashCode(),intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    private fun base(context: Context, channel: String, title: String, text: String) = Notification.Builder(context,channel)
        .setSmallIcon(R.drawable.ic_notification).setContentTitle(title).setContentText(text)
        .setLargeIcon(appIcon(context))
        .setStyle(Notification.BigTextStyle().bigText(text)).setColor(0x3B6550).setContentIntent(open(context))
    private fun post(context: Context,id: Int,notification: Notification): Boolean {
        val manager = context.getSystemService(NotificationManager::class.java)
        if(!ReminderScheduler.settings(context).optBoolean("notificationsEnabled",true) || !manager.areNotificationsEnabled()) return false
        return try { manager.notify(id,notification); true } catch(_: SecurityException) { false }
    }
    private fun roomLabel(context: Context, value: String): String {
        val school = ReminderScheduler.settings(context).optString("school").trim()
        val withoutSchool = if(school.isNotEmpty() && value.trim().startsWith(school)) value.trim().removePrefix(school) else value.trim()
        val clean=withoutSchool.replace(Regex("^.{2,25}?(?:大学|学院|学校)(?:.{0,12}?校区)?(?=.{1,20}(?:楼|栋|教室))"),"")
        return clean.trim(' ', '·', '-', '—', '，', ',', '：', ':').ifBlank { "教室待填写" }
    }
    private fun bookTitle(context: Context, courseName: String): String = runCatching {
        JSONObject(ReminderScheduler.preferences(context).getString("bookTitles","{}") ?: "{}").optString(courseName)
    }.getOrDefault("").ifBlank { "尚未标记" }
    private fun lyric(context: Context): String = ReminderScheduler.settings(context).optString("lines", "带好教材，我们出发吧！")
        .replace("\\n", "\n").lines().map { it.trim() }.filter { it.isNotEmpty() }.randomOrNull() ?: "带好教材，我们出发吧！"
    private fun bookIcon(context: Context, courseName: String): Bitmap {
        val encoded = runCatching { JSONObject(ReminderScheduler.preferences(context).getString("bookCovers","{}") ?: "{}").optString(courseName) }.getOrDefault("")
        if(encoded.startsWith("data:image/") && encoded.length < 80_000) {
            val bitmap = runCatching { Base64.decode(encoded.substringAfter(','),Base64.DEFAULT).let { BitmapFactory.decodeByteArray(it,0,it.size) } }.getOrNull()
            if(bitmap != null && bitmap.width <= 256 && bitmap.height <= 256) return bitmap
        }
        return appIcon(context)
    }
    fun course(context: Context,course: JSONObject,start: Long,end: Long) {
        val name = course.getString("name")
        val room = roomLabel(context,course.optString("room"))
        val book = bookTitle(context,name)
        val presentation = courseNotificationPresentation(name,room,CourseNotificationStage.REMINDER,book)
        val line = lyric(context)
        val whenText = java.text.SimpleDateFormat("HH:mm",java.util.Locale.CHINA).format(java.util.Date(start))
        val intent = open(context,course.getString("id"))
        val notification = base(context,COURSE_CHANNEL,presentation.title,"$whenText 开始 · ${presentation.text}\n$line")
            .setCategory(Notification.CATEGORY_REMINDER).setWhen(start).setShowWhen(true).setAutoCancel(true)
            .setLargeIcon(bookIcon(context,name)).setSubText(null).setUsesChronometer(false)
            .setContentIntent(intent).setTimeoutAfter((end-System.currentTimeMillis()).coerceAtLeast(60_000))
            .addAction(Notification.Action.Builder(null,presentation.destinationAction,navigate(context,course.getString("id"))).build())
            .addAction(Notification.Action.Builder(null,"查看课程",intent).build()).build()
        post(context,courseNotificationId(course.getString("id")),notification)
    }
    private fun courseNotificationId(courseId: String) = 1000 + (courseId.hashCode() and 0x3fffffff)
    fun dismissCourse(context: Context, courseId: String) {
        if(courseId.isNotBlank()) context.getSystemService(NotificationManager::class.java).cancel(courseNotificationId(courseId))
    }
    fun test(context: Context): Boolean {
        channels(context)
        val line = lyric(context)
        return post(context,99,base(context,COURSE_CHANNEL,"Dolphin · 测试提醒",line).setAutoCancel(true).setTimeoutAfter(60_000).build())
    }
    fun pet(context: Context) {
        val settings = ReminderScheduler.settings(context)
        val manager = context.getSystemService(NotificationManager::class.java)
        val journeyActive = runCatching { manager.activeNotifications.any { it.id == JOURNEY_ID } }.getOrDefault(false)
        if(!settings.optBoolean("notificationsEnabled",true) || !settings.optBoolean("pet") || journeyActive) { manager.cancel(PET_ID); return }
        val builder = base(context,PET_CHANNEL,"Dolphin 在这里",lyric(context)).setOnlyAlertOnce(true).setOngoing(true)
        if(settings.optBoolean("poke",true)) builder.addAction(Notification.Action.Builder(null,"戳一下",open(context,poke=true)).build())
        post(context,PET_ID,builder.build())
    }
    private fun timeoutIntent(context: Context, token: String = "") = PendingIntent.getBroadcast(context,213,Intent(context,ReminderReceiver::class.java).setAction(JOURNEY_TIMEOUT).putExtra("journeyToken",token),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    fun journeyTimeoutAction() = JOURNEY_TIMEOUT
    @Synchronized fun expireJourney(context: Context, token: String) {
        val preferences=ReminderScheduler.preferences(context)
        val legacy=token.isEmpty() && preferences.contains("activeJourney") && runCatching {
            !JSONObject(preferences.getString("activeJourney","{}") ?: "{}").has("endsAt")
        }.getOrDefault(false)
        if(legacy || token.isNotEmpty() && preferences.getString("journeyToken","") == token) stopJourney(context)
    }
    fun journeyActive(context: Context) = runCatching { context.getSystemService(NotificationManager::class.java).activeNotifications.any { it.id == JOURNEY_ID } }.getOrDefault(false)
    @Synchronized fun journey(context: Context,courseId: String,title: String,room: String,mapUrl: String,timeoutMillis: Long = 30*60_000L): Boolean {
        channels(context)
        val settings=ReminderScheduler.settings(context)
        if(!settings.optBoolean("notificationsEnabled",true) || !settings.optBoolean("journeyLive",true)) return false
        val preferences=ReminderScheduler.preferences(context)
        val active=runCatching { JSONObject(preferences.getString("activeJourney", "{}") ?: "{}") }.getOrDefault(JSONObject())
        if(journeyActive(context) && active.optString("courseId")==courseId && active.optString("mapUrl")==mapUrl && active.optLong("endsAt")>System.currentTimeMillis()) return true
        val duration=timeoutMillis.coerceIn(60_000L,30*60_000L)
        val token=java.util.UUID.randomUUID().toString()
        val started=System.currentTimeMillis()
        val alarm=context.getSystemService(AlarmManager::class.java)
        alarm.cancel(timeoutIntent(context))
        val place=roomLabel(context,room)
        val book=bookTitle(context,title)
        val presentation = courseNotificationPresentation(title,place,CourseNotificationStage.JOURNEY,book)
        val stop = PendingIntent.getBroadcast(context,11,Intent(context,ReminderReceiver::class.java).setAction("com.dolphin.calendar.STOP_JOURNEY").putExtra("journeyToken",token),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val dismissed = PendingIntent.getBroadcast(context,12,Intent(context,ReminderReceiver::class.java).setAction("com.dolphin.calendar.DISMISS_JOURNEY").putExtra("journeyToken",token),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val map=PendingIntent.getActivity(context,13,Intent(Intent.ACTION_VIEW,Uri.parse(mapUrl)),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val builder = base(context,JOURNEY_CHANNEL,presentation.title,presentation.text)
            .setOngoing(true).setOnlyAlertOnce(true).setCategory(if(Build.VERSION.SDK_INT >= 28) Notification.CATEGORY_NAVIGATION else Notification.CATEGORY_SERVICE)
            .setWhen(started).setShowWhen(false).setUsesChronometer(false)
            .setLargeIcon(null as Bitmap?).setSubText(null)
            .setContentIntent(open(context,courseId)).setTimeoutAfter(duration).setDeleteIntent(dismissed)
            .addAction(Notification.Action.Builder(null,presentation.destinationAction,map).build())
            .addAction(Notification.Action.Builder(null,"我到了",stop)
                .addExtras(android.os.Bundle().apply { putBoolean("android.support.action.showsUserInterface", false) }).build())
        // ColorOS 流体云直接取彩色 PNG；标准 Android 会把此图染成白色方块，使用品牌单色兼容图标。
        if (colorOSIcon) builder.setSmallIcon(Icon.createWithResource(context, R.drawable.live_icon))
        // 仅主动发起的短时行程请求提升；普通提醒和桌宠不伪装成实时活动。
        if(Build.VERSION.SDK_INT >= 36) {
            builder.addExtras(android.os.Bundle().apply { putBoolean("android.requestPromotedOngoing",true) }).setShortCriticalText(presentation.collapsedBuilding)
        }
        val notification = builder.build()
        val posted=post(context,JOURNEY_ID,notification)
        if(posted) {
            context.getSystemService(NotificationManager::class.java).cancel(PET_ID)
            preferences.edit().putString("activeJourney",JSONObject().put("title",title).put("room",place).put("book",book).put("courseId",courseId).put("mapUrl",mapUrl).put("startedAt",started).put("endsAt",started+duration).toString()).putString("journeyToken",token).apply()
            val pending=timeoutIntent(context,token)
            val at=SystemClock.elapsedRealtime()+duration
            // 行程超时沿用系统非精确调度，无需申请精确闹钟权限。
            alarm.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP,at,pending)
            val app=context.applicationContext
            Handler(Looper.getMainLooper()).postDelayed({ expireJourney(app,token) },duration)
        }
        return posted
    }
    fun testJourney(context: Context): Boolean {
        if(journeyActive(context)) return true
        val next=runCatching { ReminderScheduler.occurrences(context).firstOrNull { it.end > System.currentTimeMillis() } }.getOrNull()
        val course=next?.course
        val title=course?.optString("name")?.takeIf { it.isNotBlank() } ?: "模拟课程"
        val room=course?.optString("room")?.takeIf { it.isNotBlank() } ?: "教学楼A203号教室"
        val id=course?.optString("id") ?: ""
        val school=ReminderScheduler.settings(context).optString("school")
        val building=Regex("^.*?(?:栋|幢|楼|体育馆|图书馆|教学馆)").find(roomLabel(context,room))?.value ?: "教学楼"
        val mapUrl=Uri.Builder().scheme("https").authority("uri.amap.com").path("/search").appendQueryParameter("keyword", listOf(school,building).filter { it.isNotBlank() }.joinToString(" ")).build().toString()
        return journey(context,id,title,room,mapUrl,60_000L)
    }
    @Synchronized fun stopJourney(context: Context) {
        context.getSystemService(NotificationManager::class.java).cancel(JOURNEY_ID)
        context.getSystemService(NotificationManager::class.java).cancel(ARRIVAL_ID) // 清理旧版残留的到达通知。
        context.getSystemService(AlarmManager::class.java).cancel(timeoutIntent(context))
        ReminderScheduler.preferences(context).edit().remove("activeJourney").remove("journeyToken").apply()
        pet(context)
    }
    @Synchronized fun clearAll(context: Context) {
        context.getSystemService(NotificationManager::class.java).cancelAll()
        context.getSystemService(AlarmManager::class.java).cancel(timeoutIntent(context))
        ReminderScheduler.preferences(context).edit().remove("activeJourney").remove("journeyToken").apply()
    }
}
