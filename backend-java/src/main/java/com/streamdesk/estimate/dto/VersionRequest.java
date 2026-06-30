package com.streamdesk.estimate.dto;

import java.util.Map;

/**
 * Тело создания версии сметы (POST /api/estimates/{id}/versions).
 * data — полный снимок расчёта; subtotal/itemsCount опциональны (если не заданы,
 * сервис попытается вычислить их из data.totals).
 */
public record VersionRequest(
        String title,
        Double subtotal,
        Integer itemsCount,
        Map<String, Object> data
) {
}
