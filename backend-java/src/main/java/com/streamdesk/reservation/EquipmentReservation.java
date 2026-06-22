package com.streamdesk.reservation;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * Сущность резервации оборудования — перенос таблицы "equipment_reservations" из shared/schema.ts.
 */
@Entity
@Table(name = "equipment_reservations")
@Getter
@Setter
public class EquipmentReservation {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "equipment_id")
    private String equipmentId;

    @Column(name = "user_id")
    private String userId;

    @Column(name = "event_id")
    private String eventId;

    @Column(name = "start_time", nullable = false)
    private Instant startTime;

    @Column(name = "end_time", nullable = false)
    private Instant endTime;

    @Column(name = "status", nullable = false)
    private String status = "active";

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();
}
