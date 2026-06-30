package com.streamdesk.estimate.dto;

/**
 * Позиция дефицита — её нет на складе либо неизвестна цена (priceStatus=no_price).
 * Порт элемента missing[] из EstimateResult.
 */
public record EstimateMissingLine(
        String name,
        String type,
        int quantity,
        String reason
) {
}
