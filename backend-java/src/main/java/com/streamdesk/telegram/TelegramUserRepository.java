package com.streamdesk.telegram;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

/**
 * Репозиторий Telegram-пользователей — замена getTelegramUserByTelegramId/createTelegramUser и т.п.
 */
public interface TelegramUserRepository extends JpaRepository<TelegramUser, String> {

    Optional<TelegramUser> findByTelegramId(String telegramId);
}
