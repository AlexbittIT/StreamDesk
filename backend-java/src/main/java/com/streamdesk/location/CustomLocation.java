package com.streamdesk.location;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * Сущность пользовательской локации — перенос таблицы "custom_locations" из shared/schema.ts.
 */
@Entity
@Table(name = "custom_locations")
@Getter
@Setter
public class CustomLocation {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "name", nullable = false, unique = true)
    private String name;

    @Column(name = "description")
    private String description;

    @Column(name = "type")
    private String type = "storage";

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();
}
