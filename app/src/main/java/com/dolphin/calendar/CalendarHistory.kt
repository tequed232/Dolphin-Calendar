package com.dolphin.calendar

object CalendarHistory {
    /** Hidden active calendars are user data; only known, still-hidden undo copies retire. */
    fun previous(owned: Map<Long, Boolean>, backupIds: Collection<Long>): Map<Long, Boolean> =
        owned.filter { (id, visible) -> visible || id !in backupIds }

    /** Old undo records did not store visibility and only backed up visible calendars. */
    fun restoreVisibility(ids: List<Long>, recorded: Map<Long, Boolean>?): Map<Long, Boolean> =
        ids.associateWith { recorded?.get(it) ?: true }
}
