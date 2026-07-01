package com.streamdesk.connectionschema.validation;

/**
 * Нарушение правила валидации соединения. Соответствует схеме Violation из
 * docs/openapi.yaml. Коды кодифицированы в {@link ConnectionValidator}.
 */
public record Violation(
        String code,
        String message,
        String fromPortId,
        String toPortId,
        String componentId
) {
    public static Violation ports(String code, String message, String fromPortId, String toPortId) {
        return new Violation(code, message, fromPortId, toPortId, null);
    }

    public static Violation component(String code, String message, String componentId) {
        return new Violation(code, message, null, null, componentId);
    }
}
