package com.streamdesk.auth.dto;

/**
 * Тело запроса /api/auth/register.
 */
public record RegisterRequest(String username, String password, String name, String email, String invite) {
}