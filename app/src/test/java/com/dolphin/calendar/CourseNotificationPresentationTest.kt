package com.dolphin.calendar

import org.junit.Assert.*
import org.junit.Test

class CourseNotificationPresentationTest {
    @Test fun expandedJourneyKeepsFullDestinationOnlyInMapAction() {
        val room = "16栋203号教室"
        val view = courseNotificationPresentation("智慧财经素养",room,CourseNotificationStage.JOURNEY,"智慧财经素养教程")
        assertEquals("智慧财经素养",view.title)
        assertEquals("去$room",view.destinationAction)
        assertEquals("16栋",view.collapsedBuilding)
        assertFalse(view.title.contains(room))
        assertFalse(view.text.contains(room))
        assertFalse(view.text.contains("2/3"))
        assertFalse(view.text.contains("①"))
        assertTrue(view.text.startsWith("正在前往教室"))
        assertTrue(view.text.contains("教材：智慧财经素养教程"))
    }

    @Test fun allStagesShareAddressPlacementWithoutNumberedProgress() {
        val phases = mapOf(CourseNotificationStage.REMINDER to "课前提醒",CourseNotificationStage.JOURNEY to "正在前往教室",CourseNotificationStage.ARRIVED to "已到达")
        for((stage,phase) in phases) {
            val view = courseNotificationPresentation("大学英语","26栋207号教室",stage)
            assertEquals("大学英语",view.title)
            assertEquals(phase,view.text)
            assertEquals("去26栋207号教室",view.destinationAction)
            assertEquals("26栋",view.collapsedBuilding)
            assertFalse((view.title + view.text).contains("207"))
            assertFalse(view.text.contains(Regex("[123]/3")))
        }
    }

    @Test fun longCourseNameRemainsWholeAndSeparateFromAddress() {
        val name = "习近平新时代中国特色社会主义思想概论与实践课程"
        val view = courseNotificationPresentation(name,"教学楼A203号教室",CourseNotificationStage.JOURNEY)
        assertEquals(name,view.title)
        assertEquals("去教学楼A203号教室",view.destinationAction)
        assertEquals("教学楼",view.collapsedBuilding)
        assertFalse(view.title.contains("A203"))
    }

    @Test fun emptyRoomAndExistingPlaceholderDoNotProduceFakeAddress() {
        for(room in listOf("", "  ", "教室待填写")) {
            val view = courseNotificationPresentation("测试课程",room,CourseNotificationStage.JOURNEY)
            assertEquals("去教室",view.destinationAction)
            assertEquals("去上课",view.collapsedBuilding)
            assertEquals("正在前往教室",view.text)
            assertFalse(view.text.contains("待填写"))
        }
    }

    @Test fun buildingCapsuleRetainsShortLabelsAndFallbackForLongOrUnknownPlace() {
        for((room,building) in listOf("16栋203号教室" to "16栋", "三幢201" to "三幢", "图书馆101" to "图书馆", "非常长的校区教学楼101" to "去上课", "操场西区" to "去上课")) {
            val view = courseNotificationPresentation("课程",room,CourseNotificationStage.JOURNEY)
            assertEquals(building,view.collapsedBuilding)
            assertTrue(view.collapsedBuilding.length <= 6)
            assertEquals("去$room",view.destinationAction)
        }
    }

    @Test fun unavailableBookDoesNotAddPlaceholderNoise() {
        for(book in listOf("", "  ", "尚未标记")) {
            val view = courseNotificationPresentation("课程","16栋203号教室",CourseNotificationStage.REMINDER,book)
            assertEquals("课前提醒",view.text)
        }
    }
}
