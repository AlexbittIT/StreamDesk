package com.streamdesk.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Сущность пользователя — перенос таблицы "users" из shared/schema.ts.
 * Колонки отображены 1:1 на существующую БД (snake_case -> camelCase).
 */
@Entity
@Table(name = "users")
@Getter
@Setter
public class User {

    // id — varchar с gen_random_uuid() в БД. Генерируем UUID в коде (как crypto.randomUUID() в TS).
    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "username", nullable = false, unique = true)
    private String username;

    // Хеш bcrypt. Не отдавать наружу в ответах API.
    @Column(name = "password", nullable = false)
    private String password;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "email")
    private String email;

    @Column(name = "phone")
    private String phone;

    @Column(name = "position")
    private String position;

    @Column(name = "department")
    private String department;

    @Column(name = "role", nullable = false)
    private String role = "employee";

    // jsonb permissions — массив разрешений. Hibernate 6 маппит List<String> на jsonb нативно.
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "permissions", columnDefinition = "jsonb")
    private List<String> permissions = new ArrayList<>();

    @Column(name = "telegram_id", unique = true)
    private String telegramId;

    @Column(name = "avatar")
    private String avatar;

    @Column(name = "active")
    private Boolean active = true;

    // Перманентный бан администратором: вход навсегда закрыт (в отличие от active=false,
    // который лишь «ожидает подтверждения» и может быть реактивирован по приглашению).
    @Column(name = "banned")
    private Boolean banned = false;

    // Согласие на дублирование уведомлений почтой (помимо in-app). Подтверждается в настройках.
    @Column(name = "email_notifications_enabled")
    private Boolean emailNotificationsEnabled = true;

    @Column(name = "onboarding_completed")
    private Boolean onboardingCompleted = false;

    @Column(name = "workspace_mode")
    private String workspaceMode = "pending";

    @Column(name = "last_login")
    private Instant lastLogin;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();
}