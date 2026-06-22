package com.streamdesk.yougile;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/**
 * Кэш колонок досок YouGile — перенос таблицы "yougile_columns" из shared/schema.ts.
 */
@Entity
@Table(name = "yougile_columns")
@Getter
@Setter
public class YougileColumn {

    @Id
    @Column(name = "id")
    private String id;

    @Column(name = "board_id", nullable = false)
    private String boardId;

    @Column(name = "title")
    private String title;

    // "order" — зарезервированное слово SQL, экранируем кавычками.
    @Column(name = "`order`")
    private Integer order = 0;

    @Column(name = "color")
    private Integer color;

    @Column(name = "synced_at")
    private Instant syncedAt = Instant.now();
}
