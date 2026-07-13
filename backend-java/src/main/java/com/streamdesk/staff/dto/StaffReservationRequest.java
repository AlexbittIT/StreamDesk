package com.streamdesk.staff.dto;

/**
 * Тело POST /api/staff-reservations. Время — строкой (ISO/epoch), как у брони оборудования.
 * {@code companyId} опционален: если не задан, берётся первая компания пользователя.
 */
public record StaffReservationRequest(
        String staffId,
        String companyId,
        String eventId,
        String startTime,
        String endTime,
        String status
) {
}
