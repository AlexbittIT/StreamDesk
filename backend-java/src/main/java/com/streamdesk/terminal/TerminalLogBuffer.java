package com.streamdesk.terminal;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Кольцевой буфер последних строк лога сервера для вкладки «Терминал».
 * Перенос backend/terminal-log.ts. Маскирует пароли/токены/секреты.
 */
@Component
public class TerminalLogBuffer {

    private static final int MAX_LINES = 500;
    private static final Pattern SECRET =
            Pattern.compile("\\b(password|token|secret|key)=[^\\s&]+", Pattern.CASE_INSENSITIVE);

    private final List<String> lines = new ArrayList<>();

    public synchronized void add(String line) {
        String safe = SECRET.matcher(line).replaceAll("$1=***");
        lines.add(safe);
        while (lines.size() > MAX_LINES) {
            lines.remove(0);
        }
    }

    /** Последние N строк (если задан limit), иначе начиная с sinceIndex. */
    public synchronized Result getLogs(int sinceIndex, Integer limit) {
        int size = lines.size();
        int start;
        if (limit != null && limit > 0) {
            start = Math.max(0, size - limit);
        } else {
            start = Math.max(0, Math.min(sinceIndex, size));
        }
        return new Result(new ArrayList<>(lines.subList(start, size)), size);
    }

    public record Result(List<String> lines, int nextIndex) {
    }
}
