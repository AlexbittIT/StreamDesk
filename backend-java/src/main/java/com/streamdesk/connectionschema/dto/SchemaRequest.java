package com.streamdesk.connectionschema.dto;

/**
 * Тело создания/обновления схемы (/api/connection-schemas).
 */
public record SchemaRequest(String name, String description) {
}
