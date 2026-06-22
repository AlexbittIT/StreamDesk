package com.streamdesk.yougile;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/**
 * Кэш проектов YouGile — перенос таблицы "yougile_projects" из shared/schema.ts.
 * id приходит из YouGile (не генерируется).
 */
@Entity
@Table(name = "yougile_projects")
@Getter
@Setter
public class YougileProject {

    @Id
    @Column(name = "id")
    private String id;

    @Column(name = "title")
    private String title;

    @Column(name = "synced_at")
    private Instant syncedAt = Instant.now();
}
