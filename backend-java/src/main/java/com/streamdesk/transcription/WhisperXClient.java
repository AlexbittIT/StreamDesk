package com.streamdesk.transcription;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.streamdesk.transcription.dto.TranscribeOptions;
import com.streamdesk.transcription.dto.TranscriptionResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Клиент удалённого Whisper X API — порт backend/services/whisper-x-client.ts.
 * Транскрибирует аудио/видео через multipart-загрузку на {WHISPER_X_API_URL}/transcribe.
 * Без WHISPER_X_API_URL {@link #isConfigured()} == false (как в Node — сервис не падает).
 */
@Component
public class WhisperXClient {

    private static final Logger log = LoggerFactory.getLogger(WhisperXClient.class);

    private static final Map<String, String> MIME_TYPES = Map.ofEntries(
            Map.entry("mp3", "audio/mpeg"),
            Map.entry("wav", "audio/wav"),
            Map.entry("m4a", "audio/mp4"),
            Map.entry("flac", "audio/flac"),
            Map.entry("ogg", "audio/ogg"),
            Map.entry("mp4", "video/mp4"),
            Map.entry("avi", "video/x-msvideo"),
            Map.entry("mov", "video/quicktime"),
            Map.entry("mkv", "video/x-matroska"),
            Map.entry("webm", "video/webm")
    );

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();
    private final String apiUrl;
    private final String apiKey;
    private final long timeoutMs;

    public WhisperXClient(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        String url = System.getenv("WHISPER_X_API_URL");
        this.apiUrl = url != null ? url.trim() : "";
        this.apiKey = System.getenv("WHISPER_X_API_KEY");
        long t = 300_000L; // 5 минут по умолчанию
        String rawTimeout = System.getenv("WHISPER_X_TIMEOUT");
        if (rawTimeout != null && !rawTimeout.isBlank()) {
            try {
                t = Long.parseLong(rawTimeout.trim());
            } catch (NumberFormatException ignored) {
                // некорректное значение — оставляем дефолт
            }
        }
        this.timeoutMs = t;
    }

    /** Настроен ли API (задан ли WHISPER_X_API_URL). */
    public boolean isConfigured() {
        return !apiUrl.isBlank();
    }

    /** Проверяет доступность API (GET {apiUrl}/health). */
    public boolean healthCheck() {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(apiUrl + "/health"))
                    .timeout(Duration.ofSeconds(5))
                    .GET()
                    .build();
            HttpResponse<Void> response = httpClient.send(request, HttpResponse.BodyHandlers.discarding());
            return response.statusCode() / 100 == 2;
        } catch (Exception e) {
            log.warn("[WhisperXClient] Health check failed: {}", e.getMessage());
            return false;
        }
    }

    /**
     * Транскрибирует аудио/видео файл через удалённый Whisper X API.
     * Бросает RuntimeException при ошибке (как throw new Error в Node).
     */
    public TranscriptionResult transcribe(Path filePath, TranscribeOptions options) {
        if (!isConfigured()) {
            throw new IllegalStateException(
                    "Whisper X API не настроен. Установите переменную окружения WHISPER_X_API_URL.");
        }
        TranscribeOptions opts = options != null ? options
                : new TranscribeOptions(null, null, null, null, null);
        try {
            byte[] fileBytes = Files.readAllBytes(filePath);
            String fileName = filePath.getFileName() != null ? filePath.getFileName().toString() : "audio.mp3";

            String boundary = "----StreamDeskBoundary" + UUID.randomUUID().toString().replace("-", "");
            byte[] body = buildMultipart(boundary, fileName, fileBytes, opts);

            HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(apiUrl + "/transcribe"))
                    .timeout(Duration.ofMillis(timeoutMs))
                    .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                    .POST(HttpRequest.BodyPublishers.ofByteArray(body));
            if (apiKey != null && !apiKey.isBlank()) {
                builder.header("Authorization", "Bearer " + apiKey);
            }

            HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                throw new RuntimeException("Whisper X API error: " + response.statusCode() + " - " + response.body());
            }

            return parseResponse(objectMapper.readTree(response.body()), opts);
        } catch (Exception e) {
            log.error("[WhisperXClient] Transcription error", e);
            throw new RuntimeException("Failed to transcribe with Whisper X: " + e.getMessage(), e);
        }
    }

    // --- helpers ---

    private byte[] buildMultipart(String boundary, String fileName, byte[] fileBytes, TranscribeOptions opts)
            throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        String dashBoundary = "--" + boundary + "\r\n";

        if (opts.language() != null) {
            writeField(out, dashBoundary, "language", opts.language());
        }
        if (opts.task() != null) {
            writeField(out, dashBoundary, "task", opts.task());
        }
        if (opts.returnTimestamps() != null) {
            writeField(out, dashBoundary, "return_timestamps", opts.returnTimestamps().toString());
        }
        if (opts.diarize() != null) {
            writeField(out, dashBoundary, "diarize", opts.diarize().toString());
        }
        if (opts.numSpeakers() != null && opts.numSpeakers() > 0) {
            writeField(out, dashBoundary, "num_speakers", opts.numSpeakers().toString());
        }

        // файловая часть
        out.write(dashBoundary.getBytes(StandardCharsets.UTF_8));
        out.write(("Content-Disposition: form-data; name=\"file\"; filename=\"" + fileName + "\"\r\n")
                .getBytes(StandardCharsets.UTF_8));
        out.write(("Content-Type: " + getContentType(fileName) + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        out.write(fileBytes);
        out.write("\r\n".getBytes(StandardCharsets.UTF_8));

        out.write(("--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
        return out.toByteArray();
    }

    private void writeField(ByteArrayOutputStream out, String dashBoundary, String name, String value)
            throws IOException {
        out.write(dashBoundary.getBytes(StandardCharsets.UTF_8));
        out.write(("Content-Disposition: form-data; name=\"" + name + "\"\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        out.write(value.getBytes(StandardCharsets.UTF_8));
        out.write("\r\n".getBytes(StandardCharsets.UTF_8));
    }

    private TranscriptionResult parseResponse(JsonNode data, TranscribeOptions opts) {
        TranscriptionResult result = new TranscriptionResult();
        result.setText(data.path("text").asText(""));
        result.setLanguage(textOrNull(data, "language"));

        JsonNode speakersNode = data.get("speakers");
        if (speakersNode != null && speakersNode.isArray()) {
            List<String> speakers = new ArrayList<>();
            speakersNode.forEach(s -> speakers.add(s.asText()));
            result.setSpeakers(speakers);
        }

        JsonNode segmentsNode = data.get("segments");
        if (segmentsNode != null && segmentsNode.isArray() && !segmentsNode.isEmpty()) {
            List<TranscriptionResult.Segment> segments = new ArrayList<>();
            Set<String> uniqueSpeakers = new LinkedHashSet<>();
            for (JsonNode seg : segmentsNode) {
                TranscriptionResult.Segment s = new TranscriptionResult.Segment();
                s.setStart(seg.path("start").asDouble(0));
                s.setEnd(seg.path("end").asDouble(0));
                s.setText(seg.path("text").asText(""));
                String speaker = textOrNull(seg, "speaker");
                s.setSpeaker(speaker);
                if (speaker != null) {
                    s.setSpeakerLabel(speakerLabel(speaker));
                    uniqueSpeakers.add(speaker);
                }
                segments.add(s);
            }
            result.setSegments(segments);

            // Если text пустой — собираем из сегментов (с лейблами спикеров при диаризации).
            if (result.getText() == null || result.getText().isEmpty()) {
                boolean diarize = Boolean.TRUE.equals(opts.diarize());
                boolean anySpeaker = segments.stream().anyMatch(s -> s.getSpeaker() != null);
                StringBuilder sb = new StringBuilder();
                for (TranscriptionResult.Segment s : segments) {
                    if (sb.length() > 0) {
                        sb.append(" ");
                    }
                    if (diarize && anySpeaker && s.getSpeaker() != null) {
                        sb.append("[").append(speakerLabel(s.getSpeaker())).append("]: ").append(s.getText());
                    } else {
                        sb.append(s.getText());
                    }
                }
                result.setText(sb.toString());
            }

            result.setSpeakerCount(uniqueSpeakers.size());
        }

        return result;
    }

    /** "SPEAKER_00" -> "Спикер 1" (как в whisper-x-client.ts). */
    private String speakerLabel(String speaker) {
        int index = 0;
        try {
            index = Integer.parseInt(speaker.replace("SPEAKER_", ""));
        } catch (NumberFormatException ignored) {
            // не число — считаем индекс 0
        }
        return "Спикер " + (index + 1);
    }

    private String getContentType(String fileName) {
        String lower = fileName.toLowerCase(Locale.ROOT);
        int dot = lower.lastIndexOf('.');
        String ext = dot >= 0 ? lower.substring(dot + 1) : "";
        return MIME_TYPES.getOrDefault(ext, "application/octet-stream");
    }

    private static String textOrNull(JsonNode node, String field) {
        JsonNode v = node.get(field);
        return v != null && !v.isNull() ? v.asText() : null;
    }
}
