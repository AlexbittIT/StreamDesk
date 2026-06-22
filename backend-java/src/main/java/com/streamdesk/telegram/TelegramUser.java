package com.streamdesk.telegram;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * Сущность Telegram-пользователя — перенос таблицы "telegram_users" из shared/schema.ts.
 */
@Entity
@Table(name = "telegram_users")
@Getter
@Setter
public class TelegramUser {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "telegram_id", nullable = false, unique = true)
    private String telegramId;

    @Column(name = "username")
    private String username;

    @Column(name = "first_name")
    private String firstName;

    @Column(name = "last_name")
    private String lastName;

    @Column(name = "photo_url")
    private String photoUrl;

    @Column(name = "auth_date")
    private Instant authDate;

    @Column(name = "user_id")
    private String userId;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();
}
