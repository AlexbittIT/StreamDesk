package com.streamdesk.show;

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
 * Сущность профиля участника шоу — перенос таблицы "show_participant_profiles" из shared/schema.ts.
 */
@Entity
@Table(name = "show_participant_profiles")
@Getter
@Setter
public class ShowParticipantProfile {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "event_id", nullable = false)
    private String eventId;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "role")
    private String role;

    @Column(name = "photo")
    private String photo;

    @Column(name = "bio")
    private String bio;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "contacts", columnDefinition = "jsonb")
    private Map<String, Object> contacts = new HashMap<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "extra", columnDefinition = "jsonb")
    private Map<String, Object> extra = new HashMap<>();

    // "order" — зарезервированное слово SQL, экранируем.
    @Column(name = "`order`")
    private Integer order = 0;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at")
    private Instant updatedAt = Instant.now();
}
