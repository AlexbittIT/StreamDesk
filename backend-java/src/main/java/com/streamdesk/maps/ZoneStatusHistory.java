package com.streamdesk.maps;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * Запись истории смены статуса зоны — таблица {@code zone_status_history}
 * (StatusHistoryEntry из docs/maps-api.md §2). Пишется на КАЖДЫЙ переход: кто/когда/из→в.
 */
@Entity
@Table(name = "zone_status_history")
@Getter
@Setter
public class ZoneStatusHistory {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "zone_id", nullable = false)
    private String zoneId;

    @Column(name = "from_status", nullable = false)
    private String fromStatus;

    @Column(name = "to_status", nullable = false)
    private String toStatus;

    @Column(name = "changed_by")
    private String changedBy;

    @Column(name = "changed_at", nullable = false)
    private Instant changedAt = Instant.now();
}
