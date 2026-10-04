package com.dolphin.calendar

import android.content.ContentUris
import android.content.Context
import android.provider.CalendarContract
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit

/** Only reads the calendars the user selected; it never writes or stores personal events. */
object SystemHolidays {
    private const val MAX_DAYS = 366L
    private const val MAX_MARKS = 2000
    private const val MAX_INSTANCES = 10000
    private val suggested = Regex("节假|假日|holiday", RegexOption.IGNORE_CASE)
    private val makeup = Regex("调休\\s*(?:[（(]\\s*)?(?:上班|工作)|补班|make[ -]?up\\s*(?:work(?:ing)?(?:\\s*day)?|day)", RegexOption.IGNORE_CASE)
    private val rest = Regex("放假|休假|休息(?!室)|公休|假期|不上班|非工作日|public\\s+holiday|holiday\\s*[-–—:(（]?\\s*observed|observed\\s*[-–—:(（]?\\s*holiday|day\\s+off|\\bnon[ -]?working\\s+day\\b", RegexOption.IGNORE_CASE)
    // A delimited marker is explicit; a character inside a personal event title is not.
    private val markedRest = Regex("(?:^|[（(\\[【\\s·:：_-])休(?:$|[）)\\]】\\s·:：_-])")
    private val markedMakeup = Regex("[（(\\[【]\\s*(?:班|补|补班|补课|上班)\\s*[）)\\]】]")
    private val explicitWork = Regex("(?:^|[（(\\[【\\s·:：_-])(?:补课|上班|工作日)(?:$|[）)\\]】\\s·:：_-])|\\bworking\\s+day\\b", RegexOption.IGNORE_CASE)
    private val festivalWork = Regex("(?:元旦|春节|清明(?:节)?|劳动节|五一|端午(?:节)?|中秋(?:节)?|国庆(?:节)?|新年|圣诞(?:节)?)(?:补课|上班)")
    private val ordinaryEvent = Regex("会议|开会|例会|讨论|培训|讲座|申请|审批|meeting|conference|workshop|seminar", RegexOption.IGNORE_CASE)
    private val canceledArrangement = Regex("(?:取消|撤销)(?:放假|休假|补班|补课|上班|调休上班)|(?:放假|休假|补班|补课|上班|调休上班)(?:安排)?[（(\\s]*(?:取消|撤销)")
    private val festival = Regex("元旦|春节|除夕|清明|劳动节|五一|端午|中秋|国庆|新年|圣诞|元宵|重阳|七夕|妇女节|儿童节|教师节|植树节|青年节|建军节|建党节|感恩节|复活节|节日|holiday|festival|christmas|new\\s+year|easter|thanksgiving|independence\\s+day|national\\s+day|diwali|ramadan|\\beid\\b|hanukkah|vesak|dragon\\s+boat|mid[ -]?autumn", RegexOption.IGNORE_CASE)
    data class Source(val id: Long, val displayName: String, val isSuggested: Boolean) {
        fun json() = JSONObject().put("id", id.toString()).put("displayName", displayName).put("isSuggested", isSuggested)
    }
    data class Range(val from: LocalDate, val to: LocalDate, val ids: List<Long>)
    private fun compact(text: String) = text.replace(Regex("[\\p{Cc}\\p{Cf}]"), " ").replace(Regex("\\s+"), " ").trim().take(160)
    fun sources(context: Context): List<Source> {
        val base = context.packageName.removeSuffix(".debug")
        val owned = setOf(base, "$base.debug")
        val result = mutableListOf<Source>()
        val cursor = context.contentResolver.query(CalendarContract.Calendars.CONTENT_URI,
            arrayOf(CalendarContract.Calendars._ID, CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
                CalendarContract.Calendars.NAME, CalendarContract.Calendars.ACCOUNT_NAME, CalendarContract.Calendars.ACCOUNT_TYPE),
            "${CalendarContract.Calendars.VISIBLE}=1", null, "${CalendarContract.Calendars.CALENDAR_DISPLAY_NAME} ASC")
            ?: error("系统日历暂时无法读取，请稍后重试")
        cursor.use {
            while (it.moveToNext()) {
                if (it.getString(4) == CalendarContract.ACCOUNT_TYPE_LOCAL && it.getString(3) in owned) continue
                val name = compact(it.getString(1).orEmpty().ifBlank { it.getString(2).orEmpty() }).ifBlank { "未命名日历" }
                result.add(Source(it.getLong(0), name, suggested.containsMatchIn(name)))
                check(result.size <= 200) { "可见日历数量过多，请在系统日历中隐藏暂不使用的来源" }
            }
        }
        return result
    }
    fun calendars(context: Context) = JSONArray().also { output -> sources(context).forEach { output.put(it.json()) } }
    fun range(request: JSONObject): Range {
        val fromText = request.optString("from")
        val toText = request.optString("to")
        require(fromText.matches(Regex("\\d{4}-\\d{2}-\\d{2}")) && toText.matches(Regex("\\d{4}-\\d{2}-\\d{2}"))) { "请选择有效的起止日期（YYYY-MM-DD）" }
        val from = runCatching { LocalDate.parse(fromText) }.getOrElse { throw IllegalArgumentException("请选择有效的开始日期") }
        val to = runCatching { LocalDate.parse(toText) }.getOrElse { throw IllegalArgumentException("请选择有效的结束日期") }
        require(ChronoUnit.DAYS.between(from, to) + 1 in 1..MAX_DAYS) { "每次最多读取 366 天，结束日期不能早于开始日期" }
        val values = request.optJSONArray("calendarIds") ?: throw IllegalArgumentException("请先选择节假日日历来源")
        require(values.length() in 1..20) { "请选择 1 至 20 个节假日日历来源" }
        val ids = (0 until values.length()).map { i ->
            val raw = values.optString(i)
            require(raw.matches(Regex("\\d+"))) { "日历来源无效，请重新选择" }
            raw.toLongOrNull()?.takeIf { it >= 0 } ?: throw IllegalArgumentException("日历来源无效，请重新选择")
        }.distinct()
        return Range(from, to, ids)
    }
    // A festival name alone does not imply a day off. Timed events need an explicit rest/work marker.
    fun classify(title: String, allDay: Boolean): String? {
        val text = compact(title)
        if (text.isBlank()) return null
        if (ordinaryEvent.containsMatchIn(text) || canceledArrangement.containsMatchIn(text)) return null
        val workText = text.replace(Regex("非工作日|不调休\\s*[（(]?\\s*上班|不补班|不补课|无需补班|无需补课|无需上班|不上班|\\bnon[ -]?working\\s+day\\b", RegexOption.IGNORE_CASE), "")
        if (makeup.containsMatchIn(workText) || markedMakeup.containsMatchIn(workText) || explicitWork.containsMatchIn(workText) || festivalWork.containsMatchIn(workText)) return "makeup"
        val restText = text.replace(Regex("不放假|不休假|不休息|不公休|没有假期|无需休假"), "")
        if (rest.containsMatchIn(restText) || markedRest.containsMatchIn(restText)) return "rest"
        return if (allDay && festival.containsMatchIn(text)) "festival" else null
    }
    fun read(context: Context, request: JSONObject): JSONObject {
        val range = range(request)
        val sources = sources(context).associateBy { it.id }
        require(range.ids.all { it in sources }) { "所选日历已隐藏、移除或不可用，请重新选择来源" }
        val local = ZoneId.systemDefault()
        val exclusive = range.to.plusDays(1)
        // Include both local midnight and UTC midnight: all-day events use UTC date boundaries.
        val begin = minOf(range.from.atStartOfDay(local).toInstant().toEpochMilli(), range.from.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
        val end = maxOf(exclusive.atStartOfDay(local).toInstant().toEpochMilli(), exclusive.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
        val uri = CalendarContract.Instances.CONTENT_URI.buildUpon().also { ContentUris.appendId(it, begin); ContentUris.appendId(it, end) }.build()
        val placeholders = range.ids.joinToString(",") { "?" }
        val selection = "${CalendarContract.Instances.CALENDAR_ID} IN ($placeholders) AND ${CalendarContract.Instances.VISIBLE}=1 AND ${CalendarContract.Events.DELETED}=0 AND (${CalendarContract.Instances.STATUS} IS NULL OR ${CalendarContract.Instances.STATUS}<>?)"
        val arguments = (range.ids.map { it.toString() } + CalendarContract.Events.STATUS_CANCELED.toString()).toTypedArray()
        val marks = linkedMapOf<String, JSONObject>()
        val cursor = context.contentResolver.query(uri,
            arrayOf(CalendarContract.Instances.CALENDAR_ID, CalendarContract.Instances.TITLE, CalendarContract.Instances.BEGIN,
                CalendarContract.Instances.END, CalendarContract.Instances.ALL_DAY), selection, arguments, "${CalendarContract.Instances.BEGIN} ASC")
            ?: error("系统日历暂时无法读取，请稍后重试")
        cursor.use {
            var rows = 0
            while (it.moveToNext()) {
                check(++rows <= MAX_INSTANCES) { "所选来源的日程过多，请缩小日期范围后重试" }
                val source = sources[it.getLong(0)] ?: continue
                val title = compact(it.getString(1).orEmpty())
                val allDay = it.getInt(4) != 0
                val kind = classify(title, allDay) ?: continue
                val eventBegin = it.getLong(2)
                val eventEnd = it.getLong(3)
                if (eventEnd <= eventBegin) continue
                val zone = if (allDay) ZoneOffset.UTC else local
                val first = Instant.ofEpochMilli(eventBegin).atZone(zone).toLocalDate()
                val last = Instant.ofEpochMilli(eventEnd - 1).atZone(zone).toLocalDate()
                var date = maxOf(first, range.from)
                val final = minOf(last, range.to)
                while (!date.isAfter(final)) {
                    val key = "$date|$kind|${source.id}|$title"
                    marks[key] = JSONObject().put("date", date.toString()).put("kind", kind).put("title", title).put("source", source.displayName)
                    check(marks.size <= MAX_MARKS) { "节假日标记超过 2000 条，请缩小日期范围后重试" }
                    date = date.plusDays(1)
                }
            }
        }
        return JSONObject().put("days", JSONArray(marks.values.toList())).put("from", range.from.toString()).put("to", range.to.toString())
            .put("calendarIds", JSONArray(range.ids.map { it.toString() }))
    }
}
