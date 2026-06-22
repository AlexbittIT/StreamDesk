package com.streamdesk.connectionschema.dto;

/**
 * Тело POST /api/connection-schemas/{id}/ai-generate.
 */
public record AiGenerateRequest(String prompt) {
}
