package com.streamdesk.task;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.streamdesk.access.DataScope;
import com.streamdesk.access.DataScopeService;
import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.company.CompanyService;
import com.streamdesk.config.ApiException;
import com.streamdesk.config.TimeParse;
import com.streamdesk.notification.NotificationService;
import com.streamdesk.project.ProjectService;
import com.streamdesk.task.dto.CommentRequest;
import com.streamdesk.task.dto.TaskRequest;
import com.streamdesk.yougile.YougileTaskIntegration;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Логика задач, комментариев и истории — перенос /api/tasks из backend/routes.ts.
 *
 * Перенесено: CRUD задач, комментарии, история действий, синхронизация с YouGile (через
 * {@link YougileTaskIntegration}).
 * Отложено (TODO): авто-событие «Дедлайн» в календаре.
 */
@Service
public class TaskService {

    private final TaskRepository taskRepository;
    private final TaskCommentRepository commentRepository;
    private final TaskHistoryRepository historyRepository;
    private final CompanyService companyService;
    private final NotificationService notificationService;
    private final ProjectService projectService;
    private final DataScopeService dataScopeService;
    private final ObjectMapper objectMapper;
    private final YougileTaskIntegration yougileTaskIntegration;

    public TaskService(TaskRepository taskRepository,
                       TaskCommentRepository commentRepository,
                       TaskHistoryRepository historyRepository,
                       CompanyService companyService,
                       NotificationService notificationService,
                       ProjectService projectService,
                       DataScopeService dataScopeService,
                       ObjectMapper objectMapper,
                       YougileTaskIntegration yougileTaskIntegration) {
        this.taskRepository = taskRepository;
        this.commentRepository = commentRepository;
        this.historyRepository = historyRepository;
        this.companyService = companyService;
        this.notificationService = notificationService;
        this.projectService = projectService;
        this.dataScopeService = dataScopeService;
        this.objectMapper = objectMapper;
        this.yougileTaskIntegration = yougileTaskIntegration;
    }

    /** GET /api/tasks — фильтры + права доступа. */
    public List<Task> listTasks(AuthenticatedUser user, String assigneeId, String creatorId,
                                String status, String yougileBoardId) {
        if (!isBlank(yougileBoardId)) {
            // Для доски YouGile показываем все её задачи без фильтра по автору.
            return taskRepository.findByYougileBoardIdOrderByCreatedAtDesc(yougileBoardId);
        }

        List<Task> tasks;
        if (!isBlank(assigneeId)) {
            tasks = taskRepository.findByAssigneeIdOrderByCreatedAtDesc(assigneeId);
        } else if (!isBlank(creatorId)) {
            tasks = taskRepository.findByCreatorIdOrderByCreatedAtDesc(creatorId);
        } else if (!isBlank(status)) {
            tasks = taskRepository.findByStatusOrderByCreatedAtDesc(status);
        } else {
            tasks = taskRepository.findByOrderByCreatedAtDesc();
        }

        // «Мои задачи»: только локальные (без привязки к доске YouGile), чтобы не дублировать.
        // Доступ к каждой задаче определяется уровнем видимости роли (свои/отдел/все) + барьером компании.
        if (user == null) {
            return List.of();
        }
        TaskAccessContext ctx = buildAccessContext(user);
        return tasks.stream()
                .filter(t -> isBlank(t.getYougileBoardId()))
                .filter(t -> canAccessTask(t, user, ctx))
                .toList();
    }

    /** Получение задачи с проверкой доступа — закрывает обход по прямой ссылке (GET /api/tasks/{id}). */
    public Task getTask(String id, AuthenticatedUser user) {
        Task task = taskRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Task not found"));
        requireAccess(task, user);
        return task;
    }

    /** Внутренний доступ без проверки прав (для интеграций/служебных вызовов). */
    public Task getTask(String id) {
        return taskRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Task not found"));
    }

    /** Бросает 403, если задача вне области видимости пользователя. */
    public void requireAccess(Task task, AuthenticatedUser user) {
        if (!canAccessTask(task, user, buildAccessContext(user))) {
            throw ApiException.forbidden("Нет доступа к этой задаче");
        }
    }

    @Transactional
    public Task createTask(TaskRequest req, AuthenticatedUser user) {
        String creatorId = !isBlank(req.creatorId()) ? req.creatorId() : (user != null ? user.id() : null);
        if (isBlank(creatorId)) {
            throw ApiException.badRequest("Для создания задачи необходимо войти в систему");
        }
        if (isBlank(req.title())) {
            throw ApiException.badRequest("Проверьте поля: название обязательно; статус и приоритет — из списка");
        }

        Task task = new Task();
        task.setTitle(req.title());
        task.setDescription(req.description());
        if (!isBlank(req.status())) {
            task.setStatus(req.status());
        }
        if (!isBlank(req.priority())) {
            task.setPriority(req.priority());
        }
        task.setCreatorId(creatorId);
        task.setAssigneeId(req.assigneeId());

        // companyId: из тела, иначе первая компания пользователя (привязку к проекту откладываем).
        String companyId = req.companyId();
        if (isBlank(companyId) && user != null) {
            List<String> ids = companyService.getUserCompanyIds(user);
            if (!ids.isEmpty()) {
                companyId = ids.get(0);
            }
        }
        task.setCompanyId(companyId);

        task.setDueDate(instantOrNull(req.dueDate()));
        task.setStartDate(instantOrNull(req.startDate()));
        task.setCompletedAt(instantOrNull(req.completedAt()));
        task.setCategory(req.category());
        task.setProjectId(req.projectId());
        task.setProjectColumnId(req.projectColumnId());
        if (req.tags() != null) {
            task.setTags(req.tags());
        }
        if (req.subtasks() != null) {
            task.setSubtasks(req.subtasks());
        }
        if (req.attachments() != null) {
            task.setAttachments(req.attachments());
        }
        task.setParentTaskId(req.parentTaskId());
        task.setEstimatedHours(req.estimatedHours());
        task.setActualHours(req.actualHours());
        task.setRepository(req.repository());
        if (req.links() != null) {
            task.setLinks(req.links());
        }
        task.setYougileTaskId(req.yougileTaskId());
        task.setYougileBoardId(req.yougileBoardId());

        Task saved = taskRepository.save(task);
        recordHistory(saved.getId(), creatorId, "created", null, toMap(saved));
        if (!isBlank(saved.getAssigneeId())) {
            notificationService.notify(saved.getAssigneeId(), "Новая задача",
                    "Вам назначена задача: " + saved.getTitle(), "info");
        }
        // Синхронизация с YouGile: создаём задачу в очереди (best-effort).
        yougileTaskIntegration.onCreate(saved);
        // TODO: авто-событие «Дедлайн» в календаре.
        return saved;
    }

    @Transactional
    public Task updateTask(String id, TaskRequest req) {
        Task task = taskRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Task not found"));
        Map<String, Object> oldValue = toMap(task);
        String oldAssigneeId = task.getAssigneeId();
        String oldYougileTaskId = task.getYougileTaskId();
        String oldYougileBoardId = task.getYougileBoardId();

        if (req.title() != null) {
            task.setTitle(req.title());
        }
        if (req.description() != null) {
            task.setDescription(req.description());
        }
        if (req.status() != null) {
            task.setStatus(req.status());
        }
        if (req.priority() != null) {
            task.setPriority(req.priority());
        }
        if (req.assigneeId() != null) {
            task.setAssigneeId(req.assigneeId());
        }
        if (req.companyId() != null) {
            task.setCompanyId(req.companyId());
        }
        if (!isBlank(req.dueDate())) {
            task.setDueDate(instantOrNull(req.dueDate()));
        }
        if (!isBlank(req.startDate())) {
            task.setStartDate(instantOrNull(req.startDate()));
        }
        if (!isBlank(req.completedAt())) {
            task.setCompletedAt(instantOrNull(req.completedAt()));
        }
        if (req.category() != null) {
            task.setCategory(req.category());
        }
        if (req.projectId() != null) {
            task.setProjectId(req.projectId());
        }
        if (req.projectColumnId() != null) {
            // Пустое значение очищает столбец; непустое — принимаем только если столбец есть в проекте.
            // projectId уже учитывает новый, если он был в запросе (как updateData.projectId || oldTask.projectId).
            if (req.projectColumnId().isBlank()) {
                task.setProjectColumnId(req.projectColumnId());
            } else {
                String projectId = task.getProjectId();
                if (!isBlank(projectId) && projectService.isColumnInProject(projectId, req.projectColumnId())) {
                    task.setProjectColumnId(req.projectColumnId());
                }
                // иначе игнорируем (как delete updateData.projectColumnId в Express)
            }
        }
        if (req.tags() != null) {
            task.setTags(req.tags());
        }
        if (req.subtasks() != null) {
            task.setSubtasks(req.subtasks());
        }
        if (req.attachments() != null) {
            task.setAttachments(req.attachments());
        }
        if (req.parentTaskId() != null) {
            task.setParentTaskId(req.parentTaskId());
        }
        if (req.estimatedHours() != null) {
            task.setEstimatedHours(req.estimatedHours());
        }
        if (req.actualHours() != null) {
            task.setActualHours(req.actualHours());
        }
        if (req.repository() != null) {
            task.setRepository(req.repository());
        }
        if (req.links() != null) {
            task.setLinks(req.links());
        }
        if (req.yougileTaskId() != null) {
            task.setYougileTaskId(req.yougileTaskId());
        }
        if (req.yougileBoardId() != null) {
            task.setYougileBoardId(req.yougileBoardId());
        }
        task.setUpdatedAt(Instant.now());

        Task saved = taskRepository.save(task);
        if (!isBlank(req.userId())) {
            recordHistory(id, req.userId(), "updated", oldValue, toMap(saved));
        }
        // Уведомление новому исполнителю при смене назначения.
        if (req.assigneeId() != null && !Objects.equals(oldAssigneeId, saved.getAssigneeId())
                && !isBlank(saved.getAssigneeId())) {
            notificationService.notify(saved.getAssigneeId(), "Задача назначена",
                    "Вам назначена задача: " + saved.getTitle(), "info");
        }
        // Синхронизация с YouGile: ставим обновление в очередь (best-effort).
        yougileTaskIntegration.onUpdate(oldYougileTaskId, oldYougileBoardId, saved, req.status() != null);
        // TODO: авто-событие «Дедлайн» в календаре.
        return saved;
    }

    @Transactional
    public void deleteTask(String id) {
        Task task = taskRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Task not found"));
        String yougileTaskId = task.getYougileTaskId();
        // Сначала зависимые записи (FK), потом саму задачу.
        commentRepository.deleteByTaskId(id);
        historyRepository.deleteByTaskId(id);
        taskRepository.deleteById(id);
        // Синхронизация удаления с YouGile (best-effort).
        yougileTaskIntegration.onDelete(yougileTaskId);
    }

    public List<TaskComment> getComments(String taskId) {
        return commentRepository.findByTaskIdOrderByCreatedAt(taskId);
    }

    @Transactional
    public TaskComment createComment(String taskId, CommentRequest req) {
        if (isBlank(req.userId()) || isBlank(req.content())) {
            throw ApiException.badRequest("Invalid comment data");
        }
        TaskComment comment = new TaskComment();
        comment.setTaskId(taskId);
        comment.setUserId(req.userId());
        comment.setContent(req.content());
        if (req.attachments() != null) {
            comment.setAttachments(req.attachments());
        }
        TaskComment saved = commentRepository.save(comment);

        Map<String, Object> newValue = new LinkedHashMap<>();
        newValue.put("commentId", saved.getId());
        newValue.put("content", truncate(saved.getContent(), 200));
        recordHistory(taskId, req.userId(), "commented", null, newValue);

        // Уведомление исполнителю задачи о новом комментарии (кроме случая, когда он сам автор).
        Task task = taskRepository.findById(taskId).orElse(null);
        if (task != null && !isBlank(task.getAssigneeId()) && !task.getAssigneeId().equals(req.userId())) {
            notificationService.notify(task.getAssigneeId(), "Новый комментарий к задаче",
                    "Добавлен комментарий к задаче: " + task.getTitle(), "info");
        }
        return saved;
    }

    @Transactional
    public void deleteComment(String commentId) {
        if (!commentRepository.existsById(commentId)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Comment not found");
        }
        commentRepository.deleteById(commentId);
    }

    public List<TaskHistory> getHistory(String taskId) {
        return historyRepository.findByTaskIdOrderByCreatedAtDesc(taskId);
    }

    // --- helpers ---

    /**
     * Предрасчёт контекста доступа один раз на запрос (компании, отдел, уровень), чтобы не
     * дёргать БД на каждую задачу при фильтрации списка.
     */
    private TaskAccessContext buildAccessContext(AuthenticatedUser user) {
        DataScope scope = dataScopeService.resolveScope(user);
        Set<String> companyIds = new HashSet<>(companyService.getUserCompanyIds(user));
        // Множество «своих по отделу» нужно только на уровне DEPARTMENT — иначе не считаем.
        Set<String> departmentPeers = scope == DataScope.DEPARTMENT
                ? dataScopeService.departmentPeerUserIds(user)
                : Set.of();
        return new TaskAccessContext(scope, companyIds, departmentPeers);
    }

    private boolean canAccessTask(Task task, AuthenticatedUser user, TaskAccessContext ctx) {
        if (task == null || user == null) {
            return false;
        }
        // Свои задачи (создатель/исполнитель) видны всегда, на любом уровне.
        boolean own = user.id().equals(task.getCreatorId()) || user.id().equals(task.getAssigneeId());
        if (own) {
            return true;
        }
        // Админ видит всё, поверх барьера компаний (в т.ч. задачи без company_id).
        if (user.isAdmin()) {
            return true;
        }
        if (ctx.scope() == DataScope.OWN) {
            return false;
        }
        // Барьер компании действует всегда (даже на уровне «все»).
        boolean inCompany = task.getCompanyId() != null && ctx.companyIds().contains(task.getCompanyId());
        if (!inCompany) {
            return false;
        }
        if (ctx.scope() == DataScope.ALL) {
            return true;
        }
        // DEPARTMENT: создатель или исполнитель должен быть в одном отделе с пользователем.
        return ctx.departmentPeers().contains(task.getCreatorId())
                || ctx.departmentPeers().contains(task.getAssigneeId());
    }

    /** Снимок параметров доступа на время одного запроса. */
    private record TaskAccessContext(DataScope scope, Set<String> companyIds, Set<String> departmentPeers) {
    }

    private void recordHistory(String taskId, String userId, String action,
                               Map<String, Object> oldValue, Map<String, Object> newValue) {
        try {
            TaskHistory history = new TaskHistory();
            history.setTaskId(taskId);
            history.setUserId(userId);
            history.setAction(action);
            history.setOldValue(oldValue);
            history.setNewValue(newValue);
            historyRepository.save(history);
        } catch (Exception ignored) {
            // история не критична — не валим основную операцию (как try/catch в Express)
        }
    }

    private Map<String, Object> toMap(Object entity) {
        return objectMapper.convertValue(entity, new TypeReference<Map<String, Object>>() {
        });
    }

    private Instant instantOrNull(String value) {
        if (isBlank(value)) {
            return null;
        }
        try {
            return TimeParse.toInstant(value);
        } catch (IllegalArgumentException e) {
            return null; // как new Date("мусор") -> NaN -> null в Express
        }
    }

    private static String truncate(String s, int max) {
        if (s == null) {
            return null;
        }
        return s.length() <= max ? s : s.substring(0, max);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
