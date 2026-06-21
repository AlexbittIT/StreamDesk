package com.streamdesk.repository.dto;

/**
 * Тело создания/обновления репозитория (/api/repositories).
 */
public record RepositoryRequest(
        String name,
        String url,
        String type,
        String description
) {
}
