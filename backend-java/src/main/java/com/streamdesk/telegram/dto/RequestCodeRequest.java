package com.streamdesk.telegram.dto;

/**
 * Тело POST /api/auth/telegram/request-code.
 */
public record RequestCodeRequest(String telegramId, String chatId) {
}
