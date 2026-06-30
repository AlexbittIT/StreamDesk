package com.streamdesk.estimate.dto;

import java.util.Map;

/**
 * Тело создания/обновления сметы (/api/estimates).
 * data — снимок расчёта (структура EstimateResult с фронта), любое поле опционально.
 */
public record EstimateRequest(
        String title,
        String projectId,
        String companyId,
        String status,
        Map<String, Object> data
) {
}
