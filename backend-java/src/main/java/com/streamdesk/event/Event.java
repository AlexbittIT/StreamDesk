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
 * Сущность события — перенос таблицы "events" из shared/schema.ts.
 */
@Entity
@Table(name = "events")
@Getter
@Setter
public class Event {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "description")
    private String description;

    @Column(name = "start_time", nullable = false)
    private Instant startTime;

    @Column(name = "end_time", nullable = false)
    private Instant endTime;

    @Column(name = "location", nullable = false)
    private String location;

    @Column(name = "custom_location")
    private String customLocation;

    @Column(name = "organizer_id", nullable = false)
    private String organizerId;

    @Column(name = "status", nullable = false)
    private String status = "scheduled";

    @Column(name = "type", nullable = false)
    private String type = "stream";

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();
}