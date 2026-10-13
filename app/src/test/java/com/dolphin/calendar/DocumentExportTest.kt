package com.dolphin.calendar

import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.OutputStream
import org.junit.Assert.*
import org.junit.Test

class DocumentExportTest {
    @Test fun missingProviderStreamIsFailure() {
        assertThrows(IOException::class.java) { DocumentExport.write("{}") { null } }
    }
    @Test fun writesActualUtf8AndClosesStream() {
        var closed = false
        val stream = object : ByteArrayOutputStream() { override fun close() { closed = true; super.close() } }
        val source = "{\"课程\":\"程序设计\"}"
        DocumentExport.write(source) { stream }
        assertEquals(source, stream.toString("UTF-8")); assertTrue(closed)
    }
    @Test fun partialWriteFailurePropagatesAndClosesStream() {
        var closed = false
        val stream = object : OutputStream() {
            override fun write(value: Int) { throw IOException("存储空间不足") }
            override fun close() { closed = true }
        }
        assertThrows(IOException::class.java) { DocumentExport.write("{}") { stream } }
        assertTrue(closed)
    }
}
