package com.streamdesk.yougile;

import com.streamdesk.config.ApiException;
import com.streamdesk.project.Project;
import com.streamdesk.project.ProjectRepository;
import com.streamdesk.task.Task;
import com.streamdesk.task.TaskRepository;
import com.streamdesk.user.User;
import com.streamdesk.user.UserService;
import com.streamdesk.yougile.api.YougileClient;
import com.streamdesk.yougile.api.YougileModels.YgBoard;
import com.streamdesk.yougile.api.YougileModels.YgColumn;
import com.streamdesk.yougile.api.YougileModels.YgProject;
import com.streamdesk.yougile.sync.YougileSyncService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Логика yougile-эндпоинтов — перенос /api/yougile/* и /api/projects/:id/link-yougile-board
 * из backend/routes.ts. Чтение — из кэш-таблиц БД; запись/синк — через YougileClient/YougileSyncService.
 */
@Service
public class YougileEndpointService {

    private final YougileClient client;
    private final YougileSyncService syncService;
    private final ProjectRepository projectRepository;
    private final TaskRepository taskRepository;
    private final YougileProjectRepository ygProjectRepo;
    private final YougileBoardRepository ygBoardRepo;
    private final YougileColumnRepository ygColumnRepo;
    private final YougileStringStickerStateRepository ygStickerRepo;
    private final UserService userService;

    public YougileEndpointService(YougileClient client, YougileSyncService syncService,
                                  ProjectRepository projectRepository, TaskRepository taskRepository,
                                  YougileProjectRepository ygProjectRepo, YougileBoardRepository ygBoardRepo,
                                  YougileColumnRepository ygColumnRepo, YougileStringStickerStateRepository ygStickerRepo,
                                  UserService userService) {
        this.client = client;
        this.syncService = syncService;
        this.projectRepository = projectRepository;
        this.taskRepository = taskRepository;
        this.ygProjectRepo = ygProjectRepo;
        this.ygBoardRepo = ygBoardRepo;
        this.ygColumnRepo = ygColumnRepo;
        this.ygStickerRepo = ygStickerRepo;
        this.userService = userService;
    }

    // POST /api/yougile/auth/key
    public Map<String, Object> authKey(String login, String password) {
        String companyId = env("YOUGILE_COMPANY_ID");
        if (companyId.isEmpty()) {
            throw ApiException.badRequest("Задайте YOUGILE_COMPANY_ID в .env");
        }
        if (isBlank(login) || isBlank(password)) {
            throw ApiException.badRequest("Укажите login и password в теле запроса");
        }
        String key = client.getAuthKey(login, password, companyId);
        if (isBlank(key)) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "YouGile не вернул ключ");
        }
        client.setApiKey(key);
        return Map.of("success", true, "message", "Ключ сохранён. YouGile готов к работе.");
    }

    // GET /api/yougile/config
    public Map<String, Object> config() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("enabled", client.isConfigured());
        out.put("companyId", nullIfBlank(env("YOUGILE_COMPANY_ID")));
        out.put("defaultColumnId", nullIfBlank(env("YOUGILE_DEFAULT_COLUMN_ID")));
        return out;
    }

    // GET /api/yougile/status
    public Map<String, Object> status() {
        return Map.of("configured", client.isConfigured());
    }

    // GET /api/yougile/projects?sync=
    public List<Map<String, Object>> projects(boolean sync) {
        if (!client.isConfigured()) {
            return new ArrayList<>();
        }
        if (sync) {
            syncService.refreshProjectsCache();
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (YougileProject p : ygProjectRepo.findAll()) {
            out.add(mapOf("id", p.getId(), "title", p.getTitle()));
        }
        return out;
    }

    // GET /api/yougile/boards?projectId=
    public List<Map<String, Object>> boards(String projectId) {
        if (!client.isConfigured()) {
            throw ApiException.badRequest("YouGile не настроен");
        }
        List<YougileBoard> list = projectId != null && !projectId.isBlank()
                ? ygBoardRepo.findByProjectId(projectId) : ygBoardRepo.findAll();
        List<Map<String, Object>> out = new ArrayList<>();
        for (YougileBoard b : list) {
            out.add(mapOf("id", b.getId(), "title", b.getTitle(), "projectId", b.getProjectId()));
        }
        return out;
    }

    // GET /api/yougile/boards-all
    public List<Map<String, Object>> boardsAll() {
        if (!client.isConfigured()) {
            return new ArrayList<>();
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (YougileBoard b : ygBoardRepo.findAll()) {
            out.add(mapOf("id", b.getId(),
                    "title", b.getTitle() != null && !b.getTitle().isBlank() ? b.getTitle() : "Без названия",
                    "projectId", b.getProjectId()));
        }
        return out;
    }

    // POST /api/yougile/sync-projects
    public Map<String, Object> syncProjects() {
        if (!client.isConfigured()) {
            return mapOf("synced", 0, "message", "YouGile не настроен");
        }
        Set<String> linkedBoardIds = new LinkedHashSet<>();
        for (Project p : projectRepository.findAll()) {
            if (p.getYougileBoardId() != null) {
                linkedBoardIds.add(p.getYougileBoardId());
            }
        }
        int created = 0;
        for (YgProject p : client.getProjects()) {
            for (YgBoard b : client.getBoards(p.id())) {
                if (linkedBoardIds.contains(b.id())) {
                    continue;
                }
                String name = first(b.title(), p.title(), "Проект YouGile");
                Project project = new Project();
                project.setName(name.trim().isEmpty() ? "Проект YouGile" : name.trim());
                project.setStatus("planning");
                project.setYougileBoardId(b.id());
                projectRepository.save(project);
                linkedBoardIds.add(b.id());
                created++;
            }
        }
        return mapOf("synced", created);
    }

    // GET /api/yougile/columns?boardId=&sync=
    public List<Map<String, Object>> columns(String boardId, boolean sync) {
        if (!client.isConfigured()) {
            throw ApiException.badRequest("YouGile не настроен");
        }
        if (isBlank(boardId)) {
            throw ApiException.badRequest("boardId обязателен");
        }
        if (sync) {
            syncService.refreshColumnsCache(boardId);
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (YougileColumn c : ygColumnRepo.findByBoardIdOrderByOrder(boardId)) {
            out.add(mapOf("id", c.getId(), "title", c.getTitle(), "boardId", c.getBoardId(),
                    "order", c.getOrder() != null ? c.getOrder() : 0, "color", c.getColor()));
        }
        return out;
    }

    // GET /api/yougile/stickers?boardId=
    public List<Map<String, Object>> stickers(String boardId) {
        if (!client.isConfigured()) {
            throw ApiException.badRequest("YouGile не настроен");
        }
        if (isBlank(boardId)) {
            throw ApiException.badRequest("boardId обязателен");
        }
        // Подтянуть из API в кэш и вернуть из кэша (как живой ответ в Express, но с сохранением).
        syncService.syncStringStickerStatesForBoard(boardId);
        List<Map<String, Object>> out = new ArrayList<>();
        for (YougileStringStickerState s : ygStickerRepo.findByBoardId(boardId)) {
            out.add(mapOf("id", s.getId(), "title", s.getTitle(), "boardId", s.getBoardId(),
                    "order", s.getOrder() != null ? s.getOrder() : 0, "type", s.getType(),
                    "options", s.getOptions()));
        }
        return out;
    }

    // POST /api/yougile/columns
    public YgColumn createColumn(String boardId, String title, Integer color) {
        if (!client.isConfigured()) {
            throw ApiException.badRequest("YouGile не настроен");
        }
        if (isBlank(boardId) || isBlank(title)) {
            throw ApiException.badRequest("Укажите boardId и title");
        }
        return client.createColumn(boardId, title.trim(), color);
    }

    // GET /api/yougile/column-map
    public Map<String, String> getColumnMap() {
        return client.getColumnMap();
    }

    // POST /api/yougile/column-map
    public Map<String, String> setColumnMap(Map<String, Object> body) {
        Map<String, String> normalized = new LinkedHashMap<>();
        if (body != null) {
            for (Map.Entry<String, Object> e : body.entrySet()) {
                if (e.getValue() instanceof String v && !v.trim().isEmpty()) {
                    normalized.put(e.getKey().trim(), v.trim());
                }
            }
        }
        client.setColumnMap(normalized);
        return normalized;
    }

    // GET /api/yougile/tasks/{yougileTaskId}
    public Map<String, Object> taskByYougileId(String yougileTaskId) {
        if (!client.isConfigured()) {
            throw ApiException.badRequest("YouGile не настроен");
        }
        Task task = taskRepository.findByYougileTaskId(yougileTaskId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Задача YouGile не найдена"));
        return mapDbTask(task, boardToProject());
    }

    // GET /api/yougile/tasks
    public List<Map<String, Object>> tasks(String projectId, String boardId, String columnId,
                                           String title, Integer limit, Integer offset) {
        if (!client.isConfigured()) {
            throw ApiException.badRequest("YouGile не настроен");
        }
        List<Task> tasks = new ArrayList<>();
        if (boardId != null && !boardId.isBlank()) {
            tasks = taskRepository.findByYougileBoardIdOrderByCreatedAtDesc(boardId);
        } else if (projectId != null && !projectId.isBlank()) {
            Set<String> seen = new LinkedHashSet<>();
            for (YougileBoard b : ygBoardRepo.findByProjectId(projectId)) {
                for (Task t : taskRepository.findByYougileBoardIdOrderByCreatedAtDesc(b.getId())) {
                    if (seen.add(t.getId())) {
                        tasks.add(t);
                    }
                }
            }
        } else {
            for (Task t : taskRepository.findAll()) {
                if (t.getYougileBoardId() != null) {
                    tasks.add(t);
                }
            }
        }
        if (columnId != null && !columnId.isBlank()) {
            tasks.removeIf(t -> !columnId.equals(t.getStatus()));
        }
        if (title != null && !title.trim().isEmpty()) {
            String q = title.trim().toLowerCase();
            tasks.removeIf(t -> t.getTitle() == null || !t.getTitle().toLowerCase().contains(q));
        }
        int total = tasks.size();
        if (offset != null || limit != null) {
            int off = Math.max(0, offset != null ? offset : 0);
            int lim = limit != null ? limit : total;
            int to = Math.min(off + lim, total);
            tasks = off < total ? new ArrayList<>(tasks.subList(off, to)) : new ArrayList<>();
        }
        Map<String, String> boardToProject = boardToProject();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Task t : tasks) {
            out.add(mapDbTask(t, boardToProject));
        }
        return out;
    }

    // POST /api/yougile/sync
    public YougileSyncService.YougileSyncResult sync(String userId) {
        if (!client.isConfigured()) {
            throw ApiException.badRequest("YouGile не настроен. Добавьте YOUGILE_API_KEY в .env");
        }
        return syncService.runYougileSyncToDb(userId);
    }

    // POST /api/projects/{id}/link-yougile-board
    public Map<String, Object> linkYougileBoard(String projectId) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Проект не найден"));
        if (project.getYougileBoardId() != null) {
            return mapOf("yougileBoardId", project.getYougileBoardId(), "message", "Доска уже привязана");
        }
        if (!client.isConfigured()) {
            throw ApiException.badRequest("YouGile не настроен. Настройте в Настройках.");
        }
        List<YgProject> ygProjects = client.getProjects();
        String ygProjectId;
        if (ygProjects.isEmpty()) {
            ygProjectId = client.createProject("StreamDesk").id();
        } else {
            ygProjectId = ygProjects.get(0).id();
        }
        YgBoard board = client.createBoard(ygProjectId, first(project.getName(), "Проект"));
        project.setYougileBoardId(board.id());
        projectRepository.save(project);
        return mapOf("yougileBoardId", board.id(), "message", "Доска создана в таск-менеджере");
    }

    // ——— helpers ———

    private Map<String, String> boardToProject() {
        Map<String, String> map = new LinkedHashMap<>();
        for (YougileBoard b : ygBoardRepo.findAll()) {
            map.put(b.getId(), b.getProjectId());
        }
        return map;
    }

    private Map<String, Object> mapDbTask(Task t, Map<String, String> boardToProject) {
        String boardId = t.getYougileBoardId();
        String projectId = boardId != null ? boardToProject.get(boardId) : null;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", t.getYougileTaskId() != null ? t.getYougileTaskId() : t.getId());
        out.put("title", t.getTitle());
        out.put("description", t.getDescription());
        out.put("columnId", t.getStatus());
        out.put("boardId", boardId);
        out.put("projectId", projectId);
        out.put("deadline", t.getDueDate() != null ? t.getDueDate().toEpochMilli() : null);
        out.put("status", t.getStatus());
        out.put("tags", t.getTags() != null ? t.getTags() : new ArrayList<>());
        out.put("subtasks", t.getSubtasks() != null ? t.getSubtasks() : new ArrayList<>());
        out.put("assigned", new ArrayList<>());
        return out;
    }

    private Map<String, Object> mapOf(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    private String env(String name) {
        String v = System.getenv(name);
        return v != null ? v.trim() : "";
    }

    private String nullIfBlank(String s) {
        return s == null || s.isBlank() ? null : s;
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private String first(String... values) {
        for (String v : values) {
            if (v != null && !v.isBlank()) {
                return v;
            }
        }
        return "";
    }
}
