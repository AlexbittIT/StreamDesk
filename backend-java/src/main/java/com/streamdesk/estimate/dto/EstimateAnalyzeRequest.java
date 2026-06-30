package com.streamdesk.estimate.dto;

/**
 * Вход эндпоинта POST /api/estimates/analyze (multipart/form-data).
 *
 * Собирается контроллером из @RequestParam-полей формы. Поля смен (start/end,
 * число смен, коэффициенты) — порт ShiftParams из estimate-engine.ts. Текст ТЗ
 * приходит из поля text и/или извлекается из загруженного файла (file).
 *
 * @param requireAi  если true — при сбое ИИ кидаем типизированную ошибку, без
 *                   молчаливого фолбэка на эвристику (SD-157)
 * @param eventType  явный тип мероприятия (вечеринка/конференция/съёмка) —
 *                   отдельный вход в промпт ИИ, чтобы сметы реально различались
 */
public record EstimateAnalyzeRequest(
        String title,
        String text,
        boolean requireAi,
        String eventType,
        // — параметры расчёта смен —
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
        String workdayDates
) {
}
