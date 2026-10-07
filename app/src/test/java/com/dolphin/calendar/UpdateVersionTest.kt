package com.dolphin.calendar

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdateVersionTest {
    @Test fun numericalVersionOrdering() {
        assertTrue(UpdateVersion.newer("v1.10.0", "1.9.9"))
        assertTrue(UpdateVersion.newer("2.0.0", "1.99.99"))
        assertTrue(UpdateVersion.newer("V1.4.4", "1.4.3"))
        assertFalse(UpdateVersion.newer("1.4.3", "1.4.3"))
        assertFalse(UpdateVersion.newer("1.3.99", "1.4.3"))
    }
    @Test fun previewsAndUnsupportedTagsAreNeverOffered() {
        for (tag in listOf("v9.0.0-beta", "v9.0", "latest", "9.0.0+preview", "99999.0.0", "javascript:alert(1)")) {
            assertFalse(tag, UpdateVersion.newer(tag, "1.4.3"))
        }
    }
}
