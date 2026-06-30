package com.streamdesk.estimate;

import com.fasterxml.jackson.databind.JsonNode;
import com.streamdesk.ai.DeepSeekClient;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * ИИ-подбор позиций сметы (SD-157) — по образцу {@code AiSchemaService}, через
 * {@link DeepSeekClient#generateJson} (переиспользует ретраи и строгий JSON).
 *
 * Ключевые свойства:
 * <ul>
 *   <li>тип мероприятия (вечеринка/конференция/съёмка) — отдельный явный вход в
 *       промпт, чтобы на разных ТЗ сметы реально различались;</li>
 *   <li>реальный склад грундится в промпт (предфильтр по типам из ТЗ через
 *       {@link EstimateMatchingService#filterForPrompt});</li>
 *   <li>при сбое ИИ {@link DeepSeekClient} кидает {@link com.streamdesk.config.ApiException} —
 *       без молчаливого фолбэка. Решение «глушить или пробрасывать» по requireAi
 *       принимает {@code EstimateService}.</li>
 * </ul>
 */
@Service
public class EstimateAiService {

    private static final int MAX_CATALOG_FOR_PROMPT = 120;
    private static final int MAX_ITEMS = 50;
    private static final int MAX_TEXT_CHARS = 14000;

    private static final String SYSTEM_PROMPT = """
            Ты старший технический продюсер и инженер смет по мероприятиям в России.
            Пойми ТЗ и собери полный комплект для успешного проведения: звук, видео,
            камеры, экраны, свет, сеть, питание, коммутация, запас/переходники,
            персонал и логистика. ВАЖНО: по возможности выбирай позиции из
            предоставленного склада, пиши их названия максимально близко к складским,
            чтобы система сопоставила позиции автоматически. Учитывай тип мероприятия —
            набор для вечеринки, конференции и съёмки должен заметно различаться. Цены
            ставь реалистичные для дневной аренды/субподряда в RUB. Верни ТОЛЬКО
            валидный JSON-объект (json), без markdown и пояснений, строго по схеме:
            {"items":[{"name":"string","type":"audio|microphone|camera|video|computer|display|lighting|network|power|cable|labor|transport|effects|accessory|other","model":"string","quantity":1,"unitPrice":0,"reason":"зачем позиция нужна","confidence":0.8}]}
            """;

    private final DeepSeekClient deepSeek;
    private final EstimateMatchingService matchingService;

    public EstimateAiService(DeepSeekClient deepSeek, EstimateMatchingService matchingService) {
        this.deepSeek = deepSeek;
        this.matchingService = matchingService;
    }

    public boolean isConfigured() {
        return deepSeek.isConfigured();
    }

    /**
     * Запрашивает у ИИ список позиций под ТЗ. Все позиции помечаются source="ai".
     * При сбое/исчерпании ретраев пробрасывает ApiException (без фолбэка).
     */
    public List<RequirementItem> suggest(String title, String text, String eventType, List<CatalogEntry> catalog) {
        String userPrompt = buildUserPrompt(title, text, eventType, catalog);
        JsonNode root = deepSeek.generateJson(SYSTEM_PROMPT, userPrompt);
        return parseItems(root);
    }

    private String buildUserPrompt(String title, String text, String eventType, List<CatalogEntry> catalog) {
        String safeText = text == null ? "" : text;
        if (safeText.length() > MAX_TEXT_CHARS) {
            safeText = safeText.substring(0, MAX_TEXT_CHARS);
        }
        // Грундинг: предфильтр каталога по типам, упомянутым в ТЗ.
        Set<String> wantedTypes = matchingService.inferWantedTypes(safeText);
        List<CatalogEntry> grounded = matchingService.filterForPrompt(catalog, wantedTypes, MAX_CATALOG_FOR_PROMPT);

        StringBuilder sb = new StringBuilder();
        sb.append("Тип мероприятия: ").append(eventLabel(eventType)).append("\n");
        sb.append(eventGuidance(eventType)).append("\n\n");
        sb.append("Название: ").append(title == null ? "" : title.trim()).append("\n");
        sb.append("ТЗ:\n").append(safeText.trim()).append("\n\n");
        sb.append("Доступный склад (выбирай отсюда в первую очередь):\n");
        if (grounded.isEmpty()) {
            sb.append("(склад пуст — предлагай позиции под аренду/субподряд)\n");
        } else {
            for (CatalogEntry entry : grounded) {
                sb.append(warehouseHint(entry)).append("\n");
            }
        }
        sb.append("\nВерни строгий JSON по схеме из системного сообщения.");
        return sb.toString();
    }

    private static String warehouseHint(CatalogEntry entry) {
        StringBuilder sb = new StringBuilder();
        sb.append(entry.getName());
        if (entry.getModel() != null && !entry.getModel().isBlank()) {
            sb.append(" ").append(entry.getModel());
        }
        sb.append(" (").append(entry.getType()).append("; на складе ").append(entry.getAvailableQty());
        if (entry.getUnitPrice() > 0) {
            sb.append("; ").append(trimNumber(entry.getUnitPrice())).append(" RUB");
        }
        sb.append(")");
        return sb.toString();
    }

    /**
     * Явный, различающийся блок указаний под тип мероприятия — чтобы вечеринка,
     * конференция и съёмка давали разный комплект, а не одну усреднённую смету.
     */
    private static String eventGuidance(String eventType) {
        String n = EstimateText.normalize(eventType);
        if (containsAny(n, "вечеринк", "party", "корпоратив", "праздник", "диджей", "dj")) {
            return "Это вечеринка/праздник: упор на мощный звук и сабвуферы, динамичный "
                    + "интеллектуальный свет, спецэффекты (дым/хейзер), DJ-оборудование и атмосферу.";
        }
        if (containsAny(n, "конференц", "conference", "форум", "семинар", "доклад", "презентац", "пленар")) {
            return "Это конференция/форум: упор на разборчивую речь (радиосистемы спикеров и "
                    + "петлички), экраны/проекцию презентаций, запись и трансляцию докладов, "
                    + "ровный заливочный свет без шоу-эффектов.";
        }
        if (containsAny(n, "съемк", "съёмк", "shoot", "film", "видеосъем", "продакшн", "клип")) {
            return "Это съёмка/продакшн: упор на камеры и оптику, кинопостановочный свет, "
                    + "запись чистого звука (петлички/пушки, рекордеры) и мониторинг кадра.";
        }
        return "Тип мероприятия явно не указан — собери универсальный комплект, опираясь на текст ТЗ.";
    }

    private static String eventLabel(String eventType) {
        return eventType == null || eventType.isBlank() ? "не указан" : eventType.trim();
    }

    private List<RequirementItem> parseItems(JsonNode root) {
        List<RequirementItem> out = new ArrayList<>();
        JsonNode items = root == null ? null : root.path("items");
        if (items == null || !items.isArray()) {
            return out;
        }
        for (JsonNode it : items) {
            if (out.size() >= MAX_ITEMS) {
                break;
            }
            String name = textValue(it, "name");
            if (name.isBlank()) {
                continue;
            }
            String type = blankToOther(textValue(it, "type"));
            String model = textValue(it, "model");
            int quantity = Math.max(1, (int) Math.round(it.path("quantity").asDouble(1)));
            String reason = textValue(it, "reason");
            if (reason.isBlank()) {
                reason = "Предложено ИИ по ТЗ.";
            } else if (reason.length() > 240) {
                reason = reason.substring(0, 240);
            }
            Double unitPrice = numberOrNull(it, "unitPrice");
            Double confidence = numberOrNull(it, "confidence");
            List<String> keywords = EstimateText.tokens(name + " " + model);
            out.add(new RequirementItem(name.trim(), type, model.trim(), quantity, reason,
                    unitPrice, confidence, keywords, "ai"));
        }
        return out;
    }

    private static Double numberOrNull(JsonNode node, String field) {
        JsonNode v = node.path(field);
        if (v.isNumber()) {
            return v.asDouble();
        }
        if (v.isTextual()) {
            double parsed = EstimateText.parseMoney(v.asText());
            return parsed > 0 ? parsed : null;
        }
        return null;
    }

    private static String textValue(JsonNode node, String field) {
        JsonNode v = node.path(field);
        return v.isMissingNode() || v.isNull() ? "" : v.asText("");
    }

    private static String blankToOther(String type) {
        return type == null || type.isBlank() ? "other" : type;
    }

    private static boolean containsAny(String haystack, String... needles) {
        for (String needle : needles) {
            if (haystack.contains(needle)) {
                return true;
            }
        }
        return false;
    }

    private static String trimNumber(double value) {
        if (value == Math.rint(value) && !Double.isInfinite(value)) {
            return Long.toString((long) value);
        }
        return Double.toString(value);
    }
}
