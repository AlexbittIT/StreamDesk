package com.streamdesk.project;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * Сущность столбца проекта — перенос таблицы "project_columns" из shared/schema.ts.
 */
@Entity
@Table(name = "project_columns")
@Getter
@Setter
public class ProjectColumn {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "project_id", nullable = false)
    private String projectId;

    @Column(name = "name", nullable = false)
    private String name;

    // "order" — зарезервированное слово SQL, экранируем кавычками (backtick -> кавычки диалекта).
    @Column(name = "`order`", nullable = false)
    private Integer order = 0;

    @Column(name = "color")
    private String color;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();
}
