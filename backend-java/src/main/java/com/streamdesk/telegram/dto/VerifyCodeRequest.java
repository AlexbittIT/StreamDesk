package com.streamdesk.telegram.dto;

/**
 * Тело POST /api/auth/telegram/verify-code.
 * phoneNumber играет роль telegramId (как в backend/routes.ts).
 */
public record VerifyCodeRequest(String code, String phoneNumber, Long timestamp) {
}
