package com.streamdesk.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.streamdesk.config.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Клиент DeepSeek (OpenAI-совместимый API). Запрашивает строгий JSON и делает
 * ретраи при сбое/невалидном ответе. Никакого молчаливого фолбэка: если ключ не
 * задан или AI не ответил после ретраев — кидаем явную ошибку.
 */
@Component
public class DeepSeekClient {

    private static final Logger log = LoggerFactory.getLogger(DeepSeekClient.class);

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    private final String apiKey;
    private final String baseUrl;
    private final String model;
    private final int maxAttempts;

    public DeepSeekClient(ObjectMapper objectMapper,
                          @Value("${app.ai.deepseek.api-key:}") String apiKey,
                          @Value("${app.ai.deepseek.base-url:https://api.deepseek.com}") String baseUrl,
                          @Value("${app.ai.deepseek.model:deepseek-chat}") String model,
                          @Value("${app.ai.deepseek.max-attempts:3}") int maxAttempts) {
        this.objectMapper = objectMapper;
        this.apiKey = apiKey;
        this.baseUrl = baseUrl == null ? "https://api.deepseek.com" : baseUrl.replaceAll("/+$", "");
        this.model = model;
        this.maxAttempts = Math.max(1, maxAttempts);
    }

    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }

    /** Имя модели — для записи provenance (source_model). */
    public String modelName() {
        return model;
    }

    /**
     * Запрашивает у DeepSeek строгий JSON-объект. Ретраит сбои сети, не-2xx и
     * невалидный JSON. При исчерпании попыток или отсутствии ключа — ApiException.
     */
    public JsonNode generateJson(String systemPrompt, String userPrompt) {
        if (!isConfigured()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "AI недоступен: не задан DEEPSEEK_API_KEY");
        }
        ApiException last = null;
        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                String content = callOnce(systemPrompt, userPrompt);
                JsonNode json = parseJson(content);
                if (json != null && json.isObject()) {
                    return json;
                }
                last = new ApiException(HttpStatus.BAD_GATEWAY, "AI вернул не-JSON ответ");
            } catch (ApiException e) {
                last = e;
            } catch (Exception e) {
                last = new ApiException(HttpStatus.BAD_GATEWAY, "Ошибка обращения к AI: " + e.getMessage());
            }
            log.warn("DeepSeek попытка {}/{} не удалась: {}", attempt, maxAttempts, last.getMessage());
            if (attempt < maxAttempts) {
                sleepBackoff(attempt);
            }
        }
        throw last != null ? last : new ApiException(HttpStatus.BAD_GATEWAY, "AI не ответил");
    }

    private String callOnce(String systemPrompt, String userPrompt) throws Exception {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("model", model);
        payload.put("messages", List.of(
                Map.of("role", "system", "content", systemPrompt),
                Map.of("role", "user", "content", userPrompt)));
        payload.put("temperature", 0.2);
        payload.put("stream", false);
        payload.put("response_format", Map.of("type", "json_object"));

        HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + "/chat/completions"))
                .timeout(Duration.ofSeconds(60))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() / 100 != 2) {
            throw new ApiException(HttpStatus.BAD_GATEWAY,
                    "DeepSeek вернул статус " + response.statusCode());
        }
        JsonNode root = objectMapper.readTree(response.body());
        JsonNode content = root.path("choices").path(0).path("message").path("content");
        if (content.isMissingNode() || content.asText().isBlank()) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "Пустой ответ AI");
        }
        return content.asText();
    }

    private JsonNode parseJson(String content) {
        try {
            String trimmed = content.trim();
            // на случай обёрток ```json ... ``` — берём всё между первой { и последней }
            int start = trimmed.indexOf('{');
            int end = trimmed.lastIndexOf('}');
            if (start >= 0 && end > start) {
                trimmed = trimmed.substring(start, end + 1);
            }
            return objectMapper.readTree(trimmed);
        } catch (Exception e) {
            return null;
        }
    }

    private void sleepBackoff(int attempt) {
        try {
            Thread.sleep(Math.min(2000L, 300L * attempt));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
