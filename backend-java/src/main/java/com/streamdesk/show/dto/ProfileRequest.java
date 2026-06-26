package com.streamdesk.show.dto;

import java.util.Map;

/**
 * Тело создания/обновления профиля участника.
 */
public record ProfileRequest(
        String name,
        String role,
        String photo,
        String bio,
        Map<String, Object> contacts,
        Map<String, Object> extra,
        Integer order
) {
}
