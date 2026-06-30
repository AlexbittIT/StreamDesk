package com.streamdesk.estimate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Смета — контейнер, который связывает расчёт с проектом (двусторонняя связь
 * смета↔проект) и хранит актуальный снимок. История версий — в EstimateVersion.
 */
@Entity
@Table(name = "estimates")
@Getter
@Setter
public class Estimate {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "title", nullable = false)
    private String title;

    /** Привязка к проекту (карточка проекта показывает свою смету и обратно). */
    @Column(name = "project_id")
    private String projectId;

    @Column(name = "company_id")
    private String companyId;

    @Column(name = "owner_id")
    private String ownerId;

    @Column(name = "status", nullable = false)
    private String status = "draft";

    /** Актуальный снимок расчёта (структура EstimateResult с фронта). */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "data", columnDefinition = "jsonb")
    private Map<String, Object> data = new LinkedHashMap<>();

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at")
    private Instant updatedAt = Instant.now();
}
