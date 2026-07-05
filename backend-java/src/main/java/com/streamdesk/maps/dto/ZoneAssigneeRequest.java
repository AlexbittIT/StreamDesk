package com.streamdesk.maps.dto;

/**
 * Тело PUT /api/maps/{mapId}/zones/{zoneId}/assignee (docs/openapi-maps.yaml ZoneAssigneeRequest).
 * {@code assigneeId == null} — снять ответственного. {@code assigneeType} — {@code user}|{@code team}
 * (по умолчанию {@code user}).
 */
public record ZoneAssigneeRequest(String assigneeId, String assigneeType) {
}
