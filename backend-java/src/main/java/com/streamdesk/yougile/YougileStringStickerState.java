package com.streamdesk.yougile;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.List;

/**
 * Кэш стикеров доски YouGile (StringStickerState) — перенос таблицы
 * "yougile_string_sticker_states" из shared/schema.ts.
 */
@Entity
@Table(name = "yougile_string_sticker_states")
@Getter
@Setter
public class YougileStringStickerState {

    @Id
    @Column(name = "id")
    private String id;

    @Column(name = "board_id", nullable = false)
    private String boardId;

    @Column(name = "title")
    private String title;

    // "user" | "list" | "string"
    @Column(name = "type")
    private String type;

    // "order" — зарезервированное слово SQL, экранируем кавычками.
    @Column(name = "`order`")
    private Integer order = 0;

    // [{ id, title }] для выпадающего списка
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "options", columnDefinition = "jsonb")
    private List<Object> options;

    @Column(name = "synced_at")
    private Instant syncedAt = Instant.now();
}
