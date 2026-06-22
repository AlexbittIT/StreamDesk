package com.streamdesk.notification;

import com.streamdesk.config.ApiException;
import com.streamdesk.notification.dto.NotificationRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Логика уведомлений — перенос /api/notifications из backend/routes.ts.
 * Метод notify(...) — best-effort помощник для других доменов (events/tasks/register),
 * не бросает исключений, чтобы сбой уведомления не ломал основную операцию (как try/catch в Express).
 */
@Service
public class NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

    private final NotificationRepository repository;

    public NotificationService(NotificationRepository repository) {
        this.repository = repository;
    }

    public List<Notification> getByUser(String userId) {
        return repository.findByUserIdOrderByCreatedAtDesc(userId);
    }

    @Transactional
    public Notification create(NotificationRequest req) {
        if (isBlank(req.title()) || isBlank(req.message())) {
            throw ApiException.badRequest("Invalid notification data");
        }
        Notification notification = new Notification();
        notification.setUserId(req.userId());
        notification.setTitle(req.title());
        notification.setMessage(req.message());
        if (!isBlank(req.type())) {
            notification.setType(req.type());
        }
        return repository.save(notification);
    }

    /** Создать уведомление из другого сервиса. Ошибки только логируем, наружу не пробрасываем. */
    @Transactional
    public void notify(String userId, String title, String message, String type) {
        try {
            if (isBlank(userId)) {
                return;
            }
            Notification notification = new Notification();
            notification.setUserId(userId);
            notification.setTitle(title);
            notification.setMessage(message);
            if (!isBlank(type)) {
                notification.setType(type);
            }
            repository.save(notification);
        } catch (Exception e) {
            log.warn("[Notifications] Не удалось создать уведомление для {}: {}", userId, e.getMessage());
        }
    }

    @Transactional
    public void markRead(String id) {
        Notification notification = repository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Notification not found"));
        notification.setRead(true);
        repository.save(notification);
    }

    @Transactional
    public int markAllRead(String userId) {
        if (isBlank(userId)) {
            throw ApiException.badRequest("userId required");
        }
        return repository.markAllRead(userId);
    }

    @Transactional
    public void delete(String id) {
        if (!repository.existsById(id)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Notification not found");
        }
        repository.deleteById(id);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
