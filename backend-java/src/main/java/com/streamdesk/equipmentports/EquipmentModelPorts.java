package com.streamdesk.equipmentports;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Кэш портов по модели оборудования (Task 2). Ключ — «производитель + модель».
 * Один раз найдено ИИ и подтверждено человеком ({@code status=confirmed}) —
 * переиспользуется навсегда, повторный поиск той же связки не нужен.
 *
 * Порты хранятся в {@code ports} (jsonb): {@code {portsIn:[...], portsOut:[...]}},
 * каждый порт — {@code {id, name, portType, type}}. Provenance (источник/уверенность/
 * когда получено) — на уровне модели; уверенность по каждому порту лежит в самом
 * порту ({@code confidence}). См. таблицу из create_equipment_ports_tables.sql.
 */
@Entity
@Table(name = "equipment_model_ports")
@Getter
@Setter
public class EquipmentModelPorts {

    public static final String STATUS_PENDING = "pending_review";
    public static final String STATUS_CONFIRMED = "confirmed";
    public static final String STATUS_REJECTED = "rejected";

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "manufacturer", nullable = false)
    private String manufacturer;

    @Column(name = "model", nullable = false)
    private String model;

    @Column(name = "device_type")
    private String deviceType;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "ports", columnDefinition = "jsonb")
    private Map<String, Object> ports = new HashMap<>();

    @Column(name = "configurable_ports", nullable = false)
    private boolean configurablePorts = false;

    @Column(name = "status", nullable = false)
    private String status = STATUS_PENDING;

    @Column(name = "source_model")
    private String sourceModel;

    @Column(name = "source_url")
    private String sourceUrl;

    @Column(name = "confidence")
    private BigDecimal confidence;

    @Column(name = "fetched_at")
    private Instant fetchedAt;

    @Column(name = "reviewed_by")
    private String reviewedBy;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at")
    private Instant updatedAt = Instant.now();
}
