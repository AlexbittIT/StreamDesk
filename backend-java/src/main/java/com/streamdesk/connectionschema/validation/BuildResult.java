package com.streamdesk.connectionschema.validation;

import java.util.List;

/**
 * Результат «сборки» схемы — проверка целостности всех связей. Соответствует
 * схеме BuildResult из docs/openapi.yaml.
 */
public record BuildResult(boolean ok, List<Violation> violations, String summary) {
}
