package com.streamdesk.yougile.sync;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.BiPredicate;
import java.util.function.Function;
import java.util.regex.Pattern;

/**
 * Эвристический разбор сырого JSON задачи YouGile — порт функций extract../normalize.. из
 * backend/yougile-sync.ts. Все методы работают над Jackson JsonNode (аналог обхода JS-объектов).
 */
@Component
public class YougileExtractor {

    private static final Pattern OPAQUE_ID = Pattern.compile(
            "^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"
                    + "|[0-9a-f]{24,}|[A-Za-z0-9_-]{24,})$",
            Pattern.CASE_INSENSITIVE);

    private static final Pattern DEADLINE_KEY = Pattern.compile(
            "deadline|due(?:_?date)?|expiredat|finishdate|enddate|planned(?:at|date)?", Pattern.CASE_INSENSITIVE);
    private static final Pattern NOT_DEADLINE_KEY = Pattern.compile(
            "created|updated|modified|synced", Pattern.CASE_INSENSITIVE);
    private static final Pattern COMMENTS_KEY = Pattern.compile(
            "comments?|messages?|discussion|chat|thread", Pattern.CASE_INSENSITIVE);
    private static final Pattern HISTORY_KEY = Pattern.compile(
            "history|activities|activity|events|logs|changes|audit", Pattern.CASE_INSENSITIVE);
    private static final Pattern DEADLINE_TAG = Pattern.compile("deadline|due|date|дедлайн|срок|дата");
    private static final Pattern ASSIGNEE_TAG = Pattern.compile(
            "assignee|performer|responsible|executor|исполнитель|ответственн");

    private final ObjectMapper objectMapper;

    public YougileExtractor(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    // ——— базовые ———

    public String normalizeIdentity(String value) {
        return value == null ? "" : value.trim().toLowerCase();
    }

    public boolean looksLikeOpaqueId(String value) {
        if (value == null) {
            return false;
        }
        String n = value.trim();
        return !n.isEmpty() && OPAQUE_ID.matcher(n).matches();
    }

    /** Разбор даты YouGile (число сек/мс, строка ISO/числовая, вложенный объект с датой). */
    public Instant normalizeDate(JsonNode value) {
        if (value == null || value.isNull()) {
            return null;
        }
        if (value.isNumber()) {
            long v = value.asLong();
            if (v <= 0) {
                return null;
            }
            long ms = v < 1_000_000_000_000L ? v * 1000 : v;
            return Instant.ofEpochMilli(ms);
        }
        if (value.isTextual()) {
            String trimmed = value.asText().trim();
            if (trimmed.isEmpty()) {
                return null;
            }
            try {
                double numeric = Double.parseDouble(trimmed);
                if (numeric > 0) {
                    long v = (long) numeric;
                    long ms = v < 1_000_000_000_000L ? v * 1000 : v;
                    return Instant.ofEpochMilli(ms);
                }
            } catch (NumberFormatException ignored) {
                // не число — пробуем как дату
            }
            return parseDateString(trimmed);
        }
        if (value.isObject()) {
            for (String key : new String[]{"deadline", "dueDate", "due_date", "date", "expiredAt",
                    "finishDate", "endDate", "value", "timestamp", "start", "seconds", "unix", "ms"}) {
                JsonNode nested = value.get(key);
                if (nested != null && !nested.isNull()) {
                    Instant parsed = normalizeDate(nested);
                    if (parsed != null) {
                        return parsed;
                    }
                }
            }
        }
        return null;
    }

    private Instant parseDateString(String s) {
        try {
            return Instant.parse(s);
        } catch (Exception ignored) {
            // не ISO-instant
        }
        try {
            return java.time.OffsetDateTime.parse(s).toInstant();
        } catch (Exception ignored) {
            // не offset-datetime
        }
        try {
            return LocalDate.parse(s).atStartOfDay(ZoneOffset.UTC).toInstant();
        } catch (Exception ignored) {
            return null;
        }
    }

    public String normalizeTimestamp(JsonNode value) {
        Instant parsed = normalizeDate(value);
        return parsed != null ? parsed.toString() : null;
    }

    // ——— обход вложенных значений ———

    public JsonNode findNestedValueByKey(JsonNode source, BiPredicate<String, JsonNode> matcher, int maxDepth) {
        return findNested(source, matcher, maxDepth, new LinkedHashSet<>());
    }

    private JsonNode findNested(JsonNode source, BiPredicate<String, JsonNode> matcher, int maxDepth, Set<JsonNode> seen) {
        if (source == null || !source.isContainerNode() || maxDepth < 0 || seen.contains(source)) {
            return null;
        }
        seen.add(source);
        if (source.isArray()) {
            for (JsonNode item : source) {
                JsonNode nested = findNested(item, matcher, maxDepth - 1, seen);
                if (nested != null) {
                    return nested;
                }
            }
            return null;
        }
        var it = source.fields();
        while (it.hasNext()) {
            var e = it.next();
            JsonNode value = e.getValue();
            if (matcher.test(e.getKey(), value) && value != null && !value.isNull() && !"".equals(value.asText(""))) {
                return value;
            }
            JsonNode nested = findNested(value, matcher, maxDepth - 1, seen);
            if (nested != null) {
                return nested;
            }
        }
        return null;
    }

    public List<JsonNode> collectNestedValuesByKey(JsonNode source, BiPredicate<String, JsonNode> matcher, int maxDepth) {
        List<JsonNode> acc = new ArrayList<>();
        collectNested(source, matcher, maxDepth, new LinkedHashSet<>(), acc);
        return acc;
    }

    private void collectNested(JsonNode source, BiPredicate<String, JsonNode> matcher, int maxDepth,
                               Set<JsonNode> seen, List<JsonNode> acc) {
        if (source == null || !source.isContainerNode() || maxDepth < 0 || seen.contains(source)) {
            return;
        }
        seen.add(source);
        if (source.isArray()) {
            for (JsonNode item : source) {
                collectNested(item, matcher, maxDepth - 1, seen, acc);
            }
            return;
        }
        var it = source.fields();
        while (it.hasNext()) {
            var e = it.next();
            if (matcher.test(e.getKey(), e.getValue())) {
                acc.add(e.getValue());
            }
            collectNested(e.getValue(), matcher, maxDepth - 1, seen, acc);
        }
    }

    // ——— текст ———

    /** Первый читаемый текст из кандидатов (по умолчанию пропускает «непрозрачные» id). */
    public String pickReadableText(List<String> candidates, boolean allowOpaqueIds) {
        List<String> norm = new ArrayList<>();
        for (String c : candidates) {
            if (c != null) {
                String t = c.trim();
                if (!t.isEmpty()) {
                    norm.add(t);
                }
            }
        }
        if (allowOpaqueIds) {
            return norm.isEmpty() ? null : norm.get(0);
        }
        for (String c : norm) {
            if (!looksLikeOpaqueId(c)) {
                return c;
            }
        }
        return norm.isEmpty() ? null : norm.get(0);
    }

    // ——— актор / исполнители / дедлайн ———

    /** {externalUserId, authorName} автора элемента (комментарий/история). */
    public Map<String, String> extractActor(JsonNode item) {
        String externalUserId = pickReadableText(strings(item,
                "userId", "authorId", "creatorId", "actorId", "ownerId"), true);
        if (externalUserId == null) {
            externalUserId = pickReadableText(List.of(
                    nestedText(item, "user", "id"), nestedText(item, "author", "id"),
                    nestedText(item, "creator", "id"), nestedText(item, "actor", "id")), true);
        }
        String authorName = pickReadableText(List.of(
                nestedText(item, "user", "name"), nestedText(item, "author", "name"),
                nestedText(item, "creator", "name"), nestedText(item, "actor", "name"),
                text(item, "userName"), text(item, "authorName"),
                text(item, "creatorName"), text(item, "actorName")), false);
        Map<String, String> out = new LinkedHashMap<>();
        out.put("externalUserId", externalUserId);
        out.put("authorName", authorName);
        return out;
    }

    public List<String> extractAssignedIds(JsonNode task) {
        JsonNode raw = firstNonNull(task, "assigned", "assignees", "responsibles", "performers");
        Set<String> ids = new LinkedHashSet<>();
        if (raw != null && raw.isArray()) {
            for (JsonNode c : raw) {
                addAssignedCandidate(ids, c);
            }
        } else if (raw != null && raw.isObject()) {
            raw.forEach(c -> addAssignedCandidate(ids, c));
        } else {
            addAssignedCandidate(ids, task.get("assigneeId"));
            addAssignedCandidate(ids, task.get("assignedTo"));
        }
        return new ArrayList<>(ids);
    }

    private void addAssignedCandidate(Set<String> ids, JsonNode candidate) {
        if (candidate == null || candidate.isNull()) {
            return;
        }
        if (candidate.isValueNode()) {
            String n = candidate.asText().trim();
            if (!n.isEmpty()) {
                ids.add(n);
            }
            return;
        }
        if (candidate.isObject()) {
            JsonNode nested = firstNonNull(candidate, "id", "userId", "assigneeId", "value");
            if (nested != null && !nested.asText().trim().isEmpty()) {
                ids.add(nested.asText().trim());
            }
        }
    }

    public Instant extractDeadline(JsonNode task) {
        for (String key : new String[]{"deadline", "dueDate", "due_date", "date", "expiredAt", "finishDate", "endDate"}) {
            Instant parsed = normalizeDate(task.get(key));
            if (parsed != null) {
                return parsed;
            }
        }
        JsonNode nested = findNestedValueByKey(task,
                (key, value) -> DEADLINE_KEY.matcher(key).find()
                        && !NOT_DEADLINE_KEY.matcher(key).find()
                        && value != null && !value.isNull(), 4);
        return normalizeDate(nested);
    }

    public Instant extractDeadlineFromTags(List<Map<String, Object>> tags) {
        if (tags == null) {
            return null;
        }
        for (Map<String, Object> tag : tags) {
            if (!matchesTag(tag, DEADLINE_TAG)) {
                continue;
            }
            Object value = firstNonNullObj(tag, "value", "displayValue", "title", "name");
            Instant parsed = normalizeDate(objectMapper.valueToTree(value));
            if (parsed != null) {
                return parsed;
            }
        }
        return null;
    }

    public List<String> extractAssigneeCandidatesFromTags(List<Map<String, Object>> tags) {
        Set<String> values = new LinkedHashSet<>();
        if (tags == null) {
            return new ArrayList<>(values);
        }
        for (Map<String, Object> tag : tags) {
            if (!matchesTag(tag, ASSIGNEE_TAG)) {
                continue;
            }
            Object candidate = firstNonNullObj(tag, "value", "displayValue", "id", "name");
            if (candidate != null && !candidate.toString().trim().isEmpty()) {
                values.add(candidate.toString().trim());
            }
        }
        return new ArrayList<>(values);
    }

    private boolean matchesTag(Map<String, Object> tag, Pattern pattern) {
        String label = str(tag.get("name"));
        if (label.isEmpty()) {
            label = str(tag.get("title"));
        }
        if (label.isEmpty()) {
            label = str(tag.get("id"));
        }
        return pattern.matcher(label.trim().toLowerCase()).find();
    }

    // ——— стикеры ———

    /** Стикер доски для разбора значений у задачи. */
    public record BoardSticker(String id, String title, String type, List<Map<String, Object>> options) {
    }

    public List<Map<String, Object>> extractStickerTags(JsonNode task, List<BoardSticker> stickers,
                                                        Map<String, String> idToLabel) {
        List<Map<String, Object>> tags = new ArrayList<>();
        for (BoardSticker sticker : stickers) {
            String name = !str(sticker.title()).trim().isEmpty() ? sticker.title().trim() : sticker.id();
            for (JsonNode rawValue : collectStickerRawValues(task, sticker)) {
                for (Map<String, Object> entry : normalizeStickerEntries(rawValue, sticker, idToLabel)) {
                    Object v = entry.get("value");
                    Object dv = entry.get("displayValue");
                    if (isBlank(v) && isBlank(dv)) {
                        continue;
                    }
                    Map<String, Object> tag = new LinkedHashMap<>();
                    tag.put("id", sticker.id());
                    tag.put("name", name);
                    tag.put("value", isBlank(v) ? null : v);
                    tag.put("displayValue", isBlank(dv) ? null : dv);
                    tag.put("color", isBlank(entry.get("color")) ? null : entry.get("color"));
                    tags.add(tag);
                }
            }
        }
        return dedupTags(tags, true);
    }

    private List<JsonNode> collectStickerRawValues(JsonNode task, BoardSticker sticker) {
        List<JsonNode> out = new ArrayList<>();
        String idKey = normalizeIdentity(sticker.id());
        String titleKey = normalizeIdentity(sticker.title());
        String[] containers = {"stickers", "stringStickers", "stringStickerValues", "stringStickerStates",
                "customFields", "fields", "properties", "props", "values", "meta", "data"};
        for (String cname : containers) {
            JsonNode container = task.get(cname);
            if (container == null || container.isNull()) {
                continue;
            }
            if (container.isArray()) {
                for (JsonNode item : container) {
                    if (!item.isObject()) {
                        continue;
                    }
                    String itemId = normalizeIdentity(textAny(item, "stickerId", "stringStickerId", "id"));
                    String itemTitle = normalizeIdentity(textAny(item, "title", "name"));
                    if (itemId.equals(idKey) || (!titleKey.isEmpty() && itemTitle.equals(titleKey))) {
                        addNode(out, firstNonNull(item, "value", "stateId", "selectedId", "text", "title", "name"));
                    }
                }
                continue;
            }
            if (container.isObject()) {
                addNode(out, container.get(sticker.id()));
                if (sticker.title() != null) {
                    addNode(out, container.get(sticker.title()));
                }
                var it = container.fields();
                while (it.hasNext()) {
                    var e = it.next();
                    String nk = normalizeIdentity(e.getKey());
                    if (nk.equals(idKey) || (!titleKey.isEmpty() && nk.equals(titleKey))) {
                        addNode(out, e.getValue());
                    }
                    JsonNode value = e.getValue();
                    if (value.isObject()
                            && normalizeIdentity(textAny(value, "stickerId", "stringStickerId", "id")).equals(idKey)) {
                        addNode(out, firstNonNull(value, "value", "stateId", "selectedId", "text", "title", "name"));
                    }
                }
            }
        }
        List<JsonNode> nested = collectNestedValuesByKey(task, (key, value) -> {
            String nk = normalizeIdentity(key);
            if (nk.equals(idKey) || (!titleKey.isEmpty() && nk.equals(titleKey))) {
                return true;
            }
            if (value != null && value.isObject()) {
                return normalizeIdentity(textAny(value, "stickerId", "stringStickerId")).equals(idKey);
            }
            return false;
        }, 4);
        for (JsonNode v : nested) {
            addNode(out, v);
        }
        return out;
    }

    private List<Map<String, Object>> normalizeStickerEntries(JsonNode rawValue, BoardSticker sticker,
                                                              Map<String, String> idToLabel) {
        Map<String, Map<String, Object>> optionMap = new LinkedHashMap<>();
        if (sticker.options() != null) {
            for (Map<String, Object> opt : sticker.options()) {
                String key = str(firstNonNullObj(opt, "id", "title")).trim();
                Map<String, Object> v = new LinkedHashMap<>();
                v.put("title", str(firstNonNullObj(opt, "title", "id")).trim());
                v.put("color", opt.get("color"));
                optionMap.put(key, v);
            }
        }
        return normalizeStickerSingle(rawValue, optionMap, idToLabel);
    }

    private List<Map<String, Object>> normalizeStickerSingle(JsonNode value, Map<String, Map<String, Object>> optionMap,
                                                             Map<String, String> idToLabel) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (value == null || value.isNull()) {
            return out;
        }
        if (value.isArray()) {
            for (JsonNode item : value) {
                out.addAll(normalizeStickerSingle(item, optionMap, idToLabel));
            }
            return out;
        }
        if (value.isValueNode()) {
            String normalized = value.asText().trim();
            if (normalized.isEmpty()) {
                return out;
            }
            Map<String, Object> option = optionMap.get(normalized);
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("value", normalized);
            String display = option != null ? str(option.get("title")) : null;
            if ((display == null || display.isEmpty()) && idToLabel != null) {
                display = idToLabel.get(normalized);
            }
            entry.put("displayValue", display);
            entry.put("color", option != null ? option.get("color") : null);
            out.add(entry);
            return out;
        }
        if (value.isObject()) {
            JsonNode inner = firstNonNull(value, "value", "stateId", "selectedId", "userId", "id", "name", "title", "text");
            List<Map<String, Object>> base = normalizeStickerSingle(inner, optionMap, idToLabel);
            String objDisplay = pickReadableText(strings(value, "title", "name", "text", "label"), true);
            for (Map<String, Object> entry : base) {
                if (objDisplay != null) {
                    entry.put("displayValue", objDisplay);
                }
                out.add(entry);
            }
            return out;
        }
        return out;
    }

    public List<Map<String, Object>> mergeTags(List<Map<String, Object>> base, List<Map<String, Object>> add) {
        List<Map<String, Object>> merged = new ArrayList<>();
        if (base != null) {
            merged.addAll(base);
        }
        if (add != null) {
            merged.addAll(add);
        }
        return dedupTags(merged, false);
    }

    private List<Map<String, Object>> dedupTags(List<Map<String, Object>> tags, boolean byDisplay) {
        List<Map<String, Object>> out = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (Map<String, Object> tag : tags) {
            String id = str(firstNonNullObj(tag, "id", "name")).trim();
            String value = byDisplay
                    ? str(tag.get("value")) + " " + str(tag.get("displayValue"))
                    : str(firstNonNullObj(tag, "value", "displayValue")).trim();
            String key = id + "" + value;
            if (seen.add(key)) {
                out.add(tag);
            }
        }
        return out;
    }

    // ——— подзадачи ———

    public List<Map<String, Object>> normalizeSubtasks(JsonNode raw, Function<String, String> resolveLinkedTitle) {
        if (raw == null || raw.isNull()) {
            return null;
        }
        List<Map<String, Object>> out = new ArrayList<>();
        if (raw.isArray()) {
            int i = 0;
            for (JsonNode item : raw) {
                Map<String, Object> n = normalizeSubtaskItem("st-" + (i + 1), item, resolveLinkedTitle);
                if (n != null) {
                    out.add(n);
                }
                i++;
            }
            return out;
        }
        if (raw.isObject()) {
            int i = 0;
            var it = raw.fields();
            while (it.hasNext()) {
                var e = it.next();
                String fallback = !e.getKey().isEmpty() ? e.getKey() : "st-" + (i + 1);
                JsonNode value = e.getValue();
                Map<String, Object> n;
                if (value.isValueNode()) {
                    var node = objectMapper.createObjectNode();
                    node.put("id", e.getKey());
                    node.put("title", value.asText());
                    node.put("taskId", e.getKey());
                    n = normalizeSubtaskItem(fallback, node, resolveLinkedTitle);
                } else if (value.isObject()) {
                    var node = value.deepCopy();
                    ((com.fasterxml.jackson.databind.node.ObjectNode) node).put("id", e.getKey());
                    n = normalizeSubtaskItem(fallback, node, resolveLinkedTitle);
                } else {
                    n = null;
                }
                if (n != null) {
                    out.add(n);
                }
                i++;
            }
            return out;
        }
        return null;
    }

    private Map<String, Object> normalizeSubtaskItem(String fallbackId, JsonNode item,
                                                     Function<String, String> resolveLinkedTitle) {
        if (item.isValueNode()) {
            String linkedTaskId = item.asText().trim();
            String title = resolveLinkedTitle != null ? resolveLinkedTitle.apply(linkedTaskId) : null;
            if (title == null) {
                title = linkedTaskId;
            }
            if (title == null || title.isEmpty()) {
                return null;
            }
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", !linkedTaskId.isEmpty() ? linkedTaskId : fallbackId);
            m.put("linkedTaskId", linkedTaskId.isEmpty() ? null : linkedTaskId);
            m.put("title", title);
            m.put("name", title);
            m.put("completed", false);
            return m;
        }
        if (!item.isObject()) {
            return null;
        }
        String linkedTaskId = str(firstNonNull(item, "taskId", "subtaskTaskId", "childTaskId",
                "cardId", "linkedTaskId", "id")).trim();
        if (linkedTaskId.isEmpty()) {
            linkedTaskId = fallbackId;
        }
        List<String> titleCandidates = new ArrayList<>(strings(item, "title", "name", "text", "value", "label", "content", "caption"));
        titleCandidates.add(nestedText(item, "task", "title"));
        titleCandidates.add(nestedText(item, "task", "name"));
        titleCandidates.add(nestedText(item, "task", "text"));
        titleCandidates.add(nestedText(item, "task", "description"));
        titleCandidates.add(nestedText(item, "item", "title"));
        titleCandidates.add(nestedText(item, "item", "name"));
        titleCandidates.add(nestedText(item, "card", "title"));
        titleCandidates.add(nestedText(item, "card", "name"));
        if (resolveLinkedTitle != null) {
            titleCandidates.add(resolveLinkedTitle.apply(linkedTaskId));
        }
        String title = pickReadableText(titleCandidates, false);
        List<String> descCandidates = new ArrayList<>(strings(item, "description", "note", "details", "comment", "body"));
        descCandidates.add(nestedText(item, "task", "description"));
        String description = pickReadableText(descCandidates, true);
        String id = str(firstNonNull(item, "id", "subtaskId", "checklistId")).trim();
        if (id.isEmpty()) {
            id = fallbackId;
        }
        boolean completed = bool(item, "completed") || bool(item, "checked") || bool(item, "done") || bool(item, "isCompleted");

        if ((title == null || title.isEmpty()) && (description == null || description.isEmpty())) {
            return null;
        }
        String resolvedTitle = (title != null && !title.isEmpty() ? title : description);
        resolvedTitle = resolvedTitle != null ? resolvedTitle.trim() : "";
        if (resolvedTitle.isEmpty()) {
            return null;
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", looksLikeOpaqueId(id) ? (!linkedTaskId.isEmpty() ? linkedTaskId : id) : id);
        m.put("linkedTaskId", linkedTaskId.isEmpty() ? null : linkedTaskId);
        m.put("title", resolvedTitle);
        m.put("name", resolvedTitle);
        m.put("description", description == null || description.isEmpty() ? null : description);
        m.put("completed", completed);
        return m;
    }

    // ——— комментарии и история (используются роут-эндпоинтами) ———

    public List<Map<String, Object>> extractComments(JsonNode task) {
        List<JsonNode> sources = collectNestedValuesByKey(task,
                (key, value) -> COMMENTS_KEY.matcher(key).find()
                        && value != null && (value.isArray() || value.isObject()), 4);
        List<Map<String, Object>> out = new ArrayList<>();
        int[] index = {0};
        for (JsonNode source : sources) {
            for (JsonNode item : source.isArray() ? source : List.of(source)) {
                if (!item.isObject()) {
                    continue;
                }
                String content = pickReadableText(strings(item,
                        "content", "text", "message", "body", "comment", "description", "note"), true);
                if (content == null) {
                    continue;
                }
                String createdAt = firstNonNullTimestamp(item,
                        "createdAt", "updatedAt", "date", "timestamp", "time", "sentAt");
                if (createdAt == null) {
                    createdAt = Instant.now().toString();
                }
                Map<String, String> actor = extractActor(item);
                String id = str(firstNonNull(item, "id", "commentId", "messageId")).trim();
                if (id.isEmpty()) {
                    id = "yg-comment-" + index[0]++;
                }
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("id", id);
                m.put("content", content);
                m.put("createdAt", createdAt);
                m.put("externalUserId", actor.get("externalUserId"));
                m.put("authorName", actor.get("authorName"));
                out.add(m);
            }
        }
        // dedup по (id, content), сортировка по createdAt ASC
        List<Map<String, Object>> deduped = dedupBy(out, m -> str(m.get("id")) + " " + str(m.get("content")));
        deduped.sort((a, b) -> str(a.get("createdAt")).compareTo(str(b.get("createdAt"))));
        return deduped;
    }

    public List<Map<String, Object>> extractHistory(JsonNode task) {
        List<JsonNode> sources = collectNestedValuesByKey(task,
                (key, value) -> HISTORY_KEY.matcher(key).find()
                        && value != null && (value.isArray() || value.isObject()), 4);
        List<Map<String, Object>> out = new ArrayList<>();
        int[] index = {0};
        for (JsonNode source : sources) {
            for (JsonNode item : source.isArray() ? source : List.of(source)) {
                if (!item.isObject()) {
                    continue;
                }
                String createdAt = firstNonNullTimestamp(item, "createdAt", "updatedAt", "date", "timestamp", "time");
                if (createdAt == null) {
                    createdAt = Instant.now().toString();
                }
                String action = pickReadableText(strings(item, "action", "type", "kind", "event", "status"), true);
                if (action == null) {
                    action = "updated";
                }
                String summary = pickReadableText(strings(item,
                        "summary", "message", "text", "description", "note", "comment"), true);
                Map<String, String> actor = extractActor(item);
                String id = str(firstNonNull(item, "id", "historyId", "eventId")).trim();
                if (id.isEmpty()) {
                    id = "yg-history-" + index[0]++;
                }
                boolean hasOldNew = item.has("oldValue") || item.has("before")
                        || item.has("newValue") || item.has("after") || item.has("payload");
                if (summary == null && !hasOldNew && action == null) {
                    continue;
                }
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("id", id);
                m.put("action", action);
                m.put("createdAt", createdAt);
                m.put("externalUserId", actor.get("externalUserId"));
                m.put("actorName", actor.get("authorName"));
                m.put("oldValue", toPlain(firstNonNull(item, "oldValue", "before")));
                m.put("newValue", toPlain(firstNonNull(item, "newValue", "after", "payload")));
                m.put("summary", summary);
                out.add(m);
            }
        }
        List<Map<String, Object>> deduped = dedupBy(out, m -> str(m.get("id")) + " " + str(m.get("createdAt")));
        deduped.sort((a, b) -> str(b.get("createdAt")).compareTo(str(a.get("createdAt"))));
        return deduped;
    }

    // ——— helpers ———

    private List<Map<String, Object>> dedupBy(List<Map<String, Object>> list, Function<Map<String, Object>, String> keyFn) {
        List<Map<String, Object>> out = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (Map<String, Object> m : list) {
            if (seen.add(keyFn.apply(m))) {
                out.add(m);
            }
        }
        return out;
    }

    private Object toPlain(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        try {
            return objectMapper.treeToValue(node, Object.class);
        } catch (Exception e) {
            return node.asText();
        }
    }

    private String firstNonNullTimestamp(JsonNode item, String... keys) {
        for (String key : keys) {
            JsonNode v = item.get(key);
            if (v != null && !v.isNull()) {
                String ts = normalizeTimestamp(v);
                if (ts != null) {
                    return ts;
                }
            }
        }
        return null;
    }

    private JsonNode firstNonNull(JsonNode node, String... keys) {
        for (String key : keys) {
            JsonNode v = node.get(key);
            if (v != null && !v.isNull()) {
                return v;
            }
        }
        return null;
    }

    private Object firstNonNullObj(Map<String, Object> map, String... keys) {
        for (String key : keys) {
            Object v = map.get(key);
            if (v != null && !v.toString().isEmpty()) {
                return v;
            }
        }
        return null;
    }

    private List<String> strings(JsonNode node, String... keys) {
        List<String> out = new ArrayList<>();
        for (String key : keys) {
            out.add(text(node, key));
        }
        return out;
    }

    private String text(JsonNode node, String key) {
        JsonNode v = node.get(key);
        return v != null && !v.isNull() ? v.asText() : null;
    }

    private String textAny(JsonNode node, String... keys) {
        for (String key : keys) {
            String v = text(node, key);
            if (v != null && !v.isEmpty()) {
                return v;
            }
        }
        return null;
    }

    private String nestedText(JsonNode node, String parent, String child) {
        JsonNode p = node.get(parent);
        return p != null && p.isObject() ? text(p, child) : null;
    }

    private boolean bool(JsonNode node, String key) {
        JsonNode v = node.get(key);
        return v != null && v.asBoolean(false);
    }

    private void addNode(List<JsonNode> out, JsonNode value) {
        if (value != null && !value.isNull() && !(value.isTextual() && value.asText().isEmpty())) {
            out.add(value);
        }
    }

    private String str(Object o) {
        return o == null ? "" : o.toString();
    }

    private boolean isBlank(Object o) {
        return o == null || o.toString().isEmpty();
    }
}
