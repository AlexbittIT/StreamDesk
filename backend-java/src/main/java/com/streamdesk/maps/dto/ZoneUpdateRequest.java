package com.streamdesk.maps.dto;

import com.streamdesk.maps.ZonePoint;

import java.util.List;

/**
 * Тело PUT /api/maps/{mapId}/zones/{zoneId} — частичное обновление имени/геометрии
 * (docs/openapi-maps.yaml ZoneUpdateRequest). {@code version} обязателен для оптимистичной блокировки.
 */
public record ZoneUpdateRequest(String name, List<ZonePoint> points, Integer version) {
}
