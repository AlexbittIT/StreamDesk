package com.streamdesk.chat.dto;

import java.util.List;

/**
 * Тело POST /api/chat/completions — прокси к локальной модели (OpenAI-совместимый API).
 * messages — массив сообщений [{role, content}], endpoint — URL модели.
 */
public record CompletionRequest(String model, List<Object> messages, String endpoint) {
}
