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
 * Сущность маркера шоу — перенос таблицы "show_markers" из shared/schema.ts.
 */
@Entity
@Table(name = "show_markers")
@Getter
@Setter
public class ShowMarker {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "event_id", nullable = false)
    private String eventId;

    // "00:12:34" или "00:12:34.500"
    @Column(name = "timecode", nullable = false)
    private String timecode;

    // emotion, interest, event, note
    @Column(name = "type", nullable = false)
    private String type;

    @Column(name = "value")
    private String value;

    @Column(name = "note")
    private String note;

    @Column(name = "editor_id")
    private String editorId;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();
}
