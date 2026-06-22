package com.streamdesk.company;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Сущность компании — перенос таблицы "companies" из shared/schema.ts.
 */
@Entity
@Table(name = "companies")
@Getter
@Setter
public class Company {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "slug")
    private String slug;

    @Column(name = "description")
    private String description;

    @Column(name = "owner_id", nullable = false)
    private String ownerId;

    @Column(name = "status", nullable = false)
    private String status = "active";

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "settings", columnDefinition = "jsonb")
    private Map<String, Object> settings = new HashMap<>();

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at")
    private Instant updatedAt = Instant.now();
}