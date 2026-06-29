package com.streamdesk.estimate.dto;

import java.util.List;

/**
 * Строка сметы — порт EstimateLine из backend/services/estimate-engine.ts.
 *
 * Каждая позиция сопоставлена со складом (если нашлась) либо посчитана по
 * внутренней базе/ИИ. Поле {@code source} (ai|local) — индикатор происхождения
 * строки: предложил её ИИ или собрала локальная эвристика/правила склада.
 * Контракт сериализации должен совпадать с типом EstimateLine на фронте.
 *
 * @param source происхождение строки: "ai" — предложено ИИ, "local" — локальный подбор
 */
public record EstimateLine(
        String lineId,
        String catalogId,
        List<String> equipmentIds,
        String name,
        String type,
        String model,
        int quantity,
        int availableQty,
        int totalQty,
        double unitPrice,
        double baseTotal,
        double shiftFactor,
        double total,
        String priceSource,
        String availability,
        String priceStatus,
        double confidence,
        String reason,
        List<String> locations,
        String source
) {
}
