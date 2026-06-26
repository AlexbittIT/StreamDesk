package com.streamdesk.yougile.sync;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.streamdesk.event.Event;
import com.streamdesk.event.EventRepository;
import com.streamdesk.task.Task;
import com.streamdesk.task.TaskRepository;
import com.streamdesk.user.User;
import com.streamdesk.user.UserService;
import com.streamdesk.yougile.YougileBoard;
import com.streamdesk.yougile.YougileBoardRepository;
import com.streamdesk.yougile.YougileColumn;
import com.streamdesk.yougile.YougileColumnRepository;
import com.streamdesk.yougile.YougileProject;
import com.streamdesk.yougile.YougileProjectRepository;
import com.streamdesk.yougile.YougileStringStickerState;
import com.streamdesk.yougile.YougileStringStickerStateRepository;
import com.streamdesk.yougile.YougileUser;
import com.streamdesk.yougile.YougileUserRepository;
import com.streamdesk.yougile.api.YougileClient;
import com.streamdesk.yougile.api.YougileModels.YgBoard;
import com.streamdesk.yougile.api.YougileModels.YgColumn;
import com.streamdesk.yougile.api.YougileModels.YgProject;
import com.streamdesk.yougile.api.YougileModels.YgStickerOption;
import com.streamdesk.yougile.api.YougileModels.YgStickerState;
import com.streamdesk.yougile.api.YougileModels.YgTask;
import com.streamdesk.yougile.api.YougileModels.YgUser;
import com.streamdesk.yougile.api.YougileRateLimitException;
import com.streamdesk.yougile.sync.YougileExtractor.BoardSticker;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/**
 * Синхронизация YouGile → БД — порт backend/yougile-sync.ts.
 * Тянет проекты/доски/колонки/стикеры/юзеров/задачи из API, пишет в кэш-таблицы и в tasks/events.
 * При 429 синхронизация ставится в очередь и повторяется. Запросы к API только здесь.
 */
@Service
public class YougileSyncService {

    private static final Logger log = LoggerFactory.getLogger(YougileSyncService.class);
    private static final Pattern ASSIGNEE_TITLE = Pattern.compile(
            "исполнитель|assignee|performer", Pattern.CASE_INSENSITIVE);

    private final YougileClient client;
    private final YougileExtractor extractor;
    private final ObjectMapper objectMapper;
    private final TaskRepository taskRepository;
    private final EventRepository eventRepository;
    private final UserService userService;
    private final YougileProjectRepository projectRepository;
    private final YougileBoardRepository boardRepository;
    private final YougileColumnRepository columnRepository;
    private final YougileUserRepository userRepository;
    private final YougileStringStickerStateRepository stickerRepository;

    // Очередь полной синхронизации (повтор при 429) + очередь досок для повтора стикеров.
    private final java.util.Deque<String> syncQueue = new ConcurrentLinkedDeque<>();
    private final Set<String> retryStickerBoards = java.util.concurrent.ConcurrentHashMap.newKeySet();
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "yougile-sync");
        t.setDaemon(true);
        return t;
    });
    private ScheduledFuture<?> queueFuture;
    private volatile boolean retrySchedulerStarted = false;
    private volatile boolean periodicStarted = false;

    public YougileSyncService(YougileClient client, YougileExtractor extractor, ObjectMapper objectMapper,
                              TaskRepository taskRepository, EventRepository eventRepository, UserService userService,
                              YougileProjectRepository projectRepository, YougileBoardRepository boardRepository,
                              YougileColumnRepository columnRepository, YougileUserRepository userRepository,
                              YougileStringStickerStateRepository stickerRepository) {
        this.client = client;
        this.extractor = extractor;
        this.objectMapper = objectMapper;
        this.taskRepository = taskRepository;
        this.eventRepository = eventRepository;
        this.userService = userService;
        this.projectRepository = projectRepository;
        this.boardRepository = boardRepository;
        this.columnRepository = columnRepository;
        this.userRepository = userRepository;
        this.stickerRepository = stickerRepository;
    }

    /** Результат синхронизации (queued=true — поставлено в очередь из-за лимита). */
    public record YougileSyncResult(int created, int updated, int total, boolean queued) {
    }

    // ——— публичный API (используется роут-эндпоинтами и при старте) ———

    /** Полная синхронизация; при 429 ставит в очередь и возвращает queued=true. */
    public YougileSyncResult runYougileSyncToDb(String creatorId) {
        try {
            return runYougileSyncToDbInternal(creatorId);
        } catch (YougileRateLimitException e) {
            enqueueYougileSync(creatorId);
            scheduleProcessQueue(e.getRetryAfterMs());
            return new YougileSyncResult(0, 0, 0, true);
        }
    }

    /** Поставить полную синхронизацию в очередь (при 429). */
    public void enqueueYougileSync(String creatorId) {
        if (!client.isConfigured()) {
            return;
        }
        syncQueue.addLast(creatorId != null ? creatorId : "");
        if (queueFuture == null || queueFuture.isDone()) {
            scheduleProcessQueue(60_000);
        }
    }

    /** Запустить подтяжку по запросу: ставит одну синхронизацию в очередь и сразу запускает. */
    public void triggerYougileSync(String creatorId) {
        if (!client.isConfigured()) {
            return;
        }
        if (syncQueue.isEmpty()) {
            syncQueue.addLast(creatorId != null ? creatorId : "");
        }
        if (queueFuture == null || queueFuture.isDone()) {
            scheduleProcessQueue(0);
        }
    }

    /** Раз в минуту повторять синхронизацию стикеров для досок из очереди повторов. */
    public synchronized void startYougileRetryScheduler() {
        if (retrySchedulerStarted) {
            return;
        }
        retrySchedulerStarted = true;
        scheduler.scheduleWithFixedDelay(() -> {
            if (!client.isConfigured() || retryStickerBoards.isEmpty()) {
                return;
            }
            for (String boardId : new ArrayList<>(retryStickerBoards)) {
                try {
                    syncStringStickerStatesForBoard(boardId);
                    retryStickerBoards.remove(boardId);
                } catch (Exception ignored) {
                    // оставим в очереди на следующий раз
                }
            }
        }, 60, 60, TimeUnit.SECONDS);
    }

    /** Периодическая подтяжка YouGile в фоне (как setInterval в index.ts). */
    public synchronized void startPeriodicSync() {
        if (periodicStarted) {
            return;
        }
        periodicStarted = true;
        long interval = Math.max(envLong("YOUGILE_SYNC_INTERVAL_MS", 120_000), 60_000);
        scheduler.scheduleWithFixedDelay(() -> {
            if (client.isConfigured()) {
                triggerYougileSync(null);
            }
        }, interval, interval, TimeUnit.MILLISECONDS);
    }

    /** Подтянуть календарные события для уже синхронизированных задач (по кнопке). */
    public int backfillYougileCalendarEvents() {
        List<Task> allTasks = taskRepository.findAll();
        Map<String, String> projectTitleById = new LinkedHashMap<>();
        for (YougileProject p : projectRepository.findAll()) {
            projectTitleById.put(p.getId(), blankTo(p.getTitle(), "Проект"));
        }
        Map<String, BoardInfo> boardInfoById = new LinkedHashMap<>();
        for (YougileBoard b : boardRepository.findAll()) {
            boardInfoById.put(b.getId(), new BoardInfo(blankTo(b.getTitle(), "Доска"), b.getProjectId()));
        }
        int synced = 0;
        for (Task task : allTasks) {
            String ygId = trim(task.getYougileTaskId());
            if (ygId.isEmpty()) {
                continue;
            }
            BoardInfo info = boardInfoById.get(trim(task.getYougileBoardId()));
            syncTaskCalendarEvent(ygId, blankTo(task.getTitle(), "Без названия"), task.getDescription(),
                    task.getDueDate(), task.getCreatorId(),
                    info != null && info.projectId() != null ? projectTitleById.get(info.projectId()) : null,
                    info != null ? info.title() : null);
            synced++;
        }
        return synced;
    }

    /** Синхронизировать стикеры одной доски из API в кэш-таблицу. */
    public void syncStringStickerStatesForBoard(String boardId) {
        List<YgStickerState> list = client.getStringStickerStates(boardId);
        List<YougileStringStickerState> entities = new ArrayList<>();
        int i = 0;
        for (YgStickerState s : list) {
            String id = s.id() != null ? s.id() : "sticker-" + i;
            String title = blankTo(s.title() != null ? s.title() : s.id(), id);
            String type = s.type() != null ? s.type().toLowerCase() : "";
            if (type.isEmpty() && ASSIGNEE_TITLE.matcher(title).find()) {
                type = "user";
            }
            List<Object> options = optionsToList(s.options());
            if (options == null && !"user".equals(type) && id != null && !id.startsWith("sticker-")) {
                try {
                    List<YgStickerOption> values = client.getStringStickerValues(id);
                    if (!values.isEmpty()) {
                        options = new ArrayList<>();
                        int j = 0;
                        for (YgStickerOption v : values) {
                            options.add(optionMap(v.id() != null ? v.id() : "opt-" + j, v.title()));
                            j++;
                        }
                    }
                } catch (Exception ignored) {
                    // нет значений — оставим без options
                }
            }
            if (options != null && !options.isEmpty() && type.isEmpty()) {
                type = "list";
            }
            if (type.isEmpty()) {
                type = "string";
            }
            YougileStringStickerState e = new YougileStringStickerState();
            e.setId(id);
            e.setBoardId(boardId);
            e.setTitle(title);
            e.setType(type);
            e.setOrder(s.order() != null ? s.order() : i);
            e.setOptions(options != null && !options.isEmpty() ? options : null);
            entities.add(e);
            i++;
        }
        if (!entities.isEmpty()) {
            stickerRepository.saveAll(entities);
        }
    }

    /** Обновить кэш проектов/досок/колонок/юзеров из API (для GET /api/yougile/projects?sync=1). */
    public void refreshProjectsCache() {
        if (!client.isConfigured()) {
            return;
        }
        client.clearCache();
        List<YgProject> ygProjects = client.getProjects();
        upsertProjects(ygProjects);
        for (YgProject p : ygProjects) {
            List<YgBoard> boards = client.getBoards(p.id());
            upsertBoards(p.id(), boards);
            for (YgBoard b : boards) {
                upsertColumns(b.id(), client.getColumns(b.id()));
            }
        }
        upsertUsers(client.getUsers());
    }

    /** Обновить кэш колонок одной доски (для GET /api/yougile/columns?sync=1). */
    public void refreshColumnsCache(String boardId) {
        if (!client.isConfigured()) {
            return;
        }
        client.clearCache();
        upsertColumns(boardId, client.getColumns(boardId));
    }

    private void upsertProjects(List<YgProject> ygProjects) {
        List<YougileProject> entities = new ArrayList<>();
        for (YgProject p : ygProjects) {
            YougileProject e = new YougileProject();
            e.setId(p.id());
            e.setTitle(p.title());
            entities.add(e);
        }
        projectRepository.saveAll(entities);
    }

    private void upsertBoards(String fallbackProjectId, List<YgBoard> boards) {
        List<YougileBoard> entities = new ArrayList<>();
        for (YgBoard b : boards) {
            YougileBoard e = new YougileBoard();
            e.setId(b.id());
            e.setProjectId(b.projectId() != null ? b.projectId() : fallbackProjectId);
            e.setTitle(b.title());
            entities.add(e);
        }
        boardRepository.saveAll(entities);
    }

    private void upsertColumns(String boardId, List<YgColumn> cols) {
        List<YougileColumn> entities = new ArrayList<>();
        for (YgColumn c : cols) {
            YougileColumn e = new YougileColumn();
            e.setId(c.id());
            e.setBoardId(boardId);
            e.setTitle(c.title());
            e.setOrder(c.order() != null ? c.order() : 0);
            e.setColor(c.color());
            entities.add(e);
        }
        columnRepository.saveAll(entities);
    }

    private void upsertUsers(List<YgUser> ygUsers) {
        List<YougileUser> entities = new ArrayList<>();
        for (YgUser u : ygUsers) {
            YougileUser e = new YougileUser();
            e.setId(u.id());
            e.setEmail(u.email());
            e.setUsername(first(u.username(), u.realName(), u.email()));
            entities.add(e);
        }
        userRepository.saveAll(entities);
    }

    // ——— очередь полной синхронизации ———

    private synchronized void scheduleProcessQueue(long afterMs) {
        if (queueFuture != null) {
            queueFuture.cancel(false);
        }
        queueFuture = scheduler.schedule(this::processSyncQueue, Math.max(afterMs, 0), TimeUnit.MILLISECONDS);
    }

    private void processSyncQueue() {
        if (syncQueue.isEmpty()) {
            return;
        }
        String creatorId = syncQueue.peekFirst();
        try {
            YougileSyncResult result = runYougileSyncToDbInternal("".equals(creatorId) ? null : creatorId);
            syncQueue.pollFirst();
            if (result.queued()) {
                return;
            }
            log.info("YouGile (очередь): синхронизировано — {} создано, {} обновлено, {} задач",
                    result.created(), result.updated(), result.total());
            if (!syncQueue.isEmpty()) {
                scheduleProcessQueue(2000);
            }
        } catch (YougileRateLimitException e) {
            log.warn("YouGile: лимит запросов, повтор через {} с", Math.round(e.getRetryAfterMs() / 1000.0));
            scheduleProcessQueue(e.getRetryAfterMs());
        } catch (Exception e) {
            syncQueue.pollFirst();
            log.warn("[YouGile] Sync failed: {}", e.getMessage());
            if (!syncQueue.isEmpty()) {
                scheduleProcessQueue(60_000);
            }
        }
    }

    // ——— основная синхронизация ———

    private YougileSyncResult runYougileSyncToDbInternal(String creatorId) {
        if (!client.isConfigured()) {
            throw new IllegalStateException("YouGile не настроен. Добавьте YOUGILE_API_KEY в .env");
        }
        client.clearCache();

        List<YgProject> ygProjects = client.getProjects();
        Map<String, String> projectTitleById = new LinkedHashMap<>();
        List<YougileProject> projectEntities = new ArrayList<>();
        for (YgProject p : ygProjects) {
            if (p.id() != null) {
                projectTitleById.put(p.id(), blankTo(p.title(), "Проект"));
            }
            YougileProject e = new YougileProject();
            e.setId(p.id());
            e.setTitle(p.title());
            projectEntities.add(e);
        }
        projectRepository.saveAll(projectEntities);

        Map<String, BoardInfo> boardInfoById = new LinkedHashMap<>();
        Map<String, List<BoardSticker>> boardStickers = new LinkedHashMap<>();
        for (YgProject p : ygProjects) {
            List<YgBoard> boards = client.getBoards(p.id());
            List<YougileBoard> boardEntities = new ArrayList<>();
            for (YgBoard board : boards) {
                String projectId = board.projectId() != null ? board.projectId() : p.id();
                boardInfoById.put(board.id(), new BoardInfo(blankTo(board.title(), "Доска"), projectId));
                YougileBoard be = new YougileBoard();
                be.setId(board.id());
                be.setProjectId(projectId);
                be.setTitle(board.title());
                boardEntities.add(be);
            }
            boardRepository.saveAll(boardEntities);

            for (YgBoard b : boards) {
                List<YgColumn> cols = client.getColumns(b.id());
                List<YougileColumn> colEntities = new ArrayList<>();
                for (YgColumn c : cols) {
                    YougileColumn ce = new YougileColumn();
                    ce.setId(c.id());
                    ce.setBoardId(b.id());
                    ce.setTitle(c.title());
                    ce.setOrder(c.order() != null ? c.order() : 0);
                    ce.setColor(c.color());
                    colEntities.add(ce);
                }
                columnRepository.saveAll(colEntities);

                try {
                    syncStringStickerStatesForBoard(b.id());
                } catch (Exception ex) {
                    retryStickerBoards.add(b.id());
                }
                try {
                    boardStickers.put(b.id(), toBoardStickers(stickerRepository.findByBoardId(b.id())));
                } catch (Exception ex) {
                    boardStickers.put(b.id(), new ArrayList<>());
                }
            }
        }

        List<YgUser> ygUsers = client.getUsers();
        List<YougileUser> userEntities = new ArrayList<>();
        for (YgUser u : ygUsers) {
            YougileUser ue = new YougileUser();
            ue.setId(u.id());
            ue.setEmail(u.email());
            ue.setUsername(first(u.username(), u.realName(), u.email()));
            userEntities.add(ue);
        }
        userRepository.saveAll(userEntities);

        // Маппинг YouGile-юзеров на пользователей CRM.
        Map<String, String> ygIdToEmail = new LinkedHashMap<>();
        Map<String, String> ygIdToUsername = new LinkedHashMap<>();
        Map<String, String> ygIdToLabel = new LinkedHashMap<>();
        for (YgUser u : ygUsers) {
            String email = lower(first(u.email(), u.username()));
            if (!email.isEmpty() && u.id() != null) {
                ygIdToEmail.put(u.id(), email);
            }
            String username = extractor.normalizeIdentity(first(u.username(), u.realName(), u.email()));
            if (!username.isEmpty() && u.id() != null) {
                ygIdToUsername.put(u.id(), username);
            }
            String label = trim(first(u.realName(), u.username(), u.email()));
            if (!label.isEmpty() && u.id() != null) {
                ygIdToLabel.put(u.id(), label);
            }
        }
        List<User> crmUsers = userService.getAllUsers();
        Map<String, String> emailToCrm = new LinkedHashMap<>();
        Map<String, String> usernameToCrm = new LinkedHashMap<>();
        Map<String, String> nameToCrm = new LinkedHashMap<>();
        for (User u : crmUsers) {
            String email = lower(u.getEmail());
            if (!email.isEmpty()) {
                emailToCrm.put(email, u.getId());
            }
            String username = extractor.normalizeIdentity(u.getUsername());
            if (!username.isEmpty()) {
                usernameToCrm.put(username, u.getId());
            }
            String name = extractor.normalizeIdentity(u.getName());
            if (!name.isEmpty()) {
                nameToCrm.put(name, u.getId());
            }
        }

        String effectiveCreatorId = creatorId != null ? creatorId
                : crmUsers.stream().filter(u -> "admin".equals(u.getRole())).map(User::getId).findFirst().orElse(null);

        // Собираем все задачи (по доскам).
        List<YgTask> allYgTasks = new ArrayList<>();
        for (YgProject p : ygProjects) {
            for (YgBoard b : client.getBoards(p.id())) {
                allYgTasks.addAll(client.getTasks(new YougileClient.TaskQuery(null, b.id(), null, null, null, null, null)));
            }
        }
        Map<String, String> taskTitleById = new LinkedHashMap<>();
        Map<String, String> taskDescById = new LinkedHashMap<>();
        for (YgTask t : allYgTasks) {
            if (t.id() != null && t.title() != null && !t.title().isBlank()) {
                taskTitleById.put(t.id(), t.title().trim());
            }
            if (t.id() != null && t.description() != null && !t.description().isBlank()) {
                taskDescById.put(t.id(), t.description().trim());
            }
        }

        int created = 0;
        int updated = 0;
        for (YgTask yt : allYgTasks) {
            Optional<Task> existing = taskRepository.findByYougileTaskId(yt.id());
            JsonNode full = client.getTaskByIdRaw(yt.id());
            ObjectNode merged = (ObjectNode) objectMapper.valueToTree(yt);
            if (full != null && full.isObject()) {
                merged.setAll((ObjectNode) full);
            }
            String resolvedTitle = trim(text(merged, "title"));
            if (!resolvedTitle.isEmpty()) {
                taskTitleById.put(yt.id(), resolvedTitle);
            }
            String resolvedDesc = trim(text(merged, "description"));
            if (!resolvedDesc.isEmpty()) {
                taskDescById.put(yt.id(), resolvedDesc);
            }

            String boardId = firstNonEmpty(text(merged, "boardId"), yt.boardId());
            List<BoardSticker> stickers = boardStickers.getOrDefault(boardId, new ArrayList<>());
            String columnId = firstNonEmpty(text(merged, "columnId"), yt.columnId());
            String status = !columnId.isEmpty() ? columnId : "todo";

            List<Map<String, Object>> baseTags = buildBaseTags(merged);
            List<Map<String, Object>> stickerTags = extractor.extractStickerTags(merged, stickers, ygIdToLabel);
            List<Map<String, Object>> externalAssignedTags = new ArrayList<>();
            for (String assignedId : extractor.extractAssignedIds(merged)) {
                String displayValue = ygIdToLabel.getOrDefault(assignedId, ygIdToEmail.get(assignedId));
                Map<String, Object> tag = new LinkedHashMap<>();
                tag.put("id", "yougile-assigned");
                tag.put("name", "Исполнитель");
                tag.put("value", assignedId);
                tag.put("displayValue", displayValue);
                if (assignedId != null && !assignedId.isEmpty()) {
                    externalAssignedTags.add(tag);
                }
            }
            List<Map<String, Object>> tags = extractor.mergeTags(
                    extractor.mergeTags(baseTags, stickerTags), externalAssignedTags);

            Instant dueDate = extractor.extractDeadline(merged);
            if (dueDate == null) {
                dueDate = extractor.extractDeadlineFromTags(tags);
            }

            List<String> assigned = new ArrayList<>(extractor.extractAssignedIds(merged));
            assigned.addAll(extractor.extractAssigneeCandidatesFromTags(tags));
            String assigneeId = resolveAssignee(assigned, ygIdToEmail, ygIdToUsername, emailToCrm, usernameToCrm, nameToCrm);

            JsonNode rawSubtasks = firstNode(merged, "checklist", "subtasks", "checkList");
            List<Map<String, Object>> subtasks = extractor.normalizeSubtasks(rawSubtasks, taskTitleById::get);
            subtasks = resolveSubtaskTitles(subtasks, taskTitleById, taskDescById);

            Task task = existing.orElseGet(Task::new);
            task.setTitle(firstNonEmpty(text(merged, "title"), yt.title(), "Без названия"));
            task.setDescription(firstNullable(text(merged, "description"), yt.description()));
            task.setStatus(status);
            task.setPriority("medium");
            task.setAssigneeId(assigneeId);
            task.setDueDate(dueDate);
            task.setCompletedAt(parseCompleted(merged));
            task.setYougileTaskId(yt.id());
            task.setYougileBoardId(boardId.isEmpty() ? null : boardId);
            task.setTags(tags != null ? new ArrayList<>(tags) : new ArrayList<>());
            task.setSubtasks(subtasks != null ? new ArrayList<>(subtasks) : new ArrayList<>());

            boolean isNew = existing.isEmpty();
            String taskCreator = effectiveCreatorId;
            if (taskCreator == null) {
                taskCreator = crmUsers.isEmpty() ? null : crmUsers.get(0).getId();
            }
            if (isNew) {
                task.setCreatorId(taskCreator);
            } else if (task.getCreatorId() == null) {
                task.setCreatorId(taskCreator);
            }
            Task saved = taskRepository.save(task);
            if (isNew) {
                created++;
            } else {
                updated++;
            }

            BoardInfo info = boardInfoById.get(boardId);
            try {
                syncTaskCalendarEvent(yt.id(), saved.getTitle(), saved.getDescription(), dueDate,
                        first(saved.getCreatorId(), effectiveCreatorId),
                        info != null && info.projectId() != null ? projectTitleById.get(info.projectId()) : null,
                        info != null ? info.title() : null);
            } catch (Exception calErr) {
                log.warn("[YouGile] Calendar sync failed for task {}: {}", yt.id(), calErr.getMessage());
            }
        }
        return new YougileSyncResult(created, updated, allYgTasks.size(), false);
    }

    // ——— календарные события ———

    private void syncTaskCalendarEvent(String taskId, String title, String description, Instant dueDate,
                                       String creatorId, String projectTitle, String boardTitle) {
        String marker = "[yougile-task:" + taskId + "]";
        Event existing = eventRepository.findAll().stream()
                .filter(e -> (e.getDescription() != null ? e.getDescription() : "").contains(marker))
                .findFirst().orElse(null);

        if (dueDate == null) {
            if (existing != null) {
                eventRepository.deleteById(existing.getId());
            }
            return;
        }

        ZoneId zone = ZoneId.systemDefault();
        java.time.LocalDate day = dueDate.atZone(zone).toLocalDate();
        Instant startTime = day.atTime(9, 0).atZone(zone).toInstant();
        Instant endTime = day.atTime(18, 0).atZone(zone).toInstant();

        String resolvedTitle = trim(title);
        if (resolvedTitle.isEmpty()) {
            String scope = String.join(" / ", nonBlank(projectTitle, boardTitle));
            resolvedTitle = !scope.isEmpty() ? scope : "Карточка YouGile";
        }
        List<String> parts = new ArrayList<>();
        parts.add(!trim(description).isEmpty() ? description.trim() : "Карточка YouGile: " + title);
        if (projectTitle != null && !projectTitle.isBlank()) {
            parts.add("Проект: " + projectTitle);
        }
        if (boardTitle != null && !boardTitle.isBlank()) {
            parts.add("Доска: " + boardTitle);
        }
        parts.add(marker);
        String desc = String.join("\n", parts);

        String organizerId = creatorId;
        if (organizerId == null) {
            List<User> users = userService.getAllUsers();
            organizerId = users.isEmpty() ? null : users.get(0).getId();
        }
        if (organizerId == null) {
            return; // organizer_id NOT NULL — без пользователей событие не создать
        }

        if (existing != null) {
            existing.setTitle(resolvedTitle);
            existing.setDescription(desc);
            existing.setStartTime(startTime);
            existing.setEndTime(endTime);
            eventRepository.save(existing);
            return;
        }
        Event event = new Event();
        event.setTitle(resolvedTitle);
        event.setDescription(desc);
        event.setStartTime(startTime);
        event.setEndTime(endTime);
        event.setLocation("YouGile");
        event.setOrganizerId(organizerId);
        event.setType("meeting");
        event.setStatus("scheduled");
        eventRepository.save(event);
    }

    // ——— helpers ———

    private List<Map<String, Object>> buildBaseTags(JsonNode merged) {
        JsonNode ytTags = merged.has("tags") && !merged.get("tags").isNull()
                ? merged.get("tags") : merged.get("tagIds");
        List<Map<String, Object>> baseTags = new ArrayList<>();
        if (ytTags != null && ytTags.isArray()) {
            for (JsonNode t : ytTags) {
                Map<String, Object> tag = new LinkedHashMap<>();
                if (t.isObject() && (t.has("id") || t.has("name"))) {
                    tag.put("id", text(t, t.has("id") ? "id" : "name"));
                    tag.put("name", text(t, t.has("name") ? "name" : "id"));
                    tag.put("color", text(t, "color"));
                    tag.put("value", firstText(t, "value", "stateId"));
                    tag.put("displayValue", firstText(t, "displayValue", "title"));
                } else {
                    String v = t.asText();
                    tag.put("id", v);
                    tag.put("name", v);
                }
                baseTags.add(tag);
            }
        }
        return baseTags;
    }

    private String resolveAssignee(List<String> assigned, Map<String, String> ygIdToEmail,
                                   Map<String, String> ygIdToUsername, Map<String, String> emailToCrm,
                                   Map<String, String> usernameToCrm, Map<String, String> nameToCrm) {
        for (String ygId : assigned) {
            String email = ygIdToEmail.get(ygId);
            if (email != null) {
                String crmId = emailToCrm.get(email);
                if (crmId != null) {
                    return crmId;
                }
            }
            String ygUsername = ygIdToUsername.get(ygId);
            if (ygUsername != null) {
                String crmId = first(usernameToCrm.get(ygUsername), nameToCrm.get(ygUsername));
                if (!crmId.isEmpty()) {
                    return crmId;
                }
            }
            String norm = extractor.normalizeIdentity(ygId);
            String directCrmId = first(usernameToCrm.get(norm), nameToCrm.get(norm));
            if (!directCrmId.isEmpty()) {
                return directCrmId;
            }
        }
        return null;
    }

    private List<Map<String, Object>> resolveSubtaskTitles(List<Map<String, Object>> subtasks,
                                                           Map<String, String> taskTitleById,
                                                           Map<String, String> taskDescById) {
        if (subtasks == null) {
            return null;
        }
        // Дотягиваем заголовки связанных задач, если подзадача — это ссылка (id без читаемого title).
        for (Map<String, Object> item : subtasks) {
            String title = str(item.get("title"));
            if (!extractor.looksLikeOpaqueId(title) && !title.trim().isEmpty()) {
                continue;
            }
            String linkedId = trim(str(firstNonNullVal(item, "linkedTaskId", "id", "title")));
            if (linkedId.isEmpty() || taskTitleById.containsKey(linkedId)) {
                continue;
            }
            JsonNode linked = client.getTaskByIdRaw(linkedId);
            if (linked != null) {
                String lt = trim(text(linked, "title"));
                String ld = trim(text(linked, "description"));
                if (!lt.isEmpty()) {
                    taskTitleById.put(linkedId, lt);
                }
                if (!ld.isEmpty()) {
                    taskDescById.put(linkedId, ld);
                }
            }
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> item : subtasks) {
            String linkedId = trim(str(firstNonNullVal(item, "linkedTaskId", "id", "title")));
            String title = str(item.get("title"));
            String resolvedTitle = (title.trim().isEmpty() || extractor.looksLikeOpaqueId(title))
                    ? taskTitleById.get(linkedId) : null;
            String resolvedDesc = str(item.get("description")).trim().isEmpty()
                    ? taskDescById.get(linkedId) : null;
            if (resolvedTitle != null) {
                Map<String, Object> m = new LinkedHashMap<>(item);
                m.put("title", resolvedTitle);
                m.put("name", resolvedTitle);
                m.put("description", resolvedDesc != null ? resolvedDesc : item.get("description"));
                out.add(m);
            } else if (resolvedDesc != null) {
                Map<String, Object> m = new LinkedHashMap<>(item);
                m.put("description", resolvedDesc);
                out.add(m);
            } else {
                out.add(item);
            }
        }
        return out;
    }

    private Instant parseCompleted(JsonNode merged) {
        JsonNode ct = merged.get("completedTimestamp");
        if (ct != null && ct.isNumber()) {
            return Instant.ofEpochMilli(ct.asLong());
        }
        return null;
    }

    private List<BoardSticker> toBoardStickers(List<YougileStringStickerState> rows) {
        List<BoardSticker> out = new ArrayList<>();
        for (YougileStringStickerState r : rows) {
            List<Map<String, Object>> options = null;
            if (r.getOptions() != null) {
                options = new ArrayList<>();
                for (Object o : r.getOptions()) {
                    if (o instanceof Map<?, ?> map) {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> m = (Map<String, Object>) map;
                        options.add(m);
                    }
                }
            }
            out.add(new BoardSticker(r.getId(), r.getTitle(), r.getType(), options));
        }
        return out;
    }

    private List<Object> optionsToList(List<YgStickerOption> options) {
        if (options == null || options.isEmpty()) {
            return null;
        }
        List<Object> out = new ArrayList<>();
        for (YgStickerOption o : options) {
            out.add(optionMap(o.id(), o.title()));
        }
        return out;
    }

    private Map<String, Object> optionMap(String id, String title) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id);
        m.put("title", title);
        return m;
    }

    private record BoardInfo(String title, String projectId) {
    }

    private String text(JsonNode node, String key) {
        JsonNode v = node.get(key);
        return v != null && !v.isNull() ? v.asText() : null;
    }

    private String firstText(JsonNode node, String... keys) {
        for (String key : keys) {
            String v = text(node, key);
            if (v != null && !v.isEmpty()) {
                return v;
            }
        }
        return null;
    }

    private JsonNode firstNode(JsonNode node, String... keys) {
        for (String key : keys) {
            JsonNode v = node.get(key);
            if (v != null && !v.isNull()) {
                return v;
            }
        }
        return null;
    }

    private Object firstNonNullVal(Map<String, Object> map, String... keys) {
        for (String key : keys) {
            Object v = map.get(key);
            if (v != null && !v.toString().isEmpty()) {
                return v;
            }
        }
        return null;
    }

    private List<String> nonBlank(String... values) {
        List<String> out = new ArrayList<>();
        for (String v : values) {
            if (v != null && !v.isBlank()) {
                out.add(v);
            }
        }
        return out;
    }

    private String first(String... values) {
        for (String v : values) {
            if (v != null && !v.isEmpty()) {
                return v;
            }
        }
        return "";
    }

    private String firstNonEmpty(String... values) {
        for (String v : values) {
            if (v != null && !v.trim().isEmpty()) {
                return v;
            }
        }
        return "";
    }

    private String firstNullable(String... values) {
        for (String v : values) {
            if (v != null) {
                return v;
            }
        }
        return null;
    }

    private String blankTo(String value, String fallback) {
        return value != null && !value.trim().isEmpty() ? value.trim() : fallback;
    }

    private String trim(String s) {
        return s != null ? s.trim() : "";
    }

    private String lower(String s) {
        return s != null ? s.trim().toLowerCase() : "";
    }

    private String str(Object o) {
        return o == null ? "" : o.toString();
    }

    private long envLong(String name, long def) {
        String v = System.getenv(name);
        if (v != null && !v.isBlank()) {
            try {
                return Long.parseLong(v.trim());
            } catch (NumberFormatException ignored) {
                // некорректное значение — дефолт
            }
        }
        return def;
    }
}
