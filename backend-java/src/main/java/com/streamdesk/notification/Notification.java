package com.streamdesk.notification;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * Сущность уведомления — перенос таблицы "notifications" из shared/schema.ts.
 */
@Entity
@Table(name = "notifications")
@Getter
@Setter
public class Notification {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    // userId nullable — в схеме нет notNull.
    @Column(name = "user_id")
    private String userId;

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "message", nullable = false)
    private String message;

    @Column(name = "type", nullable = false)
    private String type = "info";

    @Column(name = "read")
    private Boolean read = false;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();
}
