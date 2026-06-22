package com.streamdesk.room.dto;

/**
 * Тело PUT /api/rooms/{id}.
 */
public record RoomUpdateRequest(String name, String type, Integer capacity, String accessLevel) {
}
