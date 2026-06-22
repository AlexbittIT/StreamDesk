package com.streamdesk.yougile;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/**
 * Кэш пользователей YouGile — перенос таблицы "yougile_users" из shared/schema.ts.
 */
@Entity
@Table(name = "yougile_users")
@Getter
@Setter
public class YougileUser {

    @Id
    @Column(name = "id")
    private String id;

    @Column(name = "email")
    private String email;

    @Column(name = "username")
    private String username;

    @Column(name = "synced_at")
    private Instant syncedAt = Instant.now();
}
