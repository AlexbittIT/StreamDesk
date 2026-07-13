package com.streamdesk.notification.dto;

/**
 * Тело создания уведомления (POST /api/notifications).
 */
public record NotificationRequest(
        String userId,
        String title,
        String message,
        String type,
        String link
) {
}
