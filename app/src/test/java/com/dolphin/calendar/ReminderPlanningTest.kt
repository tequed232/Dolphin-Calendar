package com.dolphin.calendar

import org.junit.Assert.*
import org.junit.Test

class ReminderPlanningTest {
    private val now = 1_800_000_000_000L
    private fun key(id: String, at: Long, end: Long = at + 45 * 60_000L) = ReminderKey(id, at, end)

    @Test fun foregroundWithinOneSecondDoesNotLoseNextReminder() {
        val next = key("imminent", now + 500)
        assertEquals(ReminderBatch(now + 500, listOf(next)), ReminderPlanning.next(listOf(next), 0, now))
    }
    @Test fun dueAndDelayedPendingReminderSurvivesUntilCourseEnds() {
        val next = key("delayed", now - 5 * 60_000)
        assertEquals(next.start, ReminderPlanning.next(listOf(next), 0, now, next.start)?.at)
        assertEquals(next.start, ReminderPlanning.next(listOf(next), 0, next.start, next.start)?.at)
        assertNull(ReminderPlanning.next(listOf(next), 0, next.end, next.start))
    }
    @Test fun consumedAlarmDoesNotReappearOnResume() {
        val consumed = key("consumed", now - 1)
        assertNull(ReminderPlanning.next(listOf(consumed), 0, now))
    }
    @Test fun deletedCourseCannotPreserveAnOldAlarm() {
        val next = key("next", now + 60_000)
        assertEquals(next.start, ReminderPlanning.next(listOf(next), 0, now, now - 1)?.at)
    }
    @Test fun changedAdvanceReplacesObsoletePendingTime() {
        val next = key("advance", now + 20 * 60_000)
        assertEquals(next.start - 5 * 60_000, ReminderPlanning.next(listOf(next), 5, now, next.start - 10 * 60_000)?.at)
    }
    @Test fun simultaneousCoursesStayInOneStableUniqueBatch() {
        val a = key("a", now + 10_000); val b = key("b", a.start)
        val later = key("later", now + 60_000)
        assertEquals(ReminderBatch(a.start, listOf(a,b)), ReminderPlanning.next(listOf(b,later,a,a), 0, now))
    }
    @Test fun invalidIntervalsAndAdvanceDoNotSchedule() {
        val valid = key("valid", now + 1)
        assertNull(ReminderPlanning.next(listOf(valid), -1, now))
        assertNull(ReminderPlanning.next(listOf(valid), 1441, now))
        assertNull(ReminderPlanning.next(listOf(valid.copy(courseId=""), valid.copy(end=valid.start)), 0, now))
    }
}
