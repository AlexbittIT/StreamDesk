package com.streamdesk.connectionschema.validation;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Справочник типов разъёмов — ЕДИНЫЙ источник истины.
 *
 * Данные грузятся из classpath-ресурса {@code /connector_types.json} (зеркало
 * docs/connector_types.json: 42 типа, канон ETHERNET, со слоями/носителями/
 * синонимами). Используется эндпоинтом /connector-types, проверкой совместимости
 * типов ({@link ConnectionValidator}) и промптом AI-генерации ({@code AiSchemaService}).
 *
 * Раньше тут был отдельный захардкоженный список (≈18 типов, канон LAN), а в
 * промпте AI — третий список. Оба заменены этим справочником. Для обратной
 * совместимости со старыми кодами схем добавлены legacy-синонимы
 * (ETH/RJ45/LAN → ETHERNET, USB-C → USB_C, AES → AES_EBU и т.п.).
 *
 * Класс оставлен статическим фасадом, чтобы потребители ({@link ConnectionValidator},
 * ConnectionSchemaService, контроллер) не менялись.
 */
public final class ConnectorTypes {

    /** Запись легенды — контракт эндпоинта /connector-types (поля не менять). */
    public record ConnectorType(String id, String label, String category, String color) {
    }

    private static final String RESOURCE = "/connector_types.json";

    /** code -> запись справочника (порядок как в json). */
    private static final Map<String, ConnectorType> REGISTRY = new LinkedHashMap<>();
    /** UPPER(синоним | код) -> канонический code. */
    private static final Map<String, String> ALIASES = new LinkedHashMap<>();
    /** code -> синонимы (исходный регистр) — для промпта AI. */
    private static final Map<String, List<String>> ALIASES_BY_CODE = new LinkedHashMap<>();

    /** Группы взаимозаменяемых при валидации кодов (электрически идентичны). */
    private static final List<Set<String>> COMPAT_GROUPS = List.of(
            Set.of("ETHERNET", "ETHERCON")
    );

    /**
     * Протоколы, идущие поверх Ethernet (физически RJ45), и то, что именно они несут.
     * Разные домены смешивать нельзя: NDI (видео по IP) — это не Dante (звук по IP).
     */
    private static final Map<String, String> IP_PROTOCOL_DOMAIN = Map.of(
            "NDI", "video",
            "DANTE", "audio",
            "AES67", "audio",
            "ARTNET", "control",
            "SACN", "control"
    );

    private static final Set<String> ETHERNET_TRANSPORT = Set.of("ETHERNET", "ETHERCON");

    static {
        loadCatalog();
        registerLegacyAliases();
    }

    private ConnectorTypes() {
    }

    private static void loadCatalog() {
        try (InputStream in = ConnectorTypes.class.getResourceAsStream(RESOURCE)) {
            if (in == null) {
                throw new IllegalStateException("Не найден ресурс справочника " + RESOURCE);
            }
            JsonNode root = new ObjectMapper().readTree(in);
            for (JsonNode t : root.path("connector_types")) {
                String code = t.path("code").asText("").trim();
                if (code.isEmpty()) {
                    continue;
                }
                String name = t.path("name").asText(code);
                String category = t.path("category").asText("other");
                String color = t.path("color").asText("#60a5fa");
                REGISTRY.put(code, new ConnectorType(code, name, category, color));
                // сам код — валидный «синоним» (идемпотентность normalize)
                ALIASES.putIfAbsent(code.toUpperCase(Locale.ROOT), code);

                List<String> aliases = new ArrayList<>();
                for (JsonNode aliasNode : t.path("aliases")) {
                    String alias = aliasNode.asText("").trim();
                    if (alias.isEmpty()) {
                        continue;
                    }
                    aliases.add(alias);
                    ALIASES.putIfAbsent(alias.toUpperCase(Locale.ROOT), code);
                }
                ALIASES_BY_CODE.put(code, aliases);
            }
            if (REGISTRY.isEmpty()) {
                throw new IllegalStateException("Справочник разъёмов пуст");
            }
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("Не удалось загрузить справочник разъёмов: " + e.getMessage(), e);
        }
    }

    /** Мосты со старого словаря на коды справочника (для уже сохранённых схем). */
    private static void registerLegacyAliases() {
        // network
        ALIASES.putIfAbsent("ETH", "ETHERNET");
        // data
        ALIASES.putIfAbsent("USB-C", "USB_C");
        ALIASES.putIfAbsent("USBC", "USB_C");
        ALIASES.putIfAbsent("TYPE-C", "USB_C");
        // video
        ALIASES.putIfAbsent("DP", "DISPLAYPORT");
        ALIASES.putIfAbsent("DISPLAY PORT", "DISPLAYPORT");
        // audio
        ALIASES.putIfAbsent("AES", "AES_EBU");
    }

    /** Нормализует имя разъёма: верхний регистр + раскрытие синонимов в канонический code. */
    public static String normalize(String portType) {
        if (portType == null) {
            return "";
        }
        String s = portType.trim().toUpperCase(Locale.ROOT);
        if (s.isEmpty()) {
            return "";
        }
        return ALIASES.getOrDefault(s, s);
    }

    public static List<ConnectorType> all() {
        return new ArrayList<>(REGISTRY.values());
    }

    /** Известен ли тип справочнику (после нормализации синонимов). */
    public static boolean isKnown(String portType) {
        return REGISTRY.containsKey(normalize(portType));
    }

    public static String categoryOf(String portType) {
        ConnectorType t = REGISTRY.get(normalize(portType));
        return t != null ? t.category() : "other";
    }

    /**
     * Совместимость разъёмов.
     *
     * Раньше правило было «только полностью совпадающий код плюс ETHERNET/ETHERCON»,
     * из-за чего отклонялась любая конвертация — например HDMI → SDI, хотя это видео в видео
     * через штатный конвертер. Теперь переход допустим внутри одной категории, но не между
     * категориями: видео не превращается в аудио, а питание вообще не смешивается с сигналом.
     *
     * Если тип у одного из портов не указан — не блокируем, определить несовместимость нельзя.
     */
    public static boolean compatible(String a, String b) {
        String na = normalize(a);
        String nb = normalize(b);
        if (na.isEmpty() || nb.isEmpty()) {
            return true;
        }
        if (na.equals(nb)) {
            return true;
        }

        String catA = categoryOf(na);
        String catB = categoryOf(nb);

        // Питание изолировано в обе стороны.
        if ("power".equals(catA) || "power".equals(catB)) {
            return catA.equals(catB);
        }

        String ipA = IP_PROTOCOL_DOMAIN.get(na);
        String ipB = IP_PROTOCOL_DOMAIN.get(nb);
        if (ipA != null && ipB != null) {
            // Оба идут по одному кабелю, но несут разное — это подмена сигнала, а не конвертация.
            return ipA.equals(ipB);
        }
        if (ipA != null || ipB != null) {
            // IP-протокол включают в сеть: порт Dante идёт в коммутатор. В аналоговый разъём — нет.
            String other = ipA != null ? nb : na;
            return ETHERNET_TRANSPORT.contains(other);
        }

        for (Set<String> group : COMPAT_GROUPS) {
            if (group.contains(na) && group.contains(nb)) {
                return true;
            }
        }

        // Конвертация внутри категории: HDMI → SDI, XLR → Jack.
        return catA.equals(catB);
    }

    /**
     * Список кодов справочника с синонимами для промпта AI — модель обязана вернуть
     * код ИЗ этого списка (канон), сопоставляя свободные обозначения через синонимы.
     * Группируется по категориям для читаемости.
     */
    public static String promptVocabulary() {
        Map<String, List<String>> byCategory = new LinkedHashMap<>();
        for (ConnectorType t : REGISTRY.values()) {
            byCategory.computeIfAbsent(t.category(), k -> new ArrayList<>()).add(t.id());
        }
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, List<String>> entry : byCategory.entrySet()) {
            sb.append(entry.getKey()).append(": ");
            List<String> items = new ArrayList<>();
            for (String code : entry.getValue()) {
                List<String> aliases = ALIASES_BY_CODE.getOrDefault(code, List.of());
                if (aliases.isEmpty()) {
                    items.add(code);
                } else {
                    items.add(code + " (" + String.join(", ", aliases) + ")");
                }
            }
            sb.append(String.join("; ", items)).append("\n");
        }
        return sb.toString().trim();
    }
}
