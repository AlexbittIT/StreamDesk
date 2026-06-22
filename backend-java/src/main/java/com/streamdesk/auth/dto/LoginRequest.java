package com.streamdesk.auth.dto;

/**
 * Тело запроса /api/auth/login. Поле invite — необязательный токен приглашения.
 */
public record LoginRequest(String username, String password, String invite) {
}