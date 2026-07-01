package com.streamdesk.estimate.dto;

/**
 * Сегмент смен одного тарифа (будни/выходные, день/ночь) — порт EstimateShiftSegment.
 *
 * @param kind         weekday_day | weekday_night | weekend_day | weekend_night
 * @param amountFactor вклад сегмента в оплачиваемый коэффициент (shifts * coefficient)
 */
public record EstimateShiftSegment(
        String kind,
        String label,
        double hours,
        double shifts,
        double coefficient,
        double amountFactor
) {
}
