package com.streamdesk.role;

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
 * Сущность роли — перенос таблицы "roles" из shared/schema.ts.
 */
@Entity
@Table(name = "roles")
@Getter
@Setter
public class Role {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "name", nullable = false, unique = true)
    private String name;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Column(name = "description")
    private String description;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "permissions", nullable = false, columnDefinition = "jsonb")
    private List<Object> permissions = new ArrayList<>();

    @Column(name = "color")
    private String color = "#6B7280";

    @Column(name = "is_system")
    private Boolean isSystem = false;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();
}
