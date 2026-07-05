package com.streamdesk.maps.dto;

/**
 * Тело POST/PUT /api/maps — метаданные карты (docs/openapi-maps.yaml MapCreateRequest).
 * {@code companyId} — опционально; если не задан, берётся первая компания пользователя.
 */
public record MapCreateRequest(String name, String venueId, String companyId) {
}
