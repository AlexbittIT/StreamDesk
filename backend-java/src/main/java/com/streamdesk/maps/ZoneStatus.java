package com.streamdesk.maps;

import com.streamdesk.config.ApiException;

import java.util.Arrays;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

/**
 * Статус готовности зоны — конечный автомат из docs/maps-api.md §3.
 *
 * Шесть состояний; переход по умолчанию — «Не начато». Хранится в БД строкой ({@link #apiValue()}),
 * логика переходов инкапсулирована здесь. В {@code problem} можно перейти из ЛЮБОГО статуса
 * (флаг проблемы всегда разрешён), поэтому это правило вынесено отдельно от явной таблицы.
 */
public enum ZoneStatus {

    NOT_STARTED("not_started", "Не начато", "gray"),
    IN_PROGRESS("in_progress", "В работе", "yellow"),
    DONE("done", "Готово", "green"),
    NEEDS_REVIEW("needs_review", "Требует проверки", "blue"),
    PROBLEM("problem", "Проблема", "red"),
    VERIFIED("verified", "Проверено", "darkgreen");

    private final String apiValue;
    private final String label;
    private final String color;

    ZoneStatus(String apiValue, String label, String color) {
        this.apiValue = apiValue;
        this.label = label;
        this.color = color;
    }

    public String apiValue() {
        return apiValue;
    }

    public String label() {
        return label;
    }

    public String color() {
        return color;
    }

    /** Явная таблица допустимых переходов (без учёта всегда-разрешённого перехода в {@code problem}). */
    private static final Map<ZoneStatus, Set<ZoneStatus>> TRANSITIONS = new EnumMap<>(ZoneStatus.class);

    static {
        TRANSITIONS.put(NOT_STARTED, EnumSet.of(IN_PROGRESS));
        TRANSITIONS.put(IN_PROGRESS, EnumSet.of(DONE, NEEDS_REVIEW, PROBLEM));
        TRANSITIONS.put(DONE, EnumSet.of(NEEDS_REVIEW, VERIFIED, PROBLEM));
        TRANSITIONS.put(NEEDS_REVIEW, EnumSet.of(VERIFIED, IN_PROGRESS, PROBLEM));
        TRANSITIONS.put(VERIFIED, EnumSet.of(IN_PROGRESS, PROBLEM));
        TRANSITIONS.put(PROBLEM, EnumSet.of(IN_PROGRESS, DONE));
    }

    /**
     * Можно ли перейти из этого статуса в {@code target}.
     * Переход «в себя» недопустим (не создаёт бессмысленную запись истории);
     * переход в {@code PROBLEM} разрешён из любого статуса.
     */
    public boolean canTransitionTo(ZoneStatus target) {
        if (target == null || target == this) {
            return false;
        }
        if (target == PROBLEM) {
            return true;
        }
        return TRANSITIONS.getOrDefault(this, EnumSet.noneOf(ZoneStatus.class)).contains(target);
    }

    /** Разбор строкового значения API в enum; неизвестное значение → 400. */
    public static ZoneStatus fromApi(String value) {
        if (value == null || value.isBlank()) {
            throw ApiException.badRequest("Не указан статус зоны");
        }
        String normalized = value.trim().toLowerCase();
        return Arrays.stream(values())
                .filter(s -> s.apiValue.equals(normalized))
                .findFirst()
                .orElseThrow(() -> ApiException.badRequest("Неизвестный статус зоны: " + value));
    }

    /** Статус по умолчанию для новой зоны. */
    public static ZoneStatus defaultStatus() {
        return NOT_STARTED;
    }
}
