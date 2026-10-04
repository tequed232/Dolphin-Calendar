package com.dolphin.calendar

import android.app.NotificationManager
import android.app.Notification
import android.content.Context
import android.os.Build

/** 查询当前通知是否真正成为系统实时活动。 */
object LiveNotificationSupport {
    fun describe(context: Context): String {
        val manager = context.getSystemService(NotificationManager::class.java)
        val active = runCatching { manager.activeNotifications.firstOrNull { it.id == Notifications.ACTIVE_JOURNEY_ID }?.notification }.getOrNull()
        val google = when {
            !ReminderScheduler.settings(context).optBoolean("notificationsEnabled",true) -> "Android 实时通知已在应用设置中关闭"
            !ReminderScheduler.settings(context).optBoolean("journeyLive",true) -> "导航行程实时状态已在应用设置中关闭"
            !manager.areNotificationsEnabled() -> "应用通知未开启；导航仍可使用，但不显示行程通知"
            active == null -> "当前没有进行中的行程通知"
            Build.VERSION.SDK_INT < 36 -> "模拟行程已在通知栏显示；当前系统使用标准行程通知"
            active.flags and Notification.FLAG_PROMOTED_ONGOING != 0 -> "当前行程已提升为系统实时活动"
            !active.hasPromotableCharacteristics() -> "行程通知正在显示，尚未满足实时活动展示条件"
            !manager.canPostPromotedNotifications() -> "行程通知正在显示，实时活动权限尚未开启"
            else -> "行程已请求实时活动，最终展示形态由系统决定"
        }
        return google
    }
}
