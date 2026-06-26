package com.streamdesk.event.dto;

import java.util.List;

/**
 * Тело запроса создания/обновления события (/api/events).
 * Время приходит строкой (ISO от фронта, как toISOString()) — парсится в сервисе,
 * как делал new Date(body.startTime) в Express. participants — список id пользователей.
 */
public record EventRequest(
        String title,
        String description,
        String startTime,
        String endTime,
        String location,
        String customLocation,
        String organizerId,
        String status,
        String type,
        List<String> participants
) {
}