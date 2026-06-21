package com.streamdesk.chat;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Репозиторий сессий чата — замена getChatSessionsByUser/getChatSessionById и т.п.
 */
public interface ChatSessionRepository extends JpaRepository<ChatSession, String> {

    // аналог getChatSessionsByUser(userId) — по времени обновления (DESC)
    List<ChatSession> findByUserIdOrderByUpdatedAtDesc(String userId);
}
