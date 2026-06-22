package com.streamdesk.analytics;

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
 * Сущность аналитического события — перенос таблицы "analytics_events" из shared/schema.ts.
 */
@Entity
@Table(name = "analytics_events")
@Getter
@Setter
public class AnalyticsEvent {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "event_type", nullable = false)
    private String eventType;

    @Column(name = "entity_id")
    private String entityId;

    @Column(name = "entity_type", nullable = false)
    private String entityType;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "data", nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> data = new HashMap<>();

    @Column(name = "timestamp")
    private Instant timestamp = Instant.now();
}
