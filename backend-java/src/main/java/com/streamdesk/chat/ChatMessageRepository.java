package com.streamdesk.chat;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Репозиторий сообщений чата — замена getChatMessagesBySession/createChatMessage.
 */
public interface ChatMessageRepository extends JpaRepository<ChatMessage, String> {

    // аналог getChatMessagesBySession(sessionId) — по времени создания (ASC)
    List<ChatMessage> findBySessionIdOrderByCreatedAt(String sessionId);

    void deleteBySessionId(String sessionId);
}
