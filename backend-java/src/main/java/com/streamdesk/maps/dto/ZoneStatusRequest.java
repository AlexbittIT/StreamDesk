package com.streamdesk.maps.dto;

/**
 * Тело PATCH /api/maps/{mapId}/zones/{zoneId}/status (docs/openapi-maps.yaml ZoneStatusRequest).
 * {@code version} обязателен: рассинхрон → 409.
 */
public record ZoneStatusRequest(String status, Integer version) {
}
