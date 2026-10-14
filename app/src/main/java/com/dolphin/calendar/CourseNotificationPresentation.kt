package com.dolphin.calendar

enum class CourseNotificationStage { REMINDER, JOURNEY, ARRIVED }

data class CourseNotificationPresentation(
    val title: String,
    val text: String,
    val destinationAction: String,
    val collapsedBuilding: String
)

/** Display fields only: notification identity, navigation and expiry stay with Notifications. */
fun courseNotificationPresentation(
    courseName: String,
    room: String,
    stage: CourseNotificationStage,
    bookTitle: String = ""
): CourseNotificationPresentation {
    val place = room.trim().ifBlank { "教室待填写" }
    val phase = when(stage) {
        CourseNotificationStage.REMINDER -> "课前提醒"
        CourseNotificationStage.JOURNEY -> "正在前往教室"
        CourseNotificationStage.ARRIVED -> "已到达"
    }
    val book = bookTitle.trim().takeIf { it.isNotEmpty() && it != "尚未标记" }
    return CourseNotificationPresentation(
        title = courseName.trim().ifBlank { "课程" },
        text = phase + (book?.let { "\n教材：$it" } ?: ""),
        destinationAction = if(place == "教室待填写") "去教室" else "去$place",
        // Retain the existing short building label used by Android 16 / ColorOS capsules.
        collapsedBuilding = Regex("^.*?(?:栋|幢|楼|馆)").find(place)?.value
            ?.takeIf { it.length <= 6 } ?: "去上课"
    )
}
