package com.streamdesk.estimate.dto;

import java.util.Map;

/**
 * Тело сохранения сметы (POST /api/estimates).
 * {@code estimate} — полный объект расчёта (EstimateResult) с фронта.
 */
public record EstimateRequest(
        String title,
        Map<String, Object> estimate,
        String deliveryDistanceKm,
        String visibility
) {
}
