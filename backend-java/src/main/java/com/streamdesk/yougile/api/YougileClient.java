package com.streamdesk.yougile.api;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.streamdesk.yougile.api.YougileModels.CreateTaskDto;
import com.streamdesk.yougile.api.YougileModels.YgBoard;
import com.streamdesk.yougile.api.YougileModels.YgChatMessage;
import com.streamdesk.yougile.api.YougileModels.YgColumn;
import com.streamdesk.yougile.api.YougileModels.YgProject;
import com.streamdesk.yougile.api.YougileModels.YgStickerOption;
import com.streamdesk.yougile.api.YougileModels.YgStickerState;
import com.streamdesk.yougile.api.YougileModels.YgTask;
import com.streamdesk.yougile.api.YougileModels.YgUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;
import java.util.function.Supplier;

/**
 * Клиент YouGile API v2 — порт backend/yougile.ts.
 * Bearer-авторизация, лимит 50 запросов/мин на компанию → встроены rate-limiter (48/мин),
 * кэш GET-ответов (TTL 45–120 с) и очередь мутаций с ретраями при 429.
 */
@Component
public class YougileClient {

    private static final Logger log = LoggerFactory.getLogger(YougileClient.class);

    private final String baseUrl = stripTrailingSlash(
            envOr("YOUGILE_BASE_URL", "https://yougile.com/api-v2"));

    private final Path keyFile = cwd(".yougile-key");
    private final Path columnMapFile = cwd(".yougile-column-map.json");
    private final Path defaultColumnFile = cwd(".yougile-default-column");

    // Лимитер (50/мин на компанию — берём 48 с запасом).
    private static final int RATE_LIMIT = 48;
    private static final long WINDOW_MS = 60_000;
    private final Deque<Long> requestTimestamps = new ArrayDeque<>();

    // Кэш GET-ответов.
    private static final long TTL_PROJECTS = 90_000;
    private static final long TTL_BOARDS = 90_000;
    private static final long TTL_COLUMNS = 60_000;
    private static final long TTL_TASKS = 45_000;
    private static final long TTL_USERS = 120_000;
    private static final long TTL_STICKERS = 120_000;
    private final Map<String, CacheEntry> cache = new ConcurrentHashMap<>();

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    // Очередь мутаций (create/update/delete/comment) — выполняется по мере лимита.
    private final Deque<Job> mutationQueue = new ConcurrentLinkedDeque<>();
    private final ScheduledExecutorService queueExecutor = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "yougile-queue");
        t.setDaemon(true);
        return t;
    });
    private final AtomicBoolean draining = new AtomicBoolean(false);

    public YougileClient(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    private record CacheEntry(Object data, long expiresAt) {
    }

    // ——— Конфигурация / ключ ———

    private String getApiKey() {
        String fromEnv = envOr("YOUGILE_API_KEY", "").trim();
        if (!fromEnv.isEmpty()) {
            return fromEnv;
        }
        return readFile(keyFile).trim();
    }

    public boolean isConfigured() {
        return !getApiKey().isEmpty();
    }

    /** Сохранить API-ключ в файл (после получения по логину/паролю и companyId). */
    public void setApiKey(String key) {
        writeFile(keyFile, key.trim());
    }

    /** Маппинг: id колонки CRM (статус) → id колонки YouGile. */
    public Map<String, String> getColumnMap() {
        String raw = readFile(columnMapFile);
        if (raw.isBlank()) {
            return new LinkedHashMap<>();
        }
        try {
            Map<String, String> parsed = objectMapper.readValue(raw, new TypeReference<>() {
            });
            return parsed != null ? parsed : new LinkedHashMap<>();
        } catch (Exception e) {
            return new LinkedHashMap<>();
        }
    }

    public void setColumnMap(Map<String, String> map) {
        try {
            writeFile(columnMapFile, objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(map));
        } catch (Exception e) {
            log.warn("[YouGile] Failed to write column map: {}", e.getMessage());
        }
    }

    /** Обратный маппинг: id колонки YouGile → id колонки CRM (статус). */
    public Map<String, String> getColumnMapReverse() {
        Map<String, String> reverse = new LinkedHashMap<>();
        for (Map.Entry<String, String> e : getColumnMap().entrySet()) {
            if (e.getValue() != null && !e.getValue().isBlank()) {
                reverse.put(e.getValue(), e.getKey());
            }
        }
        return reverse;
    }

    /** Колонка YouGile по умолчанию для новых задач: env → файл → первая доступная. */
    public String getDefaultColumnId() {
        String fromEnv = envOr("YOUGILE_DEFAULT_COLUMN_ID", "").trim();
        if (!fromEnv.isEmpty()) {
            return fromEnv;
        }
        String fromFile = readFile(defaultColumnFile).trim();
        if (!fromFile.isEmpty()) {
            return fromFile;
        }
        try {
            List<YgProject> projects = getProjects();
            if (projects.isEmpty()) {
                return null;
            }
            List<YgBoard> boards = getBoards(projects.get(0).id());
            if (boards.isEmpty()) {
                return null;
            }
            List<YgColumn> columns = getColumns(boards.get(0).id());
            if (columns.isEmpty()) {
                return null;
            }
            String firstId = columns.get(0).id();
            writeFile(defaultColumnFile, firstId);
            return firstId;
        } catch (Exception e) {
            return null;
        }
    }

    // ——— Кэш ———

    public void clearCacheByPrefix(String prefix) {
        cache.keySet().removeIf(k -> k.startsWith(prefix));
    }

    public void clearCache() {
        cache.clear();
    }

    @SuppressWarnings("unchecked")
    private <T> T getCached(String key, long ttlMs, Supplier<T> fetcher) {
        CacheEntry entry = cache.get(key);
        if (entry != null && System.currentTimeMillis() <= entry.expiresAt()) {
            return (T) entry.data();
        }
        T data = fetcher.get();
        cache.put(key, new CacheEntry(data, System.currentTimeMillis() + ttlMs));
        return data;
    }

    // ——— Ядро запросов ———

    private synchronized void waitForRateLimit() {
        long now = System.currentTimeMillis();
        long cutoff = now - WINDOW_MS;
        while (!requestTimestamps.isEmpty() && requestTimestamps.peekFirst() < cutoff) {
            requestTimestamps.pollFirst();
        }
        if (requestTimestamps.size() < RATE_LIMIT) {
            return;
        }
        long waitMs = requestTimestamps.peekFirst() + WINDOW_MS - now + 100;
        try {
            Thread.sleep(Math.min(Math.max(waitMs, 0), 5000));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private synchronized void recordRequest() {
        long now = System.currentTimeMillis();
        requestTimestamps.addLast(now);
        long cutoff = now - WINDOW_MS;
        while (!requestTimestamps.isEmpty() && requestTimestamps.peekFirst() < cutoff) {
            requestTimestamps.pollFirst();
        }
    }

    /** Базовый запрос к YouGile с Bearer-ключом, лимитером и обработкой 429. Возвращает JsonNode или null. */
    private JsonNode request(String path, String method, Object body) {
        waitForRateLimit();
        recordRequest();
        String apiKey = getApiKey();
        if (apiKey.isEmpty()) {
            throw new IllegalStateException(
                    "YOUGILE_API_KEY не задан. Добавьте ключ в .env или получите его в Настройках (логин и пароль YouGile).");
        }
        String url = path.startsWith("http") ? path : baseUrl + (path.startsWith("/") ? path : "/" + path);
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(30))
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .header("Authorization", "Bearer " + apiKey);
            HttpRequest.BodyPublisher publisher = body != null
                    ? HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body))
                    : HttpRequest.BodyPublishers.noBody();
            builder.method(method, publisher);

            HttpResponse<String> res = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
            String text = res.body();
            if (res.statusCode() / 100 != 2) {
                handleError(res, text);
            }
            if (text == null || text.isEmpty()) {
                return null;
            }
            return objectMapper.readTree(text);
        } catch (YougileRateLimitException e) {
            throw e;
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("YouGile request failed: " + e.getMessage(), e);
        }
    }

    private void handleError(HttpResponse<String> res, String text) {
        String errMsg = "YouGile API " + res.statusCode();
        long retryAfterMs = 60_000;
        try {
            JsonNode json = objectMapper.readTree(text);
            String err = json.path("error").asText(null);
            String msg = json.path("message").asText(null);
            if (err != null) {
                errMsg = err;
            } else if (msg != null) {
                errMsg = msg;
            }
        } catch (Exception ignored) {
            if (text != null && !text.isEmpty()) {
                errMsg = text.substring(0, Math.min(text.length(), 200));
            }
        }
        if (res.statusCode() == 429 || isRateLimitMessage(errMsg)) {
            String retryAfter = res.headers().firstValue("Retry-After").orElse(null);
            if (retryAfter != null) {
                try {
                    retryAfterMs = Math.min(Long.parseLong(retryAfter.trim()) * 1000, 300_000);
                } catch (NumberFormatException ignored) {
                    // нечисловой Retry-After — оставим дефолт
                }
            }
            throw new YougileRateLimitException(errMsg, retryAfterMs);
        }
        throw new RuntimeException(errMsg);
    }

    private boolean isRateLimitMessage(String msg) {
        String lower = msg.toLowerCase();
        return lower.contains("too many requests") || lower.contains("лимит")
                || lower.contains("rate limit") || lower.contains("превышен") || lower.contains("429");
    }

    // ——— Авторизация (логин/пароль, без ключа) ———

    /** Список компаний (нужны логин и пароль, чтобы узнать companyId). */
    public List<Map<String, Object>> getCompanies(String login, String password) {
        JsonNode data = authRequest("/companies", Map.of("login", login, "password", password), "получения компаний");
        return convertList(asList(data), new TypeReference<>() {
        });
    }

    /** API-ключ по логину, паролю и companyId. */
    public String getAuthKey(String login, String password, String companyId) {
        JsonNode data = authRequest("/auth/keys",
                Map.of("login", login, "password", password, "companyId", companyId), "получения ключа");
        String key = data.path("key").asText(null);
        if (key == null) {
            key = data.path("token").asText(null);
        }
        if (key == null && data.isTextual()) {
            key = data.asText();
        }
        return key;
    }

    private JsonNode authRequest(String path, Object body, String errContext) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + path))
                    .timeout(Duration.ofSeconds(30))
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
                    .build();
            HttpResponse<String> res = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            JsonNode data = res.body() != null && !res.body().isEmpty()
                    ? objectMapper.readTree(res.body()) : objectMapper.createObjectNode();
            if (res.statusCode() / 100 != 2) {
                String err = data.path("error").asText(null);
                String msg = data.path("message").asText(null);
                throw new RuntimeException(err != null ? err : msg != null ? msg : "Ошибка " + errContext);
            }
            return data;
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Ошибка " + errContext + ": " + e.getMessage(), e);
        }
    }

    // ——— Проекты ———

    public List<YgProject> getProjects() {
        return getCached("projects", TTL_PROJECTS,
                () -> convertList(asList(request("/projects", "GET", null)), new TypeReference<>() {
                }));
    }

    public YgProject createProject(String title) {
        JsonNode data = request("/projects", "POST", Map.of("title", title));
        return convert(data, YgProject.class);
    }

    // ——— Доски ———

    public List<YgBoard> getBoards(String projectId) {
        String cacheKey = projectId != null ? "boards:" + projectId : "boards:all";
        return getCached(cacheKey, TTL_BOARDS, () -> {
            String path = projectId != null ? "/boards?projectId=" + enc(projectId) : "/boards";
            List<YgBoard> list = convertList(asList(request(path, "GET", null)), new TypeReference<>() {
            });
            if (projectId != null) {
                return list.stream()
                        .filter(b -> b.projectId() == null || b.projectId().equals(projectId))
                        .toList();
            }
            return list;
        });
    }

    public YgBoard createBoard(String projectId, String title) {
        return convert(request("/boards", "POST", Map.of("projectId", projectId, "title", title)), YgBoard.class);
    }

    public YgBoard getBoardById(String boardId) {
        try {
            return convert(request("/boards/" + boardId, "GET", null), YgBoard.class);
        } catch (Exception e) {
            return null;
        }
    }

    public YgBoard updateBoard(String boardId, String title) {
        Map<String, Object> body = new LinkedHashMap<>();
        if (title != null) {
            body.put("title", title);
        }
        return convert(request("/boards/" + boardId, "PUT", body), YgBoard.class);
    }

    // ——— Колонки ———

    public List<YgColumn> getColumns(String boardId) {
        return getCached("columns:" + boardId, TTL_COLUMNS, () -> {
            List<YgColumn> list = convertList(asList(request("/columns?boardId=" + enc(boardId), "GET", null)),
                    new TypeReference<>() {
                    });
            return list.stream()
                    .filter(c -> c.boardId() == null || c.boardId().equals(boardId))
                    .toList();
        });
    }

    public YgColumn createColumn(String boardId, String title, Integer color) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("boardId", boardId);
        body.put("title", title);
        if (color != null && color >= 1 && color <= 16) {
            body.put("color", color);
        }
        return convert(request("/columns", "POST", body), YgColumn.class);
    }

    public YgColumn updateColumn(String columnId, Map<String, Object> dto) {
        return convert(request("/columns/" + columnId, "PUT", dto), YgColumn.class);
    }

    // ——— Сотрудники ———

    public List<YgUser> getUsers() {
        try {
            return getCached("users", TTL_USERS,
                    () -> convertList(asList(request("/users", "GET", null)), new TypeReference<>() {
                    }));
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    // ——— Стикеры/фильтры доски (String Sticker State) ———

    /** Список стикеров доски с перебором возможных эндпоинтов YouGile (как в yougile.ts). */
    public List<YgStickerState> getStringStickerStates(String boardId) {
        return getCached("stickers:" + boardId, TTL_STICKERS, () -> {
            String encBoard = enc(boardId);
            String qBoard = "boardId=" + encBoard;
            String qSnake = "board_id=" + encBoard;
            String[] paths = {
                    "/string-stickers?" + qBoard,
                    "/string-stickers?" + qSnake,
                    "/string-sticker-states?" + qBoard,
                    "/string-sticker-states?" + qSnake,
                    "/string-sticker-state?" + qBoard,
                    "/string-sticker-states/search?" + qBoard,
                    "/boards/" + encBoard + "/string-stickers",
                    "/board/" + encBoard + "/string-stickers",
                    "/boards/" + encBoard + "/string-sticker-states",
            };
            for (String path : paths) {
                try {
                    JsonNode data = request(path, "GET", null);
                    List<JsonNode> list = stickerListFrom(data, path);
                    if (!list.isEmpty()) {
                        List<YgStickerState> normalized = normalizeStickerList(list, boardId);
                        if (!normalized.isEmpty()) {
                            return normalized;
                        }
                    }
                } catch (Exception ignored) {
                    // пробуем следующий путь
                }
            }
            // Fallback: доска может содержать id стикеров — запрашиваем каждый по отдельности.
            try {
                YgBoard board = getBoardById(boardId);
                List<String> ids = stickerIdsFromBoard(boardId);
                if (board != null && !ids.isEmpty()) {
                    List<YgStickerState> out = new ArrayList<>();
                    for (int i = 0; i < ids.size(); i++) {
                        try {
                            JsonNode one = request("/string-stickers/" + enc(ids.get(i)), "GET", null);
                            if (one != null && !one.path("deleted").asBoolean(false)) {
                                out.add(stickerFromNode(one, ids.get(i), boardId, i));
                            }
                        } catch (Exception ignored) {
                            // пропускаем этот стикер
                        }
                    }
                    if (!out.isEmpty()) {
                        return out;
                    }
                }
            } catch (Exception ignored) {
                // нет фолбэка — вернём пустой список
            }
            return new ArrayList<YgStickerState>();
        });
    }

    private List<JsonNode> stickerListFrom(JsonNode data, String path) {
        List<JsonNode> list = new ArrayList<>();
        if (data == null) {
            return list;
        }
        if (data.isArray()) {
            data.forEach(list::add);
            return list;
        }
        if (data.isObject()) {
            for (String key : new String[]{"content", "data", "items"}) {
                JsonNode c = data.get(key);
                if (c != null && c.isArray()) {
                    c.forEach(list::add);
                    return list;
                }
            }
            // эвристика для /boards/:id — ищем первый массив объектов со стикерами
            if (path.contains("/boards/") && !path.contains("string-sticker")) {
                var it = data.fields();
                while (it.hasNext()) {
                    JsonNode val = it.next().getValue();
                    if (val.isArray() && !val.isEmpty() && val.get(0).isObject()) {
                        JsonNode first = val.get(0);
                        if (first.has("id") && (first.has("name") || first.has("states"))) {
                            val.forEach(list::add);
                            return list;
                        }
                    }
                }
            }
        }
        return list;
    }

    private List<String> stickerIdsFromBoard(String boardId) {
        List<String> ids = new ArrayList<>();
        JsonNode board = request("/boards/" + enc(boardId), "GET", null);
        if (board == null) {
            return ids;
        }
        JsonNode raw = firstNonNull(board.get("stringStickers"), board.get("stringStickerIds"), board.get("stickerIds"));
        if (raw != null && raw.isArray()) {
            for (JsonNode x : raw) {
                if (x.isObject() && x.has("id")) {
                    ids.add(x.get("id").asText());
                } else if (x.isValueNode()) {
                    ids.add(x.asText());
                }
            }
        }
        return ids;
    }

    private List<YgStickerState> normalizeStickerList(List<JsonNode> raw, String boardId) {
        List<YgStickerState> out = new ArrayList<>();
        int i = 0;
        for (JsonNode s : raw) {
            if (s == null || s.path("deleted").asBoolean(false)) {
                i++;
                continue;
            }
            out.add(stickerFromNode(s, "sticker-" + i, boardId, i));
            i++;
        }
        return out;
    }

    private YgStickerState stickerFromNode(JsonNode s, String fallbackId, String boardId, int order) {
        String id = text(s, "id", fallbackId);
        String title = firstText(s, "name", "title", "id");
        if (title == null || title.isBlank()) {
            title = id;
        }
        List<YgStickerOption> options = null;
        JsonNode states = s.get("states");
        if (states != null && states.isArray() && !states.isEmpty()) {
            options = new ArrayList<>();
            int j = 0;
            for (JsonNode st : states) {
                String optId = text(st, "id", text(st, "name", "opt-" + j));
                String optTitle = firstText(st, "name", "title", "id");
                options.add(new YgStickerOption(optId, optTitle != null ? optTitle : optId));
                j++;
            }
        }
        String type = options != null && !options.isEmpty() ? "list" : "string";
        return new YgStickerState(id, title, boardId, order, type, options);
    }

    /** Опции стикера (значения списка). */
    public List<YgStickerOption> getStringStickerValues(String stringStickerId) {
        return getCached("sticker-values:" + stringStickerId, TTL_STICKERS, () -> {
            String enc = enc(stringStickerId);
            try {
                JsonNode one = request("/string-stickers/" + enc, "GET", null);
                if (one != null && !one.path("deleted").asBoolean(false)) {
                    JsonNode states = one.get("states");
                    if (states != null && states.isArray() && !states.isEmpty()) {
                        List<YgStickerOption> opts = new ArrayList<>();
                        int i = 0;
                        for (JsonNode st : states) {
                            String id = text(st, "id", text(st, "name", "opt-" + i));
                            String title = firstText(st, "name", "id");
                            opts.add(new YgStickerOption(id, title != null ? title : id));
                            i++;
                        }
                        return opts;
                    }
                }
            } catch (Exception ignored) {
                // пробуем list-эндпоинты ниже
            }
            String q = "stringStickerStateId=" + enc;
            String[] paths = {
                    "/string-sticker-values?" + q,
                    "/string-sticker/search?" + q,
                    "/string-stickers/search?" + q,
                    "/string-sticker-states/" + enc + "/values",
                    "/string-sticker-state/" + enc + "/values",
            };
            for (String path : paths) {
                try {
                    JsonNode data = request(path, "GET", null);
                    List<JsonNode> list = new ArrayList<>();
                    if (data != null && data.isArray()) {
                        data.forEach(list::add);
                    } else if (data != null) {
                        JsonNode c = firstNonNull(data.get("content"), data.get("values"));
                        if (c != null && c.isArray()) {
                            c.forEach(list::add);
                        }
                    }
                    if (!list.isEmpty()) {
                        List<YgStickerOption> opts = new ArrayList<>();
                        for (JsonNode n : list) {
                            opts.add(new YgStickerOption(text(n, "id", null), text(n, "title", null)));
                        }
                        return opts;
                    }
                } catch (Exception ignored) {
                    // пробуем следующий
                }
            }
            return new ArrayList<YgStickerOption>();
        });
    }

    // ——— Задачи ———

    private List<YgTask> getTasksByColumn(String columnId, TaskQuery opts) {
        long limit = opts != null && opts.limit() != null ? opts.limit() : 1000;
        long offset = opts != null && opts.offset() != null ? opts.offset() : 0;
        StringBuilder search = new StringBuilder();
        search.append("columnId=").append(enc(columnId));
        search.append("&limit=").append(limit);
        search.append("&offset=").append(offset);
        if (opts != null && opts.assignedTo() != null) {
            search.append("&assignedTo=").append(enc(opts.assignedTo()));
        }
        if (opts != null && opts.title() != null) {
            search.append("&title=").append(enc(opts.title()));
        }
        String cacheKey = "tasks:" + columnId + ":"
                + (opts != null && opts.assignedTo() != null ? opts.assignedTo() : "") + ":"
                + (opts != null && opts.title() != null ? opts.title() : "");
        return getCached(cacheKey, TTL_TASKS, () -> {
            List<YgTask> list = convertList(asList(request("/task-list?" + search, "GET", null)),
                    new TypeReference<>() {
                    });
            List<YgTask> out = new ArrayList<>();
            for (YgTask t : list) {
                out.add(t.columnId() != null ? t : withColumn(t, columnId));
            }
            return out;
        });
    }

    /** Получить список задач YouGile (по columnId / boardId / projectId или все). */
    public List<YgTask> getTasks(TaskQuery params) {
        if (params != null && params.columnId() != null) {
            return getTasksByColumn(params.columnId(), params);
        }
        if (params != null && params.boardId() != null) {
            List<YgTask> all = new ArrayList<>();
            Set<String> seen = new LinkedHashSet<>();
            for (YgColumn col : getColumns(params.boardId())) {
                for (YgTask t : getTasksByColumn(col.id(), params)) {
                    if (seen.add(t.id())) {
                        all.add(fillBoard(t, params.boardId(), col.id()));
                    }
                }
            }
            return all;
        }
        if (params != null && params.projectId() != null) {
            List<YgTask> all = new ArrayList<>();
            Set<String> seen = new LinkedHashSet<>();
            for (YgBoard board : getBoards(params.projectId())) {
                for (YgTask t : getTasks(new TaskQuery(null, board.id(), null, null, null, null, null))) {
                    if (seen.add(t.id())) {
                        all.add(fillProject(t, params.projectId(), board.id()));
                    }
                }
            }
            return all;
        }
        // Без фильтра: все проекты → доски → колонки → задачи.
        List<YgTask> all = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (YgProject p : getProjects()) {
            List<YgTask> list;
            try {
                list = getTasks(new TaskQuery(p.id(), null, null, null, null, null, null));
            } catch (Exception e) {
                list = new ArrayList<>();
            }
            for (YgTask t : list) {
                if (seen.add(t.id())) {
                    all.add(t);
                }
            }
        }
        return all;
    }

    public YgTask createTask(CreateTaskDto dto) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", dto.title());
        body.put("columnId", dto.columnId());
        if (dto.description() != null) {
            body.put("description", dto.description());
        }
        if (dto.assigneeId() != null) {
            body.put("assigneeId", dto.assigneeId());
        }
        if (dto.assigned() != null) {
            body.put("assigned", dto.assigned());
        }
        if (dto.deadline() != null) {
            body.put("deadline", dto.deadline());
        }
        YgTask result = convert(request("/tasks", "POST", body), YgTask.class);
        clearCacheByPrefix("tasks:");
        return result;
    }

    /** Обновить задачу. body передаётся как есть (включая null — например, сбросить assignee). */
    public YgTask updateTask(String taskId, Map<String, Object> dto) {
        Map<String, Object> body = new LinkedHashMap<>(dto);
        Object deadline = body.get("deadline");
        if (deadline instanceof String s && !s.isBlank()) {
            try {
                body.put("deadline", java.time.Instant.parse(s).toEpochMilli());
            } catch (Exception ignored) {
                // не ISO — оставим как есть
            }
        }
        YgTask result = convert(request("/tasks/" + taskId, "PUT", body), YgTask.class);
        clearCacheByPrefix("tasks:");
        return result;
    }

    public void deleteTask(String taskId) {
        request("/tasks/" + taskId, "DELETE", null);
        clearCacheByPrefix("tasks:");
    }

    public YgTask getTaskById(String taskId) {
        try {
            return convert(request("/tasks/" + taskId, "GET", null), YgTask.class);
        } catch (Exception e) {
            return null;
        }
    }

    /** Сырой JSON задачи — нужен синку для эвристического разбора (теги/стикеры/подзадачи/дедлайны). */
    public JsonNode getTaskByIdRaw(String taskId) {
        try {
            return request("/tasks/" + taskId, "GET", null);
        } catch (Exception e) {
            return null;
        }
    }

    // ——— Чат задачи ———

    public List<YgChatMessage> getChatMessages(String taskId) {
        JsonNode data = request("/chats/" + enc(taskId) + "/messages", "GET", null);
        List<JsonNode> list;
        if (data != null && data.isArray()) {
            list = new ArrayList<>();
            data.forEach(list::add);
        } else if (data != null) {
            JsonNode c = firstNonNull(data.get("content"), data.get("messages"));
            list = new ArrayList<>();
            if (c != null && c.isArray()) {
                c.forEach(list::add);
            }
        } else {
            list = new ArrayList<>();
        }
        return convertList(list, new TypeReference<>() {
        });
    }

    public YgChatMessage sendChatMessage(String taskId, String text) {
        return convert(request("/chats/" + enc(taskId) + "/messages", "POST", Map.of("text", text)),
                YgChatMessage.class);
    }

    // ——— Очередь мутаций ———

    /** Поставить в очередь обновление задачи (ответ клиенту можно отдать сразу). */
    public void enqueueUpdate(String yougileTaskId, Map<String, Object> payload) {
        enqueue(new UpdateJob(yougileTaskId, payload));
    }

    /** Поставить в очередь удаление задачи. */
    public void enqueueDelete(String yougileTaskId) {
        enqueue(new DeleteJob(yougileTaskId));
    }

    /** Поставить в очередь сообщение в чат задачи. */
    public void enqueueComment(String yougileTaskId, String text) {
        String normalized = text != null ? text.trim() : "";
        if (normalized.isEmpty()) {
            return;
        }
        enqueue(new CommentJob(yougileTaskId, normalized));
    }

    /** Поставить в очередь создание задачи; onSuccess получит ответ YouGile. */
    public void enqueueCreate(CreateTaskDto dto, Consumer<YgTask> onSuccess) {
        enqueue(new CreateJob(dto, onSuccess));
    }

    private void enqueue(Job job) {
        mutationQueue.addLast(job);
        queueExecutor.submit(this::processQueue);
    }

    private void processQueue() {
        if (!isConfigured() || !draining.compareAndSet(false, true)) {
            return;
        }
        try {
            Job job;
            while ((job = mutationQueue.pollFirst()) != null) {
                try {
                    runJob(job);
                } catch (YougileRateLimitException e) {
                    mutationQueue.addFirst(job);
                    long ms = Math.min(Math.max(e.getRetryAfterMs(), 5000), 120_000);
                    draining.set(false);
                    queueExecutor.schedule(this::processQueue, ms, TimeUnit.MILLISECONDS);
                    return;
                } catch (Exception e) {
                    log.warn("[YouGile] Queue job failed, will not retry: {} {}",
                            job.getClass().getSimpleName(), e.getMessage());
                }
            }
        } finally {
            draining.set(false);
        }
    }

    private void runJob(Job job) {
        if (job instanceof UpdateJob j) {
            updateTask(j.yougileTaskId(), j.payload());
        } else if (job instanceof DeleteJob j) {
            deleteTask(j.yougileTaskId());
        } else if (job instanceof CommentJob j) {
            sendChatMessage(j.yougileTaskId(), j.text());
        } else if (job instanceof CreateJob j) {
            YgTask ygTask = createTask(j.dto());
            if (j.onSuccess() != null) {
                j.onSuccess().accept(ygTask);
            }
        }
    }

    private sealed interface Job permits UpdateJob, DeleteJob, CommentJob, CreateJob {
    }

    private record UpdateJob(String yougileTaskId, Map<String, Object> payload) implements Job {
    }

    private record DeleteJob(String yougileTaskId) implements Job {
    }

    private record CommentJob(String yougileTaskId, String text) implements Job {
    }

    private record CreateJob(CreateTaskDto dto, Consumer<YgTask> onSuccess) implements Job {
    }

    /** Параметры выборки задач (порт YouGileGetTasksParams). */
    public record TaskQuery(String projectId, String boardId, String columnId,
                            String assignedTo, String title, Long limit, Long offset) {
    }

    // ——— helpers ———

    private List<JsonNode> asList(JsonNode data) {
        List<JsonNode> list = new ArrayList<>();
        if (data == null) {
            return list;
        }
        if (data.isArray()) {
            data.forEach(list::add);
        } else {
            JsonNode content = data.get("content");
            if (content != null && content.isArray()) {
                content.forEach(list::add);
            }
        }
        return list;
    }

    private <T> List<T> convertList(List<JsonNode> nodes, TypeReference<List<T>> typeRef) {
        try {
            return objectMapper.convertValue(nodes, typeRef);
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    private <T> T convert(JsonNode node, Class<T> type) {
        if (node == null) {
            return null;
        }
        try {
            return objectMapper.treeToValue(node, type);
        } catch (Exception e) {
            throw new RuntimeException("Failed to parse YouGile response: " + e.getMessage(), e);
        }
    }

    private YgTask withColumn(YgTask t, String columnId) {
        return new YgTask(t.id(), t.title(), t.description(), columnId, t.boardId(), t.projectId(),
                t.assigned(), t.status());
    }

    private YgTask fillBoard(YgTask t, String boardId, String colId) {
        return new YgTask(t.id(), t.title(), t.description(), t.columnId() != null ? t.columnId() : colId,
                boardId, t.projectId(), t.assigned(), t.status());
    }

    private YgTask fillProject(YgTask t, String projectId, String boardId) {
        return new YgTask(t.id(), t.title(), t.description(), t.columnId(),
                t.boardId() != null ? t.boardId() : boardId, projectId, t.assigned(), t.status());
    }

    private JsonNode firstNonNull(JsonNode... nodes) {
        for (JsonNode n : nodes) {
            if (n != null && !n.isNull()) {
                return n;
            }
        }
        return null;
    }

    private String text(JsonNode node, String field, String fallback) {
        JsonNode v = node.get(field);
        return v != null && !v.isNull() ? v.asText() : fallback;
    }

    private String firstText(JsonNode node, String... fields) {
        for (String f : fields) {
            JsonNode v = node.get(f);
            if (v != null && !v.isNull() && !v.asText().isBlank()) {
                return v.asText();
            }
        }
        return null;
    }

    private String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }

    private static String envOr(String name, String def) {
        String v = System.getenv(name);
        return v != null ? v : def;
    }

    private static String stripTrailingSlash(String s) {
        return s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
    }

    private static Path cwd(String file) {
        return Paths.get(System.getProperty("user.dir"), file);
    }

    private String readFile(Path path) {
        try {
            return Files.exists(path) ? Files.readString(path) : "";
        } catch (Exception e) {
            return "";
        }
    }

    private void writeFile(Path path, String content) {
        try {
            Files.writeString(path, content);
        } catch (Exception e) {
            log.warn("[YouGile] Failed to write {}: {}", path.getFileName(), e.getMessage());
        }
    }
}
