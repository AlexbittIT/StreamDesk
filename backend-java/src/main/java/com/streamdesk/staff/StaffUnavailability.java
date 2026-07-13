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
 * Интервал недоступности сотрудника (отпуск / выходной / болезнь / ручной блок),
 * не связанный с конкретной бронью. Сотрудник считается занятым, если период пересекает
 * активную бронь ({@link StaffReservation}) ИЛИ интервал недоступности.
 * Изоляция по {@code companyId}.
 */
@Entity
@Table(name = "staff_unavailability")
@Getter
@Setter
public class StaffUnavailability {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "staff_id", nullable = false)
    private String staffId;

    @Column(name = "company_id", nullable = false)
    private String companyId;

    @Column(name = "start_time", nullable = false)
    private Instant startTime;

    @Column(name = "end_time", nullable = false)
    private Instant endTime;

    // Тип/причина: vacation, sick, day_off, blocked… (свободный текст, как status у equipment).
    @Column(name = "reason")
    private String reason;

    @Column(name = "created_by")
    private String createdBy;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();
}
