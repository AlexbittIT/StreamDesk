package com.streamdesk.telegram.dto;

/**
 * Тело POST /api/auth/telegram (создание записи Telegram-пользователя).
 */
public record TelegramUserRequest(
        String telegramId,
        String username,
        String firstName,
        String lastName,
        String photoUrl,
        String authDate,
        String userId
) {
}
