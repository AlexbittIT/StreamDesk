package com.streamdesk.vmix;

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
import java.util.UUID;

/**
 * Сущность события планировщика vMix — перенос таблицы "vmix_scheduler_events" из shared/schema.ts.
 */
@Entity
@Table(name = "vmix_scheduler_events")
@Getter
@Setter
public class VmixSchedulerEvent {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "start_time", nullable = false)
    private Instant startTime;

    @Column(name = "end_time")
    private Instant endTime;

    // scheduled, live, completed, error
    @Column(name = "status", nullable = false)
    private String status = "scheduled";

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "actions", columnDefinition = "jsonb")
    private List<Object> actions = new ArrayList<>();

    @Column(name = "input")
    private String input;

    @Column(name = "vmix_host")
    private String vmixHost;

    @Column(name = "vmix_port")
    private Integer vmixPort;

    @Column(name = "executed_at")
    private Instant executedAt;

    @Column(name = "error_message")
    private String errorMessage;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at")
    private Instant updatedAt = Instant.now();
}
