package com.dolphin.calendar

import org.junit.Assert.*
import org.junit.Test

class CalendarHistoryTest {
    @Test fun manuallyHiddenCurrentCalendarRemainsRestorable() {
        val calendars = mapOf(10L to false, 20L to false, 30L to true)
        assertEquals(mapOf(10L to false, 30L to true), CalendarHistory.previous(calendars, listOf(20L)))
        assertEquals(mapOf(10L to false, 20L to false, 30L to true), calendars)
    }
    @Test fun manuallyShownUndoCopyIsTreatedAsCurrentUserData() {
        assertEquals(mapOf(20L to true), CalendarHistory.previous(mapOf(20L to true), listOf(20L)))
    }
    @Test fun restoreRetainsEachOriginalVisibilityAndIgnoresUnlistedIds() {
        assertEquals(mapOf(10L to false, 30L to true), CalendarHistory.restoreVisibility(listOf(10L, 30L), mapOf(10L to false, 30L to true, 40L to true)))
    }
    @Test fun legacyUndoRecordRestoresPreviouslyVisibleCalendars() {
        assertEquals(mapOf(10L to true, 20L to true), CalendarHistory.restoreVisibility(listOf(10L, 20L), null))
        assertTrue(CalendarHistory.restoreVisibility(emptyList(), null).isEmpty())
    }
}
