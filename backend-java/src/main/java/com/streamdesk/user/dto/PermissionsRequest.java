package com.streamdesk.user.dto;

import java.util.List;

/**
 * Тело PUT /api/users/{id}/permissions.
 */
public record PermissionsRequest(String role, List<String> permissions) {
}
