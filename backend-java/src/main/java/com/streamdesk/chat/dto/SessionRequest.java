package com.streamdesk.chat.dto;

/**
 * Тело создания сессии чата (POST /api/chat/sessions).
 */
public record SessionRequest(String userId, String title, String modelId) {
}
