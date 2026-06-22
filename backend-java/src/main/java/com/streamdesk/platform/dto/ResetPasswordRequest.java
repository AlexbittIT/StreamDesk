package com.streamdesk.platform.dto;

/**
 * Тело POST /api/platform/users/{id}/reset-password.
 */
public record ResetPasswordRequest(String password) {
}
