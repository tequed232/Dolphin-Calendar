package com.dolphin.calendar

/** Only stable semantic versions can offer an upgrade; never downgrade or offer a preview. */
object UpdateVersion {
    private fun parts(value: String): List<Int>? {
        val match = Regex("^[vV]?(\\d{1,4})\\.(\\d{1,4})\\.(\\d{1,4})$").matchEntire(value.trim()) ?: return null
        return match.groupValues.drop(1).map(String::toInt)
    }
    fun newer(candidate: String, installed: String): Boolean {
        val next = parts(candidate) ?: return false
        val current = parts(installed) ?: return false
        for (i in 0..2) if (next[i] != current[i]) return next[i] > current[i]
        return false
    }
}
