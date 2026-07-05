package com.streamdesk.maps.dto;

import com.streamdesk.maps.ZonePoint;

import java.util.List;

/**
 * Тело POST /api/maps/{mapId}/zones (docs/openapi-maps.yaml ZoneCreateRequest).
 * {@code status} опционален — по умолчанию «Не начато».
 */
public record ZoneCreateRequest(String name, List<ZonePoint> points, String status) {
}
