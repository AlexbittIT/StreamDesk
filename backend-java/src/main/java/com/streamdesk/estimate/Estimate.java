package com.streamdesk.estimate;

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
 * Сущность сохранённой сметы — таблица "estimates".
 * Заменяет хранение истории смет в localStorage браузера: теперь смета лежит в БД
 * и видна всем сотрудникам рабочего пространства (компании).
 * Весь расчёт ({@code EstimateResult} с фронта) кладём целиком в jsonb-поле data.
 */
@Entity
@Table(name = "estimates")
@Getter
@Setter
public class Estimate {

    @Id
    @Column(name = "id")
    private String id = UUID.randomUUID().toString();

    @Column(name = "title", nullable = false)
    private String title;

    // Компания-владелец (для будущей фильтрации по компании/отделу). Берётся из членства автора.
    @Column(name = "company_id")
    private String companyId;

    // Кто сохранил смету (userId) и его имя — для отображения автора.
    @Column(name = "created_by")
    private String createdBy;

    @Column(name = "created_by_name")
    private String createdByName;

    // own | department | company — уровень видимости (как в role-isolation). По умолчанию вся компания.
    @Column(name = "visibility", nullable = false)
    private String visibility = "company";

    // Дальность доставки, сохранённая вместе со сметой (строкой, как на фронте).
    @Column(name = "delivery_distance_km")
    private String deliveryDistanceKm = "0";

    // Полный результат сметы (позиции, итоги, смены, доставка) — как приходит с фронта.
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "data", columnDefinition = "jsonb")
    private Map<String, Object> data = new HashMap<>();

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at")
    private Instant updatedAt = Instant.now();
}
