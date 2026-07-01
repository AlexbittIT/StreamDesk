package com.streamdesk.estimate.dto;

import java.util.List;

/**
 * Результат расчёта смен с коэффициентами — порт EstimateShiftCalculation.
 *
 * @param source          "dates" — посчитано по интервалу start/end; "manual" — по числу смен
 * @param chargeFactor    итоговый множитель суммы (округлённый), идёт в shiftFactor строк
 * @param chargeableShifts итоговое оплачиваемое число смен (округлённое)
 */
public record EstimateShiftCalculation(
        String source,
        String startAt,
        String endAt,
        double actualHours,
        double shiftHours,
        double roundingStep,
        double chargeableShifts,
        double chargeFactor,
        List<EstimateShiftSegment> segments,
        List<String> warnings
) {
}
