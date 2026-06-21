package com.streamdesk.vmix;

import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Клиент vMix — HTTP-вызовы к vMix Web API и парсинг XML-состояния.
 * Перенос вызовов connect/status/timecode/command из backend/routes.ts.
 * vMix общается по HTTP (по умолчанию порт 8088). При недоступности возвращаем connected:false.
 */
@Component
public class VmixClient {

    private static final Pattern PREVIEW = Pattern.compile("preview=\"(\\d+)\"");
    private static final Pattern PROGRAM = Pattern.compile("active=\"(\\d+)\"");
    private static final Pattern RECORDING = Pattern.compile("recording=\"(True|False)\"");
    private static final Pattern STREAMING = Pattern.compile("streaming=\"(True|False)\"");
    private static final Pattern INPUT = Pattern.compile("<input key=\"([^\"]+)\" number=\"(\\d+)\" title=\"([^\"]+)\"");
    private static final Pattern TIMECODE_TAG = Pattern.compile("<timecode[^>]*>([^<]+)</timecode>", Pattern.CASE_INSENSITIVE);
    private static final Pattern TIMECODE_REC = Pattern.compile("recordingTimecode=\"([^\"]+)\"");
    private static final Pattern TIMECODE_ATTR = Pattern.compile("timecode=\"([^\"]+)\"");

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .build();

    /** POST /api/vmix/connect — проверка подключения через Function=GetVersion. */
    public Map<String, Object> connect(String host, String port) {
        String url = base(host, port) + "?Function=GetVersion";
        try {
            HttpResponse<String> resp = get(url, 3);
            if (!ok(resp)) {
                throw new RuntimeException("Failed to connect to vMix");
            }
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("connected", true);
            result.put("host", host);
            result.put("port", port);
            result.put("version", resp.body());
            return result;
        } catch (Exception e) {
            return failure("connected", e.getMessage() != null ? e.getMessage() : "Failed to connect to vMix");
        }
    }

    /** GET /api/vmix/status — версия + XML-состояние (входы, preview/program, запись/стрим). */
    public Map<String, Object> status(String host, String port) {
        String base = base(host, port);
        HttpResponse<String> version;
        HttpResponse<String> xml;
        try {
            version = get(base + "?Function=GetVersion", 2);
            xml = get(base, 2);
        } catch (Exception e) {
            return notConnected("vMix недоступен. Проверьте, что vMix запущен и доступен по указанному адресу.");
        }
        if (!ok(version) || !ok(xml)) {
            return notConnected("vMix не отвечает");
        }

        String xmlText = xml.body();
        List<Map<String, Object>> inputs = new ArrayList<>();
        Matcher m = INPUT.matcher(xmlText);
        while (m.find() && inputs.size() < 20) {
            Map<String, Object> input = new LinkedHashMap<>();
            input.put("number", Integer.parseInt(m.group(2)));
            input.put("title", m.group(3));
            input.put("state", m.group(1));
            inputs.add(input);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("connected", true);
        result.put("host", host);
        result.put("port", parseIntOr(port, 0));
        result.put("inputs", inputs);
        result.put("preview", firstInt(PREVIEW, xmlText, 0));
        result.put("program", firstInt(PROGRAM, xmlText, 0));
        result.put("recording", "True".equals(firstGroup(RECORDING, xmlText)));
        result.put("streaming", "True".equals(firstGroup(STREAMING, xmlText)));
        return result;
    }

    /** GET /api/vmix/timecode — таймкод из XML-состояния. */
    public Map<String, Object> timecode(String host, String port) {
        try {
            HttpResponse<String> xml = get(base(host, port), 3);
            if (!ok(xml)) {
                return timecodeResult(null, "vMix не отвечает");
            }
            String xmlText = xml.body();
            String tc = firstGroup(TIMECODE_TAG, xmlText);
            if (tc == null) {
                tc = firstGroup(TIMECODE_REC, xmlText);
            }
            if (tc == null) {
                tc = firstGroup(TIMECODE_ATTR, xmlText);
            }
            return timecodeResult(tc != null ? tc.trim() : null, null);
        } catch (Exception e) {
            return timecodeResult(null, e.getMessage() != null ? e.getMessage() : "vMix недоступен");
        }
    }

    /** POST /api/vmix/command — выполнение команды vMix (Function=...&Input=...). */
    public Map<String, Object> command(String command, String host, String port, String input) {
        String url = base(host, port) + "?Function=" + command;
        if (input != null && !input.isBlank()) {
            url += "&Input=" + input;
        }
        try {
            HttpResponse<String> resp = get(url, 5);
            if (!ok(resp)) {
                throw new RuntimeException("Command failed: " + resp.statusCode());
            }
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("success", true);
            result.put("command", command);
            result.put("response", resp.body());
            return result;
        } catch (Exception e) {
            return failure("success", e.getMessage() != null ? e.getMessage() : "Failed to execute vMix command");
        }
    }

    // --- helpers ---

    private String base(String host, String port) {
        String h = (host == null || host.isBlank()) ? "localhost" : host;
        String p = (port == null || port.isBlank()) ? "8088" : port;
        return "http://" + h + ":" + p + "/api";
    }

    private HttpResponse<String> get(String url, int timeoutSec) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(timeoutSec))
                .GET()
                .build();
        return httpClient.send(request, HttpResponse.BodyHandlers.ofString());
    }

    private boolean ok(HttpResponse<String> resp) {
        return resp.statusCode() / 100 == 2;
    }

    private Map<String, Object> failure(String flag, String message) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put(flag, false);
        result.put("message", message);
        return result;
    }

    private Map<String, Object> notConnected(String message) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("connected", false);
        result.put("message", message);
        return result;
    }

    private Map<String, Object> timecodeResult(String timecode, String error) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("timecode", timecode);
        result.put("source", "vmix");
        if (error != null) {
            result.put("error", error);
        }
        return result;
    }

    private String firstGroup(Pattern pattern, String text) {
        Matcher m = pattern.matcher(text);
        return m.find() ? m.group(1) : null;
    }

    private int firstInt(Pattern pattern, String text, int fallback) {
        String g = firstGroup(pattern, text);
        return g != null ? parseIntOr(g, fallback) : fallback;
    }

    private int parseIntOr(String s, int fallback) {
        try {
            return Integer.parseInt(s.trim());
        } catch (Exception e) {
            return fallback;
        }
    }
}
