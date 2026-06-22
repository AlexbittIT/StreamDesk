package com.streamdesk.event;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * Сущность участника события — перенос таблицы "event_participants" из shared/schema.ts.
 */
@Entity
@Table(name = "event_participants")
@Getter
@Setter
public class EventParticipant {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "event_id", nullable = false)
    private String eventId;

    @Column(name = "user_id", nullable = false)
    private String userId;

    @Column(name = "role")
    private String role = "participant";

    @Column(name = "status")
    private String status = "invited";

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();
}