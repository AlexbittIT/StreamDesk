package com.streamdesk.reservation.dto;

/**
 * Тело POST /api/equipment-reservations. Время — строкой (ISO/epoch).
 */
public record ReservationRequest(
        String equipmentId,
        String userId,
        String eventId,
        String startTime,
        String endTime,
        String status
) {
}
