package com.streamdesk.checkout;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * Сущность запроса на выдачу/перенос оборудования — таблица "equipment_checkout_requests".
 *
 * ВНИМАНИЕ: в Node-бэкенде эти эндпоинты НЕ были реализованы (фронт их вызывал, получая 404).
 * Здесь это доимплементация фичи по контракту фронтенда (equipment.tsx) и схеме БД.
 */
@Entity
@Table(name = "equipment_checkout_requests")
@Getter
@Setter
public class EquipmentCheckoutRequest {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "company_id")
    private String companyId;

    @Column(name = "equipment_id", nullable = false)
    private String equipmentId;

    @Column(name = "requested_by", nullable = false)
    private String requestedBy;

    // checkout | transfer
    @Column(name = "request_type", nullable = false)
    private String requestType = "checkout";

    @Column(name = "current_holder")
    private String currentHolder;

    @Column(name = "reviewed_by")
    private String reviewedBy;

    // pending | approved | rejected
    @Column(name = "status", nullable = false)
    private String status = "pending";

    @Column(name = "location")
    private String location;

    @Column(name = "note")
    private String note;

    @Column(name = "decision_note")
    private String decisionNote;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at")
    private Instant updatedAt = Instant.now();

    @Column(name = "reviewed_at")
    private Instant reviewedAt;
}
