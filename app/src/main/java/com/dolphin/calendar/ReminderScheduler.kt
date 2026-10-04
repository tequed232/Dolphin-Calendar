package com.dolphin.calendar

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import org.json.JSONArray
import org.json.JSONObject
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.temporal.TemporalAdjusters

data class Occurrence(val course: JSONObject, val start: Long, val end: Long)

object ReminderScheduler {
    private val worker = java.util.concurrent.Executors.newSingleThreadExecutor()
    fun enqueue(context: Context) { val app=context.applicationContext; worker.execute { schedule(app) } }
    fun preferences(context: Context) = context.getSharedPreferences("native", Context.MODE_PRIVATE)
    fun settings(context: Context) = JSONObject(preferences(context).getString("settings", "{}") ?: "{}")
    fun occurrences(context: Context, snapshot: JSONObject? = null): List<Occurrence> {
        val schedule = snapshot ?: JSONObject(preferences(context).getString("schedule", null) ?: return emptyList())
        val term = schedule.getJSONObject("term")
        val first = LocalDate.parse(term.getString("startDate")).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
        val periods = schedule.getJSONArray("periods")
        val courses = schedule.getJSONArray("courses")
        val zone = ZoneId.systemDefault()
        val result = mutableListOf<Occurrence>()
        for(i in 0 until courses.length()) {
            val c = courses.getJSONObject(i)
            val weeks = c.getJSONArray("weeks")
            for(j in 0 until weeks.length()) {
                val day = first.plusDays((weeks.getInt(j)-1)*7L+c.getInt("day")-1)
                // 中午等独立分组可能尚未填写时间；只跳过未定时课程，不影响其他提醒。
                val startTime = runCatching { LocalTime.parse(periods.getJSONObject(c.getInt("start")-1).getString("start")) }.getOrNull() ?: continue
                val endTime = runCatching { LocalTime.parse(periods.getJSONObject(c.getInt("end")-1).getString("end")) }.getOrNull() ?: continue
                result += Occurrence(c, LocalDateTime.of(day,startTime).atZone(zone).toInstant().toEpochMilli(), LocalDateTime.of(day,endTime).atZone(zone).toInstant().toEpochMilli())
            }
        }
        return result.sortedBy { it.start }
    }
    fun schedule(context: Context) {
        val alarm = context.getSystemService(AlarmManager::class.java)
        val identity = Intent(context, ReminderReceiver::class.java).setAction("com.dolphin.calendar.REMIND")
        val previous = PendingIntent.getBroadcast(context, 100, identity, PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE)
        previous?.let { alarm.cancel(it); it.cancel() }
        val settings = settings(context)
        preferences(context).edit().remove("nextReminder").apply()
        if(!settings.optBoolean("notificationsEnabled",true) || !settings.optBoolean("reminders")) return
        val advance = settings.optInt("advance",10) * 60_000L
        val now = System.currentTimeMillis()
        // 只排下一批提醒；打开应用、更新时间或每次触发后重排。设备重启后需打开应用恢复。
        val future = runCatching { occurrences(context).filter { it.start-advance > now+1000 } }.getOrElse { return }
        val first = future.firstOrNull() ?: return
        val at = first.start-advance
        val events = JSONArray()
        future.filter { it.start-advance == at }.forEach { events.put(JSONObject().put("course", it.course).put("start",it.start).put("end",it.end)) }
        val pending = PendingIntent.getBroadcast(context,100,identity.putExtra("events",events.toString()),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        // 系统非精确闹钟不申请额外访问权限；省电或休眠时可能延迟。
        alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
        preferences(context).edit().putLong("nextReminder",at).apply()
    }
    fun status(context: Context): String {
        val next = preferences(context).getLong("nextReminder",0)
        return if(next == 0L) "没有待触发提醒" else "下次提醒："+java.text.SimpleDateFormat("MM-dd HH:mm", java.util.Locale.CHINA).format(java.util.Date(next))
    }
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if(intent.action == "com.dolphin.calendar.STOP_JOURNEY" || intent.action == "com.dolphin.calendar.DISMISS_JOURNEY") { Notifications.expireJourney(context,intent.getStringExtra("journeyToken") ?: ""); return }
        if(intent.action == Notifications.journeyTimeoutAction()) { Notifications.expireJourney(context,intent.getStringExtra("journeyToken") ?: ""); return }
        val pending=goAsync();val app=context.applicationContext;val raw=intent.getStringExtra("events")
        Thread {
            try {
                val events=runCatching { JSONArray(raw ?: "[]") }.getOrDefault(JSONArray())
                for(i in 0 until events.length()){
                    val e=events.getJSONObject(i)
                    Notifications.course(app,e.getJSONObject("course"),e.getLong("start"),e.getLong("end"))
                }
                ReminderScheduler.schedule(app)
            } finally { pending.finish() }
        }.start()
    }
}
class ScheduleChangedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if(intent.action !in setOf(Intent.ACTION_MY_PACKAGE_REPLACED,Intent.ACTION_TIME_CHANGED,Intent.ACTION_TIMEZONE_CHANGED)) return
        val pending=goAsync();val app=context.applicationContext
        Thread { try { ReminderScheduler.schedule(app); Notifications.pet(app) } finally { pending.finish() } }.start()
    }
}
