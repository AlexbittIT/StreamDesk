package com.streamdesk.repository;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * Сущность репозитория кода — перенос таблицы "repositories" из shared/schema.ts.
 * Назван CodeRepository, чтобы не путать со Spring Data репозиториями.
 */
@Entity
@Table(name = "repositories")
@Getter
@Setter
public class CodeRepository {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "url", nullable = false)
    private String url;

    @Column(name = "type")
    private String type = "github";

    @Column(name = "description")
    private String description;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at")
    private Instant updatedAt = Instant.now();
}
