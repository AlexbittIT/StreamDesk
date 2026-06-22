package com.streamdesk.connectionschema.dto;

import java.util.List;
import java.util.Map;

/**
 * Тело создания/обновления компонента схемы.
 */
public record ComponentRequest(
        String type,
        String name,
        Map<String, Object> position,
        Map<String, Object> properties,
        List<Object> connections
) {
}
