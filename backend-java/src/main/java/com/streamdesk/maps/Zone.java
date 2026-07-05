package com.streamdesk.maps;

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
 * Зона на карте — таблица {@code zones} из контракта «Схема площадки» (docs/maps-api.md §2).
 *
 * {@code status} хранится строкой ({@link ZoneStatus#apiValue()}); переходы валидирует
 * {@link ZoneStatus}. {@code version} — оптимистичная блокировка (проверяется вручную в сервисе,
 * а не через JPA {@code @Version}, чтобы отдавать 409 с понятной причиной и last-write-wins в realtime).
 */
@Entity
@Table(name = "zones")
@Getter
@Setter
public class Zone {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "map_id", nullable = false)
    private String mapId;

    @Column(name = "company_id", nullable = false)
    private String companyId;

    @Column(name = "name", nullable = false)
    private String name;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "points", columnDefinition = "jsonb")
    private List<ZonePoint> points = new ArrayList<>();

    @Column(name = "status", nullable = false)
    private String status = ZoneStatus.defaultStatus().apiValue();

    @Column(name = "assignee_id")
    private String assigneeId;

    @Column(name = "assignee_type")
    private String assigneeType;

    @Column(name = "color")
    private String color;

    @Column(name = "version", nullable = false)
    private int version = 1;

    @Column(name = "comments_count", nullable = false)
    private int commentsCount = 0;

    @Column(name = "photos_count", nullable = false)
    private int photosCount = 0;

    @Column(name = "created_by")
    private String createdBy;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at")
    private Instant updatedAt = Instant.now();

    /** Текущий статус как enum (для логики переходов). */
    public ZoneStatus statusEnum() {
        return ZoneStatus.fromApi(status);
    }
}
