package com.streamdesk.project.dto;

/**
 * Тело создания/обновления столбца проекта.
 */
public record ColumnRequest(
        String name,
        String color,
        Integer order
) {
}
