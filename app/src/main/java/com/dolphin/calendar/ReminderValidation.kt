package com.dolphin.calendar

data class ReminderKey(val courseId: String, val start: Long, val end: Long)
data class ReminderCandidate<T>(val key: ReminderKey, val value: T)

/** A queued alarm is only a reference; the current schedule supplies notification content. */
object ReminderValidation {
    const val ACTION = "com.dolphin.calendar.REMIND"

    fun <T> deliveries(
        action: String?, notificationsEnabled: Boolean, reminders: Boolean,
        advanceMinutes: Int, now: Long, queued: List<ReminderKey>, current: List<ReminderCandidate<T>>
    ): List<T> {
        if(action != ACTION || !notificationsEnabled || !reminders || advanceMinutes !in 0..1440) return emptyList()
        val advance = advanceMinutes * 60_000L
        val available = current.filter { candidate ->
            val key = candidate.key
            key.courseId.isNotBlank() && key.start > 0 && key.end > key.start && key.end > now && now >= key.start - advance
        }.associateBy { it.key }
        return queued.distinct().mapNotNull { available[it]?.value }
    }
}
