package com.streamdesk.estimate.dto;

import java.util.List;

/**
 * Итог сборки сметы — порт EstimateResult из estimate-engine.ts.
 * Контракт сериализации соответствует типу EstimateResult на фронте
 * (frontend/src/pages/estimates.tsx): title/source/summary/items/missing/warnings/totals.
 *
 * @param source "ai" — в сборке участвовал ИИ; "heuristic" — собрано локально
 */
public record EstimateResult(
        String title,
        String source,
        String summary,
        List<EstimateLine> items,
        List<EstimateMissingLine> missing,
        List<String> warnings,
        Totals totals,
        CatalogStats catalogStats,
        Document document,
        EstimateShiftCalculation shiftCalculation,
        Object aiSchedule
) {

    public record Totals(
            double subtotal,
            int lines,
            int quantity,
            int missingPrices,
            int availabilityIssues
    ) {
    }

    public record CatalogStats(
            int total,
            int priced,
            int equipmentTotal,
            int availableTotal
    ) {
    }

    public record Document(
            String name,
            int extractedChars
    ) {
    }
}
