package com.streamdesk.estimate.dto;

import java.util.List;
import java.util.Map;

/**
 * Тело серверного расчёта смен и итогов сметы (POST /api/estimates/calculate).
 * Параметры смен приходят строками (как в state фронта); items — строки сметы.
 * Сервер — источник истины: возвращает shiftCalculation, пересчитанные items и totals.
 */
public record CalculateRequest(
        String startAt,
        String endAt,
        String manualShiftCount,
        String shiftHours,
        String roundingStep,
        String dayStartHour,
        String nightStartHour,
        String weekdayDayCoefficient,
        String weekdayNightCoefficient,
        String weekendDayCoefficient,
        String weekendNightCoefficient,
        String holidayDates,
        String workdayDates,
        List<Map<String, Object>> items
) {
}
