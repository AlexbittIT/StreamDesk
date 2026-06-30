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
 * Версия сметы — неизменяемый снимок расчёта на момент сохранения.
 * Версии создаются и просматриваются (раньше жили в localStorage фронта).
 */
@Entity
@Table(name = "estimate_versions")
@Getter
@Setter
public class EstimateVersion {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "estimate_id", nullable = false)
    private String estimateId;

    /** Порядковый номер версии в рамках сметы (1, 2, 3, ...). */
    @Column(name = "version_no", nullable = false)
    private Integer versionNo = 1;

    @Column(name = "title", nullable = false)
    private String title;

    /** Итог по смете на момент снимка — для быстрого показа в списке версий. */
    @Column(name = "subtotal")
    private Double subtotal = 0.0;

    @Column(name = "items_count")
    private Integer itemsCount = 0;

    /** Полный снимок расчёта (структура EstimateResult с фронта). */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "data", columnDefinition = "jsonb")
    private Map<String, Object> data = new LinkedHashMap<>();

    @Column(name = "created_by")
    private String createdBy;

    @Column(name = "saved_at")
    private Instant savedAt = Instant.now();
}
