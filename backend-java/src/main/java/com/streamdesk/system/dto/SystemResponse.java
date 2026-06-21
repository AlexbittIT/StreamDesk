package com.streamdesk.system.dto;

import com.streamdesk.system.SystemEntity;

import java.time.Instant;
import java.util.Map;

/**
 * Представление системы для ответа. Для агентных систем status и specifications
 * могут быть пересчитаны (живой статус + agent.staleSec), как в Express.
 */
public record SystemResponse(
        String id,
        String name,
        String type,
        String location,
        String ipAddress,
        String status,
        Instant lastPing,
        Map<String, Object> specifications,
        Instant createdAt
) {

    public static SystemResponse from(SystemEntity s) {
        return new SystemResponse(
                s.getId(), s.getName(), s.getType(), s.getLocation(), s.getIpAddress(),
                s.getStatus(), s.getLastPing(), s.getSpecifications(), s.getCreatedAt());
    }

    public static SystemResponse enriched(SystemEntity s, String status, Map<String, Object> specifications) {
        return new SystemResponse(
                s.getId(), s.getName(), s.getType(), s.getLocation(), s.getIpAddress(),
                status, s.getLastPing(), specifications, s.getCreatedAt());
    }
}
