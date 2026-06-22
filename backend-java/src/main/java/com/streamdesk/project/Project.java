package com.streamdesk.project;

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
 * Сущность проекта — перенос таблицы "projects" из shared/schema.ts.
 */
@Entity
@Table(name = "projects")
@Getter
@Setter
public class Project {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "owner_id")
    private String ownerId;

    @Column(name = "company_id")
    private String companyId;

    @Column(name = "visibility", nullable = false)
    private String visibility = "company";

    @Column(name = "client")
    private String client;

    @Column(name = "description")
    private String description;

    @Column(name = "status", nullable = false)
    private String status = "planning";

    @Column(name = "category")
    private String category;

    @Column(name = "deadline")
    private Instant deadline;

    @Column(name = "assigned_to")
    private String assignedTo;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "participants", columnDefinition = "jsonb")
    private List<Object> participants = new ArrayList<>();

    @Column(name = "show_in_task_manager")
    private Boolean showInTaskManager = false;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "devices", columnDefinition = "jsonb")
    private List<Object> devices = new ArrayList<>();

    @Column(name = "storage_location")
    private String storageLocation;

    @Column(name = "estimated_size")
    private String estimatedSize;

    @Column(name = "notes")
    private String notes;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "columns", columnDefinition = "jsonb")
    private List<Object> columns = new ArrayList<>();

    @Column(name = "yougile_board_id")
    private String yougileBoardId;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();
}
