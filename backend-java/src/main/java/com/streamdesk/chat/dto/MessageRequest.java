package com.streamdesk.chat.dto;

import java.util.List;

/**
 * Тело создания сообщения (POST /api/chat/sessions/{id}/messages).
 */
public record MessageRequest(String userId, String role, String content, List<Object> attachments) {
}
