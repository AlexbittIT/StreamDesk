package com.streamdesk.connectionschema.validation;

import java.util.List;

/**
 * Результат проверки одной связи или всей схемы. Соответствует схеме
 * ValidationResult из docs/openapi.yaml.
 */
public record ValidationResult(boolean ok, List<Violation> violations) {

    public static ValidationResult valid() {
        return new ValidationResult(true, List.of());
    }

    public static ValidationResult of(List<Violation> violations) {
        return new ValidationResult(violations.isEmpty(), violations);
    }
}
