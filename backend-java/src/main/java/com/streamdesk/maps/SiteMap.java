package com.streamdesk.maps;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * Карта (план площадки) — таблица {@code maps} из контракта «Схема площадки» (docs/maps-api.md §2).
 * Контейнер для зон; изоляция по {@code companyId}. Класс назван SiteMap, чтобы не конфликтовать
 * с {@link java.util.Map}.
 */
@Entity
@Table(name = "maps")
@Getter
@Setter
public class SiteMap {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "company_id", nullable = false)
    private String companyId;

    @Column(name = "venue_id")
    private String venueId;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "image_url")
    private String imageUrl;

    @Column(name = "image_width")
    private Integer imageWidth;

    @Column(name = "image_height")
    private Integer imageHeight;

    @Column(name = "created_by")
    private String createdBy;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at")
    private Instant updatedAt = Instant.now();
}
