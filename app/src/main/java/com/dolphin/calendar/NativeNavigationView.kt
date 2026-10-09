package com.dolphin.calendar

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.view.Gravity
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.graphics.ColorUtils

/** Platform Views keep Android navigation outside the WebView and its scroll/zoom layers. */
internal class NativeNavigationView(context: Context, onDestination: (String) -> Unit) : LinearLayout(context) {
    companion object {
        const val BAR_HEIGHT_DP = 80
        const val RAIL_WIDTH_DP = 88
        val DESTINATIONS = setOf("list", "grid", "search", "settings")
    }

    private val destinations = listOf("list" to "列表", "grid" to "平铺", "search" to "搜索", "settings" to "设置")
    private val items = destinations.map { (id, label) -> NavigationItem(id, label).apply {
        setOnClickListener { onDestination(id) }
    } }
    private var rail = false
    private var selected = "list"
    private var surfaceColor = Color.rgb(246, 247, 242)
    private var accentColor = Color.rgb(59, 101, 80)
    private var textColor = Color.rgb(25, 32, 28)
    private var mutedColor = Color.rgb(88, 99, 91)
    private var lastGeometry: String? = null

    init {
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        elevation = dp(3).toFloat()
        setBackgroundColor(surfaceColor)
        items.forEach(::addView)
        configureGeometry(false, 0, 0, 0, 0, 0)
        renderSelection()
    }

    fun updateAppearance(surface: Int, accent: Int, text: Int, muted: Int) {
        if(surfaceColor == surface && accentColor == accent && textColor == text && mutedColor == muted) return
        // The navigation surface is always opaque, even when the page has a custom background.
        surfaceColor = surface or (0xFF shl 24)
        accentColor = accent; textColor = text; mutedColor = muted
        setBackgroundColor(surfaceColor)
        renderSelection()
    }

    fun select(destination: String) {
        if(destination !in DESTINATIONS || selected == destination) return
        selected = destination
        renderSelection()
    }

    fun configureGeometry(isRail: Boolean, left: Int, top: Int, right: Int, bottom: Int, windowHeight: Int) {
        val geometry = "$isRail:$left:$top:$right:$bottom:$windowHeight:${resources.displayMetrics.density}"
        if(lastGeometry == geometry) return
        lastGeometry = geometry
        rail = isRail
        orientation = if(rail) VERTICAL else HORIZONTAL
        gravity = if(rail) Gravity.TOP or Gravity.CENTER_HORIZONTAL else Gravity.CENTER
        setPadding(left, if(rail) top + dp(8) else 0, if(rail) 0 else right, bottom)
        // Short landscape windows retain all four destinations without reducing the 48 dp hit area.
        val railItemHeight = ((windowHeight - top - bottom - dp(16)) / items.size).coerceIn(dp(48), dp(72))
        items.forEach { item ->
            item.layoutParams = if(rail) LayoutParams(dp(RAIL_WIDTH_DP), railItemHeight)
                else LayoutParams(0, dp(BAR_HEIGHT_DP), 1f)
        }
    }

    private fun renderSelection() {
        items.forEach { item -> item.render(item.destination == selected) }
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density + .5f).toInt()

    private inner class NavigationItem(val destination: String, label: String) : LinearLayout(context) {
        private val indicator = FrameLayout(context)
        private val symbol = NavigationIcon(destination)
        private val caption = TextView(context).apply {
            text = label
            textSize = 12f
            gravity = Gravity.CENTER
            setSingleLine()
            includeFontPadding = false
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        }

        init {
            orientation = VERTICAL
            gravity = Gravity.CENTER
            minimumWidth = dp(48); minimumHeight = dp(48)
            isClickable = true; isFocusable = true
            contentDescription = label
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
            accessibilityDelegate = object : AccessibilityDelegate() {
                override fun onInitializeAccessibilityNodeInfo(host: View, info: AccessibilityNodeInfo) {
                    super.onInitializeAccessibilityNodeInfo(host, info)
                    info.className = "android.widget.Button"
                }
            }
            val image = ImageView(context).apply {
                setImageDrawable(symbol)
                importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
            }
            indicator.addView(image, FrameLayout.LayoutParams(dp(24), dp(24), Gravity.CENTER))
            addView(indicator, LayoutParams(dp(64), dp(32)))
            addView(caption, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply { topMargin = dp(4) })
        }

        fun render(active: Boolean) {
            isSelected = active
            caption.setTextColor(if(active) textColor else mutedColor)
            caption.typeface = if(active) android.graphics.Typeface.DEFAULT_BOLD else android.graphics.Typeface.DEFAULT
            symbol.inkColor = if(active) accentColor else mutedColor
            symbol.active = active
            symbol.invalidateSelf()
            val shape = GradientDrawable().apply {
                cornerRadius = dp(18).toFloat()
                setColor(if(active) ColorUtils.compositeColors(ColorUtils.setAlphaComponent(accentColor, 40), surfaceColor) else Color.TRANSPARENT)
            }
            indicator.background = shape
            val rippleMask = GradientDrawable().apply { cornerRadius = dp(18).toFloat(); setColor(Color.WHITE) }
            background = RippleDrawable(ColorStateList.valueOf(ColorUtils.setAlphaComponent(accentColor, 40)), null, rippleMask)
        }
    }

    private class NavigationIcon(private val destination: String) : Drawable() {
        var inkColor = Color.BLACK
        var active = false
        private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { strokeWidth = 1.8f; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
        override fun draw(canvas: Canvas) {
            canvas.save()
            canvas.translate(bounds.left.toFloat(), bounds.top.toFloat())
            canvas.scale(bounds.width() / 24f, bounds.height() / 24f)
            paint.color = inkColor
            paint.style = Paint.Style.STROKE
            when(destination) {
                "list" -> for(y in listOf(6f, 12f, 18f)) {
                    canvas.drawCircle(3.5f, y, .7f, paint)
                    canvas.drawLine(7f, y, 21f, y, paint)
                }
                "grid" -> {
                    paint.style = if(active) Paint.Style.FILL else Paint.Style.STROKE
                    for(x in listOf(3f, 13f)) for(y in listOf(3f, 13f)) canvas.drawRoundRect(x, y, x + 8f, y + 8f, 1f, 1f, paint)
                }
                "search" -> {
                    canvas.drawCircle(10.5f, 10.5f, 6.5f, paint)
                    canvas.drawLine(15.3f, 15.3f, 21f, 21f, paint)
                }
                "settings" -> {
                    val gear = Path()
                    for(index in 0 until 32) {
                        val angle = index * Math.PI / 16 - Math.PI / 2
                        val radius = if(index % 4 == 0 || index % 4 == 3) 10f else 8f
                        val x = 12f + kotlin.math.cos(angle).toFloat() * radius
                        val y = 12f + kotlin.math.sin(angle).toFloat() * radius
                        if(index == 0) gear.moveTo(x, y) else gear.lineTo(x, y)
                    }
                    gear.close()
                    canvas.drawPath(gear, paint)
                    canvas.drawCircle(12f, 12f, 3.3f, paint)
                }
            }
            canvas.restore()
        }
        override fun setAlpha(alpha: Int) { paint.alpha = alpha; invalidateSelf() }
        override fun setColorFilter(colorFilter: android.graphics.ColorFilter?) { paint.colorFilter = colorFilter; invalidateSelf() }
        @Suppress("OVERRIDE_DEPRECATION") override fun getOpacity() = android.graphics.PixelFormat.TRANSLUCENT
    }
}
