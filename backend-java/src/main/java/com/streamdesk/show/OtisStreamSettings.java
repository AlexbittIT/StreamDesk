package com.streamdesk.show;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * Сущность настроек эфира ОТИС — перенос таблицы "otis_stream_settings" из shared/schema.ts.
 * Синглтон: в таблице держим одну строку.
 */
@Entity
@Table(name = "otis_stream_settings")
@Getter
@Setter
public class OtisStreamSettings {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "name", nullable = false)
    private String name = "Эфир ОТИС";

    @Column(name = "stream_url")
    private String streamUrl;

    @Column(name = "stream_url_backup")
    private String streamUrlBackup;

    @Column(name = "show_timecode")
    private Boolean showTimecode = true;

    @Column(name = "with_sound")
    private Boolean withSound = true;

    @Column(name = "timecode_source")
    private String timecodeSource = "local";

    @Column(name = "vmix_host")
    private String vmixHost;

    @Column(name = "vmix_port")
    private Integer vmixPort;

    @Column(name = "updated_at")
    private Instant updatedAt = Instant.now();
}
