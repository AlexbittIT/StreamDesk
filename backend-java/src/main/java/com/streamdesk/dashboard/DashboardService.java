package com.streamdesk.dashboard;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.company.CompanyService;
import com.streamdesk.equipment.EquipmentRepository;
import com.streamdesk.event.EventRepository;
import com.streamdesk.stream.StreamRepository;
import com.streamdesk.system.SystemRepository;
import com.streamdesk.task.Task;
import com.streamdesk.task.TaskHistory;
import com.streamdesk.task.TaskHistoryRepository;
import com.streamdesk.task.TaskRepository;
import com.streamdesk.user.User;
import com.streamdesk.user.UserService;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Агрегаты для дашбордов — перенос /api/dashboard/stats и /api/manager/stats из backend/routes.ts.
 * Только чтение; собирает данные из нескольких доменов.
 */
@Service
public class DashboardService {

    private static final Map<String, String> STATUS_LABELS = Map.of(
            "todo", "К выполнению",
            "in_progress", "В работе",
            "done", "Готово",
            "not_ready", "Бэклог",
            "review", "На проверке"
    );

    private final CompanyService companyService;
    private final SystemRepository systemRepository;
    private final EquipmentRepository equipmentRepository;
    private final StreamRepository streamRepository;
    private final EventRepository eventRepository;
    private final TaskRepository taskRepository;
    private final TaskHistoryRepository taskHistoryRepository;
    private final UserService userService;

    public DashboardService(CompanyService companyService,
                            SystemRepository systemRepository,
                            EquipmentRepository equipmentRepository,
                            StreamRepository streamRepository,
                            EventRepository eventRepository,
                            TaskRepository taskRepository,
                            TaskHistoryRepository taskHistoryRepository,
                            UserService userService) {
        this.companyService = companyService;
        this.systemRepository = systemRepository;
        this.equipmentRepository = equipmentRepository;
        this.streamRepository = streamRepository;
        this.eventRepository = eventRepository;
        this.taskRepository = taskRepository;
        this.taskHistoryRepository = taskHistoryRepository;
        this.userService = userService;
    }

    /** GET /api/dashboard/stats — сводка по системам/оборудованию/стримам/событиям дня. */
    public Map<String, Object> dashboardStats(AuthenticatedUser user) {
        if (!companyService.hasWorkspaceAccess(user)) {
            return ordered(
                    "onlineSystems", "0/0",
                    "activeStreams", 0,
                    "availableEquipment", "0/0",
                    "todayEvents", 0);
        }

        var systems = systemRepository.findAllByOrderByName();
        var equipment = equipmentRepository.findAllByOrderByName();
        var streams = streamRepository.findByStatusOrderByStartTime("live");

        ZoneId zone = ZoneId.systemDefault();
        LocalDate today = LocalDate.now(zone);
        Instant dayStart = today.atStartOfDay(zone).toInstant();
        Instant dayEnd = today.atTime(LocalTime.MAX).atZone(zone).toInstant();
        var events = eventRepository.findByStartTimeBetweenOrderByStartTime(dayStart, dayEnd);

        long onlineSystems = systems.stream().filter(s -> "online".equals(s.getStatus())).count();
        long availableEquipment = equipment.stream().filter(e -> "available".equals(e.getStatus())).count();

        return ordered(
                "onlineSystems", onlineSystems + "/" + systems.size(),
                "activeStreams", streams.size(),
                "availableEquipment", availableEquipment + "/" + equipment.size(),
                "todayEvents", events.size());
    }

    /** GET /api/manager/stats — метрики по задачам, исполнителям и активности. */
    public Map<String, Object> managerStats() {
        List<Task> tasks = taskRepository.findByOrderByCreatedAtDesc();
        List<User> users = userService.getActiveUsers();
        Map<String, User> userById = new LinkedHashMap<>();
        for (User u : users) {
            userById.put(u.getId(), u);
        }
        Instant now = Instant.now();

        long totalTasks = tasks.size();
        long completedTasks = tasks.stream().filter(t -> "done".equals(t.getStatus())).count();
        long inProgressTasks = tasks.stream().filter(t -> "in_progress".equals(t.getStatus())).count();
        long overdueTasks = tasks.stream()
                .filter(t -> t.getDueDate() != null && t.getDueDate().isBefore(now) && !"done".equals(t.getStatus()))
                .count();

        // Среднее время выполнения (в часах) по завершённым задачам.
        List<Task> completed = tasks.stream().filter(t -> "done".equals(t.getStatus())).toList();
        double totalHours = 0;
        int counted = 0;
        for (Task task : completed) {
            long created = task.getCreatedAt() != null ? task.getCreatedAt().toEpochMilli() : 0;
            long done = task.getUpdatedAt() != null ? task.getUpdatedAt().toEpochMilli() : now.toEpochMilli();
            if (created > 0) {
                totalHours += (done - created) / 3_600_000.0;
                counted++;
            }
        }
        double averageCompletionTime = counted > 0 ? totalHours / counted : 0;

        // По статусам.
        Map<String, Long> statusCounts = new LinkedHashMap<>();
        for (Task t : tasks) {
            statusCounts.merge(t.getStatus() != null ? t.getStatus() : "todo", 1L, Long::sum);
        }
        List<Map<String, Object>> tasksByStatus = new ArrayList<>();
        statusCounts.forEach((status, count) -> tasksByStatus.add(ordered(
                "status", status,
                "label", STATUS_LABELS.getOrDefault(status, status.length() > 12 ? "Колонка" : status),
                "count", count)));

        // По приоритетам.
        Map<String, Long> priorityCounts = new LinkedHashMap<>();
        for (Task t : tasks) {
            priorityCounts.merge(t.getPriority() != null ? t.getPriority() : "none", 1L, Long::sum);
        }
        List<Map<String, Object>> tasksByPriority = new ArrayList<>();
        priorityCounts.forEach((priority, count) -> tasksByPriority.add(ordered("priority", priority, "count", count)));

        // По исполнителям.
        Map<String, long[]> assigneeCounts = new LinkedHashMap<>();
        for (Task t : tasks) {
            if (t.getAssigneeId() != null) {
                assigneeCounts.computeIfAbsent(t.getAssigneeId(), k -> new long[1])[0]++;
            }
        }
        List<Map<String, Object>> tasksByAssignee = new ArrayList<>();
        assigneeCounts.forEach((assigneeId, count) -> tasksByAssignee.add(ordered(
                "assigneeId", assigneeId,
                "assigneeName", userName(userById, assigneeId),
                "count", count[0])));
        tasksByAssignee.sort(Comparator.comparingLong((Map<String, Object> m) -> (Long) m.get("count")).reversed());

        // Недавняя активность (вся история, по времени, топ-10).
        Map<String, Task> taskById = new LinkedHashMap<>();
        for (Task t : tasks) {
            taskById.put(t.getId(), t);
        }
        List<Map<String, Object>> recentActivity = taskHistoryRepository.findAll().stream()
                .sorted(Comparator.comparingLong((TaskHistory h) ->
                        h.getCreatedAt() != null ? h.getCreatedAt().toEpochMilli() : 0).reversed())
                .limit(10)
                .map(h -> ordered(
                        "id", h.getId(),
                        "action", h.getAction() != null ? h.getAction() : "updated",
                        "userName", userName(userById, h.getUserId()),
                        "taskTitle", taskById.containsKey(h.getTaskId()) ? taskById.get(h.getTaskId()).getTitle() : "Задача удалена",
                        "timestamp", h.getCreatedAt() != null ? h.getCreatedAt().toString() : now.toString()))
                .toList();

        // Лучшие исполнители (по завершённым задачам, топ-5).
        Map<String, long[]> performerCounts = new LinkedHashMap<>();
        for (Task t : completed) {
            if (t.getAssigneeId() != null) {
                performerCounts.computeIfAbsent(t.getAssigneeId(), k -> new long[1])[0]++;
            }
        }
        List<Map<String, Object>> topPerformers = new ArrayList<>();
        performerCounts.forEach((userId, count) -> {
            User u = userById.get(userId);
            topPerformers.add(ordered(
                    "userId", userId,
                    "userName", userName(userById, userId),
                    "completedTasks", count[0],
                    "avatar", u != null ? u.getAvatar() : null));
        });
        topPerformers.sort(Comparator.comparingLong((Map<String, Object> m) -> (Long) m.get("completedTasks")).reversed());
        List<Map<String, Object>> topPerformers5 = topPerformers.stream().limit(5).toList();

        // Требуют внимания (топ-10 по сроку).
        List<Map<String, Object>> needsAttention = tasks.stream()
                .filter(t -> {
                    if ("done".equals(t.getStatus())) {
                        return false;
                    }
                    if (t.getDueDate() == null) {
                        return "high".equals(t.getPriority());
                    }
                    double daysUntilDue = (t.getDueDate().toEpochMilli() - now.toEpochMilli()) / (1000.0 * 60 * 60 * 24);
                    return daysUntilDue < 2 || t.getDueDate().isBefore(now);
                })
                .sorted(Comparator.comparingLong(t ->
                        t.getDueDate() != null ? t.getDueDate().toEpochMilli() : Long.MAX_VALUE))
                .limit(10)
                .map(t -> ordered(
                        "id", t.getId(),
                        "title", t.getTitle(),
                        "assigneeName", t.getAssigneeId() != null ? userName(userById, t.getAssigneeId()) : "Не назначено",
                        "dueDate", t.getDueDate() != null ? t.getDueDate().toString() : now.toString(),
                        "priority", t.getPriority() != null ? t.getPriority() : "medium"))
                .toList();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totalTasks", totalTasks);
        result.put("completedTasks", completedTasks);
        result.put("inProgressTasks", inProgressTasks);
        result.put("overdueTasks", overdueTasks);
        result.put("averageCompletionTime", averageCompletionTime);
        result.put("tasksByStatus", tasksByStatus);
        result.put("tasksByPriority", tasksByPriority);
        result.put("tasksByAssignee", tasksByAssignee);
        result.put("recentActivity", recentActivity);
        result.put("topPerformers", topPerformers5);
        result.put("needsAttention", needsAttention);
        return result;
    }

    // --- helpers ---

    private String userName(Map<String, User> userById, String userId) {
        User u = userId != null ? userById.get(userId) : null;
        return u != null && u.getName() != null ? u.getName() : "Неизвестно";
    }

    private Map<String, Object> ordered(Object... kv) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) {
            map.put(String.valueOf(kv[i]), kv[i + 1]);
        }
        return map;
    }
}
