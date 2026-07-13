package com.streamdesk.maps.dto;

/**
 * Тело POST /api/maps/{mapId}/zones/{zoneId}/photos — URL уже загруженного фото
 * (через /api/equipment/photos/upload).
 */
public record ZonePhotoRequest(String url) {
}
