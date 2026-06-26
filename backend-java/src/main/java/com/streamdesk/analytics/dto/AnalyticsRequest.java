package com.streamdesk.analytics.dto;

import java.util.Map;

/**
 * Тело POST /api/analytics.
 */
public record AnalyticsRequest(
        String eventType,
        String entityId,
        String entityType,
        Map<String, Object> data
) {
}
