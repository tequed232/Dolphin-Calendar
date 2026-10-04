package com.dolphin.calendar

import android.content.ContentProviderOperation
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.provider.CalendarContract
import org.json.JSONArray
import org.json.JSONObject
import java.util.TimeZone

object CalendarSync {
    private const val UNDO = "calendarUndo"
    private fun calendarUri(context: Context): Uri = CalendarContract.Calendars.CONTENT_URI.buildUpon()
        .appendQueryParameter(CalendarContract.CALLER_IS_SYNCADAPTER, "true")
        .appendQueryParameter(CalendarContract.Calendars.ACCOUNT_NAME, context.packageName)
        .appendQueryParameter(CalendarContract.Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL).build()

    private fun calendars(context: Context): Map<Long, Boolean> {
        val result = mutableMapOf<Long, Boolean>()
        context.contentResolver.query(CalendarContract.Calendars.CONTENT_URI,
            arrayOf(CalendarContract.Calendars._ID, CalendarContract.Calendars.VISIBLE),
            "${CalendarContract.Calendars.ACCOUNT_NAME}=? AND ${CalendarContract.Calendars.ACCOUNT_TYPE}=?",
            arrayOf(context.packageName, CalendarContract.ACCOUNT_TYPE_LOCAL), null)?.use { cursor ->
            while (cursor.moveToNext()) result[cursor.getLong(0)] = cursor.getInt(1) != 0
        }
        return result
    }

    @Synchronized fun count(context: Context): Int {
        val ids = calendars(context).filterValues { it }.keys
        if (ids.isEmpty()) return 0
        val placeholders = ids.joinToString(",") { "?" }
        return context.contentResolver.query(CalendarContract.Events.CONTENT_URI,
            arrayOf(CalendarContract.Events._ID),
            "${CalendarContract.Events.CALENDAR_ID} IN ($placeholders) AND ${CalendarContract.Events.DELETED}=0",
            ids.map { it.toString() }.toTypedArray(), null)?.use { it.count } ?: 0
    }

    private fun previousIds(undo: JSONObject): List<Long> {
        val ids = undo.getJSONArray("previousIds")
        return (0 until ids.length()).map { ids.getLong(it) }
    }
    private fun undo(context: Context): JSONObject? = ReminderScheduler.preferences(context)
        .getString(UNDO, null)?.let { runCatching { JSONObject(it) }.getOrNull() }

    @Synchronized fun canRestore(context: Context): Boolean {
        val saved = undo(context) ?: return false
        val owned = calendars(context)
        return runCatching { owned.containsKey(saved.getLong("createdId")) && previousIds(saved).all { owned.containsKey(it) } }.getOrDefault(false)
    }

    private fun visibility(context: Context, id: Long, visible: Boolean) =
        ContentProviderOperation.newUpdate(ContentUris.withAppendedId(calendarUri(context), id))
            .withValue(CalendarContract.Calendars.VISIBLE, if (visible) 1 else 0).build()
    private fun delete(context: Context, id: Long) =
        ContentProviderOperation.newDelete(ContentUris.withAppendedId(calendarUri(context), id)).build()
    private fun apply(context: Context, operations: List<ContentProviderOperation>) {
        if (operations.isNotEmpty()) context.contentResolver.applyBatch(CalendarContract.AUTHORITY, ArrayList(operations))
    }

    @Synchronized fun clear(context: Context): String {
        apply(context, calendars(context).keys.map { delete(context, it) })
        ReminderScheduler.preferences(context).edit().remove(UNDO).commit()
        return "已清除 Dolphin 创建的课程日历及复原副本"
    }

    @Synchronized fun restore(context: Context): String {
        val saved = undo(context) ?: return "没有可复原的导入记录"
        check(canRestore(context)) { "复原副本已被系统日历移除，当前课程未更改" }
        val previous = previousIds(saved)
        apply(context, previous.map { visibility(context, it, true) } + delete(context, saved.getLong("createdId")))
        ReminderScheduler.preferences(context).edit().remove(UNDO).commit()
        return if (previous.isEmpty()) "已撤销首次导入，移除本次创建的课程日历" else "已复原到上一次导入前的 Dolphin 课程日历"
    }

    @Synchronized fun sync(context: Context): String {
        val snapshot = JSONObject(ReminderScheduler.preferences(context).getString("schedule", "{}") ?: "{}")
        val courses = ReminderScheduler.occurrences(context, snapshot).filter { it.end > it.start }
        check(courses.isNotEmpty()) { "没有可写入的课程，请检查上课时间；系统日历未更改" }
        val source = snapshot.getJSONArray("courses")
        val expected = (0 until source.length()).sumOf { source.getJSONObject(it).getJSONArray("weeks").length() }
        val all = calendars(context)
        val previous = all.filterValues { it }.keys.toList()
        val prefs = ReminderScheduler.preferences(context)
        val oldUndo = prefs.getString(UNDO, null)
        val timezone = TimeZone.getDefault().id
        // 新副本先保持隐藏；完整写入后才替换可见日历，旧副本供一次复原使用。
        val values = ContentValues().apply {
            put(CalendarContract.Calendars.ACCOUNT_NAME, context.packageName)
            put(CalendarContract.Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL)
            put(CalendarContract.Calendars.NAME, "Dolphin Calendar")
            put(CalendarContract.Calendars.CALENDAR_DISPLAY_NAME, "Dolphin 课程")
            put(CalendarContract.Calendars.CALENDAR_COLOR, 0xFF3B6550.toInt())
            put(CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL, CalendarContract.Calendars.CAL_ACCESS_OWNER)
            put(CalendarContract.Calendars.OWNER_ACCOUNT, context.packageName)
            put(CalendarContract.Calendars.VISIBLE, 0)
            put(CalendarContract.Calendars.SYNC_EVENTS, 1)
            put(CalendarContract.Calendars.CALENDAR_TIME_ZONE, timezone)
        }
        val created = context.contentResolver.insert(calendarUri(context), values) ?: error("系统日历不允许创建本地日历")
        val id = ContentUris.parseId(created)
        try {
            val titles = JSONObject(prefs.getString("bookTitles", "{}") ?: "{}")
            val events = courses.map { occurrence -> ContentValues().apply {
                val course = occurrence.course
                val room = course.optString("room").ifBlank { "未填写" }
                val teacher = course.optString("teacher").ifBlank { "未填写" }
                val description = buildString {
                    append("由 Dolphin Calendar 创建\n教师：$teacher\n位置：$room")
                    titles.optString(course.getString("name")).takeIf { it.isNotBlank() }?.let { append("\n教材：$it") }
                    course.optString("notes").takeIf { it.isNotBlank() }?.let { append("\n备注：$it") }
                }
                put(CalendarContract.Events.CALENDAR_ID, id)
                put(CalendarContract.Events.TITLE, course.getString("name"))
                put(CalendarContract.Events.EVENT_LOCATION, room)
                put(CalendarContract.Events.DESCRIPTION, description)
                put(CalendarContract.Events.DTSTART, occurrence.start)
                put(CalendarContract.Events.DTEND, occurrence.end)
                put(CalendarContract.Events.EVENT_TIMEZONE, timezone)
            } }
            val count = events.chunked(200).sumOf { context.contentResolver.bulkInsert(CalendarContract.Events.CONTENT_URI, it.toTypedArray()) }
            check(count == events.size) { "日程写入不完整，已保留原有课程日历" }
            val saved = JSONObject().put("createdId", id).put("previousIds", JSONArray(previous))
            check(prefs.edit().putString(UNDO, saved.toString()).commit()) { "无法保存复原记录，原有日历未更改" }
            apply(context, previous.map { visibility(context, it, false) } + visibility(context, id, true))
            // 只保留最近一次导入的复原副本，避免多次导入无限积累隐藏日程。
            all.keys.filter { it !in previous }.forEach { oldId -> runCatching { apply(context, listOf(delete(context, oldId))) } }
            val skipped = expected - count
            return "已导入 $count 次上课到系统日历" + if (skipped > 0) "\n$skipped 次因上课时间未填写或无效而跳过，请补齐时间后重新导入" else ""
        } catch (error: Exception) {
            runCatching { apply(context, listOf(delete(context, id))) }
            prefs.edit().apply { if (oldUndo == null) remove(UNDO) else putString(UNDO, oldUndo) }.commit()
            throw error
        }
    }
}
