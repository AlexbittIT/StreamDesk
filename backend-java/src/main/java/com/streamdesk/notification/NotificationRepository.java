package com.streamdesk.notification;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/**
 * Репозиторий уведомлений — замена getNotificationsByUser/markAllNotificationsRead и т.п.
 */
public interface NotificationRepository extends JpaRepository<Notification, String> {

    // аналог getNotificationsByUser(userId) — по времени создания (DESC)
    List<Notification> findByUserIdOrderByCreatedAtDesc(String userId);

    // аналог markAllNotificationsRead(userId) — возвращает число затронутых строк (как rowCount)
    @Modifying
    @Query("update Notification n set n.read = true where n.userId = :userId")
    int markAllRead(@Param("userId") String userId);
}
