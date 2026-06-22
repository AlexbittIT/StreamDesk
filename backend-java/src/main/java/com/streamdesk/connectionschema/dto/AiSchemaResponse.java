package com.streamdesk.connectionschema.dto;

import com.streamdesk.connectionschema.validation.ValidationResult;
import com.streamdesk.connectionschema.validation.Violation;

import java.util.List;
import java.util.Map;

/**
 * Ответ AI-генерации схемы для холста.
 *
 * @param source      всегда "ai" (фолбэка на шаблон нет)
 * @param nodes       ноды (устройства с портами и позицией)
 * @param connections связи, ПРОШЕДШИЕ серверную валидацию (готовы к отрисовке)
 * @param validation  результат проверки возвращаемой схемы (ok=true)
 * @param dropped     нарушения, из-за которых часть связей AI была отброшена
 *                    (прозрачность, а не молчаливое исправление)
 */
public record AiSchemaResponse(
        String source,
        List<Map<String, Object>> nodes,
        List<Map<String, Object>> connections,
        ValidationResult validation,
        List<Violation> dropped
) {
}
