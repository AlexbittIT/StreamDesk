package com.streamdesk.location.dto;

/**
 * Тело создания локации (/api/locations).
 */
public record LocationRequest(
        String name,
        String description,
        String type
) {
}
