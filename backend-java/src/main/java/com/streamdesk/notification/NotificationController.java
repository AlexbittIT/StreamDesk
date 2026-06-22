package com.streamdesk.notification;

import com.streamdesk.notification.dto.NotificationRequest;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * REST-контроллер уведомлений — перенос /api/notifications из backend/routes.ts. Пути сохранены.
 */
@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    // GET /api/notifications/{userId}
    @GetMapping("/{userId}")
    public List<Notification> byUser(@PathVariable String userId) {
        return notificationService.getByUser(userId);
    }

    // POST /api/notifications
    @PostMapping
    public Notification create(@RequestBody NotificationRequest req) {
        return notificationService.create(req);
    }

    // PATCH /api/notifications/{id}/read
    @PatchMapping("/{id}/read")
    public Map<String, Boolean> markReadPatch(@PathVariable String id) {
        notificationService.markRead(id);
        return Map.of("success", true);
    }

    // PUT /api/notifications/{id}/read (тот же эффект, что и PATCH — есть в Express)
    @PutMapping("/{id}/read")
    public Map<String, Boolean> markReadPut(@PathVariable String id) {
        notificationService.markRead(id);
        return Map.of("success", true);
    }

    // PUT /api/notifications/mark-all-read
    @PutMapping("/mark-all-read")
    public Map<String, Object> markAllRead(@RequestBody(required = false) Map<String, Object> body) {
        String userId = body != null && body.get("userId") != null ? String.valueOf(body.get("userId")) : null;
        int count = notificationService.markAllRead(userId);
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("count", count);
        return response;
    }

    // DELETE /api/notifications/{id}
    @DeleteMapping("/{id}")
    public Map<String, Boolean> delete(@PathVariable String id) {
        notificationService.delete(id);
        return Map.of("success", true);
    }
}
