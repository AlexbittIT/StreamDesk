package com.streamdesk.stream.dto;

import java.util.Map;

/**
 * Тело создания/обновления трансляции (/api/streams).
 * Время (startTime/endTime) — строкой (ISO/epoch), парсится в сервисе.
 */
public record StreamRequest(
        String title,
        String platform,
        String streamKey,
        Integer bitrate,
        Integer fps,
        String resolution,
        String status,
        Integer viewerCount,
        String startTime,
        String endTime,
        String userId,
        String systemId,
        Map<String, Object> metadata
) {
}
