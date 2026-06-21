package com.streamdesk.telegram.dto;

/**
 * Тело POST /api/auth/telegram/link.
 */
public record LinkRequest(String telegramId, String userId) {
}
