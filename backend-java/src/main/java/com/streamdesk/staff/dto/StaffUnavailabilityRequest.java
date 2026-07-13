package com.streamdesk.staff.dto;

/**
 * Тело POST /api/staff-availability/unavailability — интервал недоступности сотрудника.
 */
public record StaffUnavailabilityRequest(
        String staffId,
        String companyId,
        String startTime,
        String endTime,
        String reason
) {
}
