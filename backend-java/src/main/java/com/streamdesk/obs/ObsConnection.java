package com.streamdesk.obs;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * Сущность подключения OBS — перенос таблицы "obs_connections" из shared/schema.ts.
 */
@Entity
@Table(name = "obs_connections")
@Getter
@Setter
public class ObsConnection {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "host", nullable = false)
    private String host;

    @Column(name = "port", nullable = false)
    private Integer port = 4455;

    @Column(name = "password")
    private String password;

    @Column(name = "status", nullable = false)
    private String status = "disconnected";

    @Column(name = "last_ping")
    private Instant lastPing;

    @Column(name = "stream_status")
    private String streamStatus = "stopped";

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();
}
