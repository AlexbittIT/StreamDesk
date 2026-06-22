package com.streamdesk.vmix.dto;

import java.util.List;

/**
 * Тело PUT /api/vmix/scheduler/events/{id}.
 */
public record SchedulerEventUpdate(
        String title,
        String startTime,
        String input,
        List<Object> actions,
        String status,
        String vmixHost,
        Integer vmixPort,
        String executedAt,
        String errorMessage
) {
}
