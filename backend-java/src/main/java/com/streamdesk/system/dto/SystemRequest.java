package com.streamdesk.system.dto;

import java.util.Map;

/**
 * Тело создания/обновления системы (/api/systems).
 */
public record SystemRequest(
        String name,
        String type,
        String location,
        String ipAddress,
        String status,
        Map<String, Object> specifications
) {
}
