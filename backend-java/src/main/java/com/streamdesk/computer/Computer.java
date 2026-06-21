package com.streamdesk.computer;

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
 * Сущность компьютера — перенос таблицы "computers" из shared/schema.ts.
 */
@Entity
@Table(name = "computers")
@Getter
@Setter
public class Computer {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "location", nullable = false)
    private String location;

    @Column(name = "purpose")
    private String purpose;

    @Column(name = "status", nullable = false)
    private String status = "active";

    @Column(name = "ip_address")
    private String ipAddress;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "components", columnDefinition = "jsonb")
    private Map<String, Object> components = new HashMap<>();

    @Column(name = "notes")
    private String notes;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();
}
