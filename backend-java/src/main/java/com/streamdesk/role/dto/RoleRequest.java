package com.streamdesk.role.dto;

import java.util.List;

/**
 * Тело создания/обновления роли (/api/roles).
 */
public record RoleRequest(
        String name,
        String displayName,
        String description,
        List<Object> permissions,
        String color,
        Boolean isSystem
) {
}
