package com.streamdesk.vmix.dto;

import java.util.List;

/**
 * Тело POST /api/vmix/scheduler/events.
 */
public record SchedulerEventRequest(
        String title,
        String startTime,
        String input,
        List<Object> actions,
        String vmixHost,
        Integer vmixPort
) {
}
