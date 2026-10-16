package com.dolphin.calendar

data class ReminderBatch(val at: Long, val keys: List<ReminderKey>)

/** Keep a due, undelivered alarm alive across foreground refreshes. */
object ReminderPlanning {
    fun next(current: List<ReminderKey>, advanceMinutes: Int, now: Long, pendingAt: Long? = null): ReminderBatch? {
        if (advanceMinutes !in 0..1440) return null
        val advance = advanceMinutes * 60_000L
        val candidates = current.distinct().filter {
            it.courseId.isNotBlank() && it.start > 0 && it.end > it.start && it.end > now &&
                (it.start - advance > now || it.start - advance == pendingAt)
        }
        val at = candidates.minOfOrNull { it.start - advance } ?: return null
        return ReminderBatch(at, candidates.filter { it.start - advance == at }.sortedBy { it.courseId })
    }
}
