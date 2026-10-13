package com.dolphin.calendar

import java.io.IOException
import java.io.OutputStream

/** A provider's null stream or partial write must never be reported as success. */
object DocumentExport {
    fun write(text: String, open: () -> OutputStream?) {
        val stream = open() ?: throw IOException("文件提供方未能打开输出文件")
        stream.use { it.write(text.toByteArray(Charsets.UTF_8)) }
    }
}
