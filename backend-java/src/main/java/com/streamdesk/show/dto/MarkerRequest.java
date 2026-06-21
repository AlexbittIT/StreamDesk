package com.streamdesk.show.dto;

/**
 * Тело создания/обновления маркера.
 */
public record MarkerRequest(String timecode, String type, String value, String note) {
}
