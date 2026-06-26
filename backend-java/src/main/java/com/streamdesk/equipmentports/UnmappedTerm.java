package com.streamdesk.equipmentports;

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
 * Очередь разъёмов, которых нет в справочнике (Task 2). Когда ИИ встречает в спеке
 * обозначение, не сматчившееся ни на один код, оно НЕ угадывается и НЕ теряется —
 * попадает сюда на ручное добавление новой строки в справочник.
 */
@Entity
@Table(name = "unmapped_terms")
@Getter
@Setter
public class UnmappedTerm {

    public static final String STATUS_PENDING = "pending";
    public static final String STATUS_ADDED = "added";
    public static final String STATUS_DISMISSED = "dismissed";

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "term", nullable = false)
    private String term;

    @Column(name = "manufacturer")
    private String manufacturer;

    @Column(name = "model")
    private String model;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "context", columnDefinition = "jsonb")
    private Map<String, Object> context = new HashMap<>();

    @Column(name = "suggested_code")
    private String suggestedCode;

    @Column(name = "status", nullable = false)
    private String status = STATUS_PENDING;

    @Column(name = "resolved_by")
    private String resolvedBy;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();
}
