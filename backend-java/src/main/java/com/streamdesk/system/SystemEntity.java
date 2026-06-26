package com.streamdesk.system;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * Сущность системы — перенос таблицы "systems" из shared/schema.ts.
 * Класс назван SystemEntity, чтобы не конфликтовать с java.lang.System.
 */
@Entity
@Table(name = "systems")
@Getter
@Setter
public class SystemEntity {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "type", nullable = false)
    private String type;

    @Column(name = "location", nullable = false)
    private String location;

    @Column(name = "ip_address")
    private String ipAddress;

    @Column(name = "status", nullable = false)
    private String status = "offline";

    @Column(name = "last_ping")
    private Instant lastPing;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "specifications", columnDefinition = "jsonb")
    private Map<String, Object> specifications;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();
}
