package com.streamdesk.computer.dto;

import java.util.Map;

/**
 * Тело создания/обновления компьютера (/api/computers).
 */
public record ComputerRequest(
        String name,
        String location,
        String purpose,
        String status,
        String ipAddress,
        Map<String, Object> components,
        String notes
) {
}
