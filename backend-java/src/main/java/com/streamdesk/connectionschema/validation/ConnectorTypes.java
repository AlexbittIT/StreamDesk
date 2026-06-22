package com.streamdesk.connectionschema.validation;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Справочник типов разъёмов: категория + цвет (значения согласованы с
 * frontend/src/components/connection-schemas/signal-colors.ts). Используется для
 * эндпоинта /connector-types, легенды на фронте и проверки совместимости типов.
 */
public final class ConnectorTypes {

    public record ConnectorType(String id, String label, String category, String color) {
    }

    private static final Map<String, ConnectorType> REGISTRY = new LinkedHashMap<>();

    private static void reg(String id, String category, String color) {
        REGISTRY.put(id, new ConnectorType(id, id, category, color));
    }

    static {
        // video
        reg("HDMI", "video", "#f59e0b");
        reg("SDI", "video", "#8b5cf6");
        reg("DVI", "video", "#f59e0b");
        reg("VGA", "video", "#f59e0b");
        reg("DISPLAYPORT", "video", "#f59e0b");
        reg("NDI", "video", "#3b82f6");
        reg("BNC", "video", "#a855f7");
        // audio
        reg("XLR", "audio", "#22c55e");
        reg("TRS", "audio", "#10b981");
        reg("JACK", "audio", "#10b981");
        reg("RCA", "audio", "#ef4444");
        reg("AES", "audio", "#14b8a6");
        reg("MADI", "audio", "#f97316");
        // network
        reg("LAN", "network", "#eab308");
        // data
        reg("USB", "data", "#06b6d4");
        reg("USB-C", "data", "#0ea5e9");
        // power
        reg("DC", "power", "#94a3b8");
        reg("AC", "power", "#64748b");
        // other
        reg("WIRELESS", "other", "#ec4899");
    }

    /** Синонимы разъёмов, приводимые к каноническому имени. */
    private static final Map<String, String> ALIASES = Map.ofEntries(
            Map.entry("ETH", "LAN"),
            Map.entry("RJ45", "LAN"),
            Map.entry("ETHERNET", "LAN"),
            Map.entry("USBC", "USB-C"),
            Map.entry("DP", "DISPLAYPORT"),
            Map.entry("DISPLAY PORT", "DISPLAYPORT")
    );

    private ConnectorTypes() {
    }

    /** Нормализует имя разъёма: верхний регистр + раскрытие синонимов. */
    public static String normalize(String portType) {
        if (portType == null) {
            return "";
        }
        String s = portType.trim().toUpperCase(Locale.ROOT);
        return ALIASES.getOrDefault(s, s);
    }

    public static List<ConnectorType> all() {
        return new ArrayList<>(REGISTRY.values());
    }

    public static String categoryOf(String portType) {
        ConnectorType t = REGISTRY.get(normalize(portType));
        return t != null ? t.category() : "other";
    }

    /**
     * Совместимость разъёмов: одинаковый нормализованный тип (с учётом синонимов
     * вроде LAN/ETH/RJ45). Если тип у одного из портов не указан — не блокируем,
     * т.к. определить несовместимость невозможно.
     */
    public static boolean compatible(String a, String b) {
        String na = normalize(a);
        String nb = normalize(b);
        if (na.isEmpty() || nb.isEmpty()) {
            return true;
        }
        return na.equals(nb);
    }
}
