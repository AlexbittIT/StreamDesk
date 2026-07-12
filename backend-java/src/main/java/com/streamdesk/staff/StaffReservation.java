package com.streamdesk.staff;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * Бронирование сотрудника на период — аналог {@code EquipmentReservation}, но для людей.
 * Изоляция по {@code companyId} (в отличие от брони оборудования): нельзя забронировать
 * человека на пересекающиеся даты в пределах одной компании.
 */
@Entity
@Table(name = "staff_reservations")
@Getter
@Setter
public class StaffReservation {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    // Кого бронируем — FK на users.id (строкой, как assignedTo в других сущностях).
    @Column(name = "staff_id", nullable = false)
    private String staffId;

    // Барьер компании: брони одной компании не пересекаются с бронями другой.
    @Column(name = "company_id", nullable = false)
    private String companyId;

    // Необязательная привязка к событию/проекту (как eventId у брони оборудования).
    @Column(name = "event_id")
    private String eventId;

    @Column(name = "start_time", nullable = false)
    private Instant startTime;

    @Column(name = "end_time", nullable = false)
    private Instant endTime;

    @Column(name = "status", nullable = false)
    private String status = "active";

    @Column(name = "created_by")
    private String createdBy;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();
}
