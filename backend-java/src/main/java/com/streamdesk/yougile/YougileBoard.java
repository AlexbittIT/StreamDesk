package com.streamdesk.yougile;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/**
 * Кэш досок YouGile — перенос таблицы "yougile_boards" из shared/schema.ts.
 */
@Entity
@Table(name = "yougile_boards")
@Getter
@Setter
public class YougileBoard {

    @Id
    @Column(name = "id")
    private String id;

    @Column(name = "project_id", nullable = false)
    private String projectId;

    @Column(name = "title")
    private String title;

    @Column(name = "synced_at")
    private Instant syncedAt = Instant.now();
}
