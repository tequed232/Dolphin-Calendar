package com.dolphin.calendar

import org.junit.Assert.*
import org.junit.Test

class ReminderValidationTest {
    private val now = 1_800_000_000_000L
    private val key = ReminderKey("course",now + 5 * 60_000,now + 45 * 60_000)
    private val latest = ReminderCandidate(key,"Latest name and room")
    private fun select(action: String? = ReminderValidation.ACTION, notifications: Boolean = true, reminders: Boolean = true,
                       advance: Int = 10, time: Long = now, queued: List<ReminderKey> = listOf(key),
                       current: List<ReminderCandidate<String>> = listOf(latest)) =
        ReminderValidation.deliveries(action,notifications,reminders,advance,time,queued,current)

    @Test fun validQueuedReferenceUsesCurrentContent() { assertEquals(listOf("Latest name and room"),select()) }
    @Test fun disabledRemindersRejectAlreadyQueuedAlarm() { assertTrue(select(reminders=false).isEmpty()) }
    @Test fun disabledNotificationsRejectAlreadyQueuedAlarm() { assertTrue(select(notifications=false).isEmpty()) }
    @Test fun deletedCourseDoesNotReappearFromPayload() { assertTrue(select(current=emptyList()).isEmpty()) }
    @Test fun changedStartEndOrDateRejectOldPayload() {
        for(changed in listOf(key.copy(start=key.start+60_000),key.copy(end=key.end+60_000),key.copy(start=key.start+86_400_000,end=key.end+86_400_000)))
            assertTrue(select(current=listOf(ReminderCandidate(changed,"changed"))).isEmpty())
    }
    @Test fun renamedCourseStillDeliversLatestInformation() { assertEquals(listOf("new room"),select(current=listOf(ReminderCandidate(key,"new room")))) }
    @Test fun endedCoursesRejectDelayedBroadcastIncludingExactBoundary() { assertTrue(select(time=key.end).isEmpty());assertTrue(select(time=key.end+1).isEmpty()) }
    @Test fun delayedButStillOngoingCourseMayBeDelivered() { assertEquals(listOf(latest.value),select(time=key.start+60_000)) }
    @Test fun smallerCurrentAdvanceRejectsPrematureOldBroadcast() { assertTrue(select(advance=0).isEmpty());assertEquals(listOf(latest.value),select(advance=0,time=key.start)) }
    @Test fun unrelatedActionsAndInvalidAdvanceAreRejected() { for(action in listOf(null,"", "com.dolphin.calendar.OTHER"))assertTrue(select(action=action).isEmpty());assertTrue(select(advance=-1).isEmpty());assertTrue(select(advance=1441).isEmpty()) }
    @Test fun invalidKeysCannotCreateNotifications() {
        for(invalid in listOf(key.copy(courseId=""),key.copy(start=0),key.copy(end=key.start)))
            assertTrue(select(queued=listOf(invalid),current=listOf(ReminderCandidate(invalid,"invalid"))).isEmpty())
        assertTrue(select(queued=listOf(key.copy(courseId="different"))).isEmpty())
    }
    @Test fun duplicateReferencesProduceOneNotificationAndOtherCoursesRemain() {
        val second=key.copy(courseId="second");assertEquals(listOf(latest.value,"second course"),select(queued=listOf(key,key,second),current=listOf(latest,ReminderCandidate(second,"second course"))))
    }
}
