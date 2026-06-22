package com.streamdesk.equipment;

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
import java.util.Map;
import java.util.UUID;

/**
 * Сущность оборудования — перенос таблицы "equipment" из shared/schema.ts.
 */
@Entity
@Table(name = "equipment")
@Getter
@Setter
public class Equipment {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "type", nullable = false)
    private String type;

    @Column(name = "model")
    private String model;

    // Производитель — часть ключа кэша «производитель+модель» для поиска портов (Task 2).
    @Column(name = "manufacturer")
    private String manufacturer;

    @Column(name = "serial_number")
    private String serialNumber;

    @Column(name = "inventory_number")
    private String inventoryNumber;

    @Column(name = "barcode", unique = true)
    private String barcode;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "specifications", columnDefinition = "jsonb")
    private Map<String, Object> specifications;

    @Column(name = "notes")
    private String notes;

    @Column(name = "status", nullable = false)
    private String status = "available";

    @Column(name = "location")
    private String location;

    // FK на users.id — пока просто строкой-id, как assignedTo в схеме.
    @Column(name = "assigned_to")
    private String assignedTo;

    @Column(name = "last_used")
    private Instant lastUsed;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "photos", columnDefinition = "jsonb")
    private List<Object> photos = new ArrayList<>();

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();
}