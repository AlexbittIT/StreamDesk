package com.streamdesk.stream;

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
 * Сущность трансляции — перенос таблицы "streams" из shared/schema.ts.
 */
@Entity
@Table(name = "streams")
@Getter
@Setter
public class Stream {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "platform", nullable = false)
    private String platform;

    @Column(name = "stream_key")
    private String streamKey;

    @Column(name = "bitrate")
    private Integer bitrate;

    @Column(name = "fps")
    private Integer fps;

    @Column(name = "resolution")
    private String resolution;

    @Column(name = "status", nullable = false)
    private String status = "offline";

    @Column(name = "viewer_count")
    private Integer viewerCount = 0;

    @Column(name = "start_time")
    private Instant startTime;

    @Column(name = "end_time")
    private Instant endTime;

    @Column(name = "user_id")
    private String userId;

    @Column(name = "system_id")
    private String systemId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "metadata", columnDefinition = "jsonb")
    private Map<String, Object> metadata;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();
}
