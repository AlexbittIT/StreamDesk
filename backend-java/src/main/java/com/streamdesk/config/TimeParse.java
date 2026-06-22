package com.streamdesk.config;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.function.Function;

/**
 * Гибкий разбор времени из строки — как new Date() в Node:
 * эпоха в миллисекундах, ISO с Z/смещением или локальная дата-время.
 * Пустое значение -> null; нераспознанный формат -> IllegalArgumentException (сообщение выбирает вызывающий).
 */
public final class TimeParse {

    private TimeParse() {
    }

    public static Instant toInstant(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String s = value.trim();
        if (s.matches("\\d+")) {
            return Instant.ofEpochMilli(Long.parseLong(s));
        }
        for (Function<String, Instant> parser : List.<Function<String, Instant>>of(
                Instant::parse,
                v -> OffsetDateTime.parse(v).toInstant(),
                v -> LocalDateTime.parse(v).atZone(ZoneId.systemDefault()).toInstant())) {
            try {
                return parser.apply(s);
            } catch (DateTimeParseException ignored) {
                // пробуем следующий формат
            }
        }
        throw new IllegalArgumentException("Не удалось разобрать дату: " + value);
    }
}
