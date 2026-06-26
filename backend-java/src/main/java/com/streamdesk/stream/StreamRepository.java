package com.streamdesk.stream;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Репозиторий трансляций — замена getStreams/getActiveStreams/getStreamsByUser из IStorage.
 */
public interface StreamRepository extends JpaRepository<Stream, String> {

    // аналог getStreams() — по времени создания
    List<Stream> findAllByOrderByCreatedAt();

    // аналог getActiveStreams() — статус live, по времени старта
    List<Stream> findByStatusOrderByStartTime(String status);

    // аналог getStreamsByUser(userId) — по времени создания
    List<Stream> findByUserIdOrderByCreatedAt(String userId);
}
