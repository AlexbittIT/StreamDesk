package com.streamdesk.label.dto;

import java.util.List;
import java.util.Map;

/**
 * Тело POST /api/equipment/labels/print-bitmaps.
 * Каждая этикетка: { widthBytes, heightDots, xDots, yDots, bitmapBase64 }.
 */
public record BitmapsRequest(List<Map<String, Object>> labels) {
}
