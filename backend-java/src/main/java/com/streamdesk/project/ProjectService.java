package com.streamdesk.project;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.company.CompanyService;
import com.streamdesk.config.ApiException;
import com.streamdesk.config.TimeParse;
import com.streamdesk.estimate.EstimateService;
import com.streamdesk.project.dto.ColumnRequest;
import com.streamdesk.project.dto.ProjectRequest;
import com.streamdesk.task.Task;
import com.streamdesk.task.TaskRepository;
import com.streamdesk.user.User;
import com.streamdesk.user.UserService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Логика проектов и столбцов — перенос /api/projects из backend/routes.ts.
 * Отложено (TODO): equipment-bundle (домен резерваций), link-yougile-board и yougile-колонки в task-stats.
 */
@Service
public class ProjectService {

    private static final Map<String, String> CATEGORY_LABELS = Map.of(
            "production", "Производство",
            "equipment", "Оборудование",
            "stream", "Стрим",
            "admin", "Администрирование",
            "other", "Другое"
    );

    private final ProjectRepository projectRepository;
    private final ProjectColumnRepository columnRepository;
    private final TaskRepository taskRepository;
    private final UserService userService;
    private final CompanyService companyService;
    private final EstimateService estimateService;

    public ProjectService(ProjectRepository projectRepository,
                          ProjectColumnRepository columnRepository,
                          TaskRepository taskRepository,
                          UserService userService,
                          CompanyService companyService,
                          EstimateService estimateService) {
        this.projectRepository = projectRepository;
        this.columnRepository = columnRepository;
        this.taskRepository = taskRepository;
        this.userService = userService;
        this.companyService = companyService;
        this.estimateService = estimateService;
    }

    /** GET /api/projects — фильтр по доступу (компания/владелец/исполнитель/участник). */
    public List<Project> listProjects(AuthenticatedUser user) {
        if (user == null || user.id() == null) {
            return List.of();
        }
        List<Project> projects = projectRepository.findByOrderByCreatedAtDesc();
        List<String> permissions = user.permissions() != null ? user.permissions() : List.of();
        if ("admin".equals(user.role()) && permissions.contains("platform:admin")) {
            return projects;
        }
        Set<String> companyIds = new HashSet<>(companyService.getUserCompanyIds(user));
        String uid = user.id();
        return projects.stream().filter(p -> {
            boolean inCompany = p.getCompanyId() != null && companyIds.contains(p.getCompanyId());
            boolean participant = p.getParticipants() != null
                    && p.getParticipants().stream().map(String::valueOf).anyMatch(uid::equals);
            return inCompany || uid.equals(p.getOwnerId()) || uid.equals(p.getAssignedTo()) || participant;
        }).toList();
    }

    @Transactional
    public Project createProject(ProjectRequest req, AuthenticatedUser user) {
        if (isBlank(req.name())) {
            throw ApiException.badRequest("Введите название проекта");
        }
        Project project = new Project();
        project.setName(req.name());
        project.setOwnerId(!isBlank(req.ownerId()) ? req.ownerId() : (user != null ? user.id() : null));

        String companyId = req.companyId();
        if (isBlank(companyId) && user != null) {
            List<String> ids = companyService.getUserCompanyIds(user);
            if (!ids.isEmpty()) {
                companyId = ids.get(0);
            }
        }
        project.setCompanyId(companyId);

        if (!isBlank(req.visibility())) {
            project.setVisibility(req.visibility());
        }
        project.setClient(req.client());
        project.setDescription(req.description());
        if (!isBlank(req.status())) {
            project.setStatus(req.status());
        }
        project.setCategory(req.category());
        project.setDeadline(instantOrNull(req.deadline()));
        project.setAssignedTo(req.assignedTo());
        if (req.participants() != null) {
            project.setParticipants(req.participants());
        }
        if (req.showInTaskManager() != null) {
            project.setShowInTaskManager(req.showInTaskManager());
        }
        if (req.devices() != null) {
            project.setDevices(req.devices());
        }
        project.setStorageLocation(req.storageLocation());
        project.setEstimatedSize(req.estimatedSize());
        project.setNotes(req.notes());
        if (req.columns() != null) {
            project.setColumns(req.columns());
        }
        project.setYougileBoardId(req.yougileBoardId());
        return projectRepository.save(project);
    }

    @Transactional
    public Project updateProject(String id, ProjectRequest req) {
        Project project = projectRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Project not found"));
        if (req.name() != null) {
            project.setName(req.name());
        }
        if (req.ownerId() != null) {
            project.setOwnerId(req.ownerId());
        }
        if (req.companyId() != null) {
            project.setCompanyId(req.companyId());
        }
        if (req.visibility() != null) {
            project.setVisibility(req.visibility());
        }
        if (req.client() != null) {
            project.setClient(req.client());
        }
        if (req.description() != null) {
            project.setDescription(req.description());
        }
        if (req.status() != null) {
            project.setStatus(req.status());
        }
        if (req.category() != null) {
            project.setCategory(req.category());
        }
        if (!isBlank(req.deadline())) {
            project.setDeadline(instantOrNull(req.deadline()));
        }
        if (req.assignedTo() != null) {
            project.setAssignedTo(req.assignedTo());
        }
        if (req.participants() != null) {
            project.setParticipants(req.participants());
        }
        if (req.showInTaskManager() != null) {
            project.setShowInTaskManager(req.showInTaskManager());
        }
        if (req.devices() != null) {
            project.setDevices(req.devices());
        }
        if (req.storageLocation() != null) {
            project.setStorageLocation(req.storageLocation());
        }
        if (req.estimatedSize() != null) {
            project.setEstimatedSize(req.estimatedSize());
        }
        if (req.notes() != null) {
            project.setNotes(req.notes());
        }
        if (req.columns() != null) {
            project.setColumns(req.columns());
        }
        if (req.yougileBoardId() != null) {
            project.setYougileBoardId(req.yougileBoardId());
        }
        return projectRepository.save(project);
    }

    @Transactional
    public void deleteProject(String id) {
        // Как deleteProject в Express: отвязать задачи и сметы, удалить столбцы, затем проект (без 404).
        taskRepository.clearProjectReferences(id);
        estimateService.clearProjectReferences(id);
        columnRepository.deleteByProjectId(id);
        if (projectRepository.existsById(id)) {
            projectRepository.deleteById(id);
        }
    }

    /** GET /api/projects/{id}/task-stats — агрегаты по задачам проекта. */
    public Map<String, Object> taskStats(String projectId) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Проект не найден"));

        List<Task> tasks = !isBlank(project.getYougileBoardId())
                ? taskRepository.findByYougileBoardIdOrderByCreatedAtDesc(project.getYougileBoardId())
                : taskRepository.findByProjectId(projectId);

        Map<String, String> statusNames = new LinkedHashMap<>();
        String doneColumnId = null;
        if (isBlank(project.getYougileBoardId())) {
            List<ProjectColumn> cols = columnRepository.findByProjectIdOrderByOrderAsc(projectId);
            for (ProjectColumn c : cols) {
                statusNames.put(c.getId(), c.getName() != null ? c.getName() : c.getId());
            }
            if (!cols.isEmpty()) {
                doneColumnId = cols.get(cols.size() - 1).getId(); // последний по order
            }
        }
        // TODO: для досок YouGile — имена колонок и «done»-колонка из getYougileColumns.

        final String doneId = doneColumnId;
        long done = tasks.stream().filter(t -> doneId != null
                ? doneId.equals(t.getStatus())
                : "done".equals(t.getStatus())).count();

        Map<String, Integer> byStatus = new LinkedHashMap<>();
        Map<String, Integer> byUser = new LinkedHashMap<>();
        Map<String, Integer> byRepository = new LinkedHashMap<>();
        Map<String, Integer> byCategory = new LinkedHashMap<>();
        for (Task t : tasks) {
            String s = t.getStatus() != null ? t.getStatus() : "todo";
            byStatus.merge(s, 1, Integer::sum);
            if (!isBlank(t.getAssigneeId())) {
                byUser.merge(t.getAssigneeId(), 1, Integer::sum);
            }
            if (!isBlank(t.getRepository())) {
                byRepository.merge(t.getRepository().trim(), 1, Integer::sum);
            }
            if (!isBlank(t.getCategory())) {
                byCategory.merge(t.getCategory().trim(), 1, Integer::sum);
            }
        }

        Map<String, String> userNames = new LinkedHashMap<>();
        if (!byUser.isEmpty()) {
            for (User u : userService.getAllUsers()) {
                if (byUser.containsKey(u.getId())) {
                    String name = !isBlank(u.getName()) ? u.getName() : u.getUsername();
                    userNames.put(u.getId(), name != null ? name : u.getId());
                }
            }
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("total", tasks.size());
        response.put("done", done);
        response.put("byStatus", byStatus);
        response.put("statusNames", statusNames);
        response.put("byUser", byUser);
        response.put("byRepository", byRepository);
        response.put("byCategory", byCategory);
        response.put("userNames", userNames);
        response.put("categoryLabels", CATEGORY_LABELS);
        return response;
    }

    // --- columns ---

    public List<ProjectColumn> listColumns(String projectId) {
        return columnRepository.findByProjectIdOrderByOrderAsc(projectId);
    }

    /** Принадлежит ли столбец проекту (для валидации projectColumnId при обновлении задачи). */
    public boolean isColumnInProject(String projectId, String columnId) {
        return columnRepository.findByIdAndProjectId(columnId, projectId).isPresent();
    }

    @Transactional
    public ProjectColumn createColumn(String projectId, ColumnRequest req) {
        String name = req.name() != null ? req.name().trim() : "";
        if (name.isEmpty()) {
            throw ApiException.badRequest("Введите название столбца");
        }
        if (!projectRepository.existsById(projectId)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Доска не найдена");
        }
        int nextOrder = columnRepository.findByProjectIdOrderByOrderAsc(projectId).size();

        ProjectColumn column = new ProjectColumn();
        column.setProjectId(projectId);
        column.setName(name);
        column.setColor(isBlank(req.color()) ? null : req.color());
        column.setOrder(nextOrder);
        return columnRepository.save(column);
    }

    @Transactional
    public ProjectColumn updateColumn(String id, ColumnRequest req) {
        ProjectColumn column = columnRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Column not found"));
        if (req.name() != null) {
            String name = req.name().trim();
            if (name.isEmpty()) {
                throw ApiException.badRequest("Введите название столбца");
            }
            column.setName(name);
        }
        if (req.color() != null) {
            column.setColor(isBlank(req.color()) ? null : req.color());
        }
        if (req.order() != null) {
            column.setOrder(req.order());
        }
        return columnRepository.save(column);
    }

    @Transactional
    public void deleteColumn(String columnId) {
        taskRepository.clearColumnReferences(columnId);
        if (columnRepository.existsById(columnId)) {
            columnRepository.deleteById(columnId);
        }
    }

    @Transactional
    public void reorderColumns(String projectId, List<String> columnIds) {
        if (columnIds == null) {
            throw ApiException.badRequest("columnIds must be an array");
        }
        for (int i = 0; i < columnIds.size(); i++) {
            final int order = i;
            columnRepository.findByIdAndProjectId(columnIds.get(i), projectId).ifPresent(c -> {
                c.setOrder(order);
                columnRepository.save(c);
            });
        }
    }

    // --- helpers ---

    private Instant instantOrNull(String value) {
        if (isBlank(value)) {
            return null;
        }
        try {
            return TimeParse.toInstant(value);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
