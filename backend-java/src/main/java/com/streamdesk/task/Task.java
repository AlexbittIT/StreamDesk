package com.streamdesk.task;

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
 * Сущность задачи — перенос таблицы "tasks" из shared/schema.ts.
 */
@Entity
@Table(name = "tasks")
@Getter
@Setter
public class Task {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "description")
    private String description;

    @Column(name = "status", nullable = false)
    private String status = "todo";

    @Column(name = "priority", nullable = false)
    private String priority = "medium";

    @Column(name = "creator_id", nullable = false)
    private String creatorId;

    @Column(name = "assignee_id")
    private String assigneeId;

    @Column(name = "company_id")
    private String companyId;

    @Column(name = "due_date")
    private Instant dueDate;

    @Column(name = "start_date")
    private Instant startDate;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "category")
    private String category;

    @Column(name = "project_id")
    private String projectId;

    @Column(name = "project_column_id")
    private String projectColumnId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "tags", columnDefinition = "jsonb")
    private List<Object> tags = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "subtasks", columnDefinition = "jsonb")
    private List<Object> subtasks = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "attachments", columnDefinition = "jsonb")
    private List<Object> attachments = new ArrayList<>();

    @Column(name = "parent_task_id")
    private String parentTaskId;

    @Column(name = "estimated_hours")
    private Integer estimatedHours;

    @Column(name = "actual_hours")
    private Integer actualHours;

    @Column(name = "repository")
    private String repository;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "links", columnDefinition = "jsonb")
    private List<Object> links = new ArrayList<>();

    @Column(name = "yougile_task_id")
    private String yougileTaskId;

    @Column(name = "yougile_board_id")
    private String yougileBoardId;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at")
    private Instant updatedAt = Instant.now();
}
