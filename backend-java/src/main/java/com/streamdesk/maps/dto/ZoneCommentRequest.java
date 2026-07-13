package com.streamdesk.maps.dto;

/** Тело POST /api/maps/{mapId}/zones/{zoneId}/comments — текст нового комментария. */
public record ZoneCommentRequest(String text) {
}
