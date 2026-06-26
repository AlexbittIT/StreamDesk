package com.streamdesk.telegram;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Клиент Telegram Bot API — перенос backend/services/telegram-bot.ts.
 * Отправляет коды авторизации и читает информацию о чате через api.telegram.org.
 * Токен берётся из TELEGRAM_BOT_TOKEN; без него {@link #isConfigured()} == false.
 */
@Component
public class TelegramBotClient {

    private static final Logger log = LoggerFactory.getLogger(TelegramBotClient.class);
    private static final String TELEGRAM_API_URL = "https://api.telegram.org/bot";

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();
    private final String botToken;
    private final String apiUrl;

    public TelegramBotClient(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        String token = System.getenv("TELEGRAM_BOT_TOKEN");
        this.botToken = token != null ? token : "";
        this.apiUrl = TELEGRAM_API_URL + this.botToken;
    }

    /** Настроен ли бот (есть ли токен). */
    public boolean isConfigured() {
        return !botToken.isBlank();
    }

    /** Отправляет сообщение пользователю через Telegram Bot API. */
    public boolean sendMessage(String chatId, String text, String parseMode) {
        if (!isConfigured()) {
            log.warn("[Telegram Bot] Bot token not configured");
            return false;
        }
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("chat_id", chatId);
            payload.put("text", text);
            if (parseMode != null) {
                payload.put("parse_mode", parseMode);
            }
            HttpRequest request = HttpRequest.newBuilder(URI.create(apiUrl + "/sendMessage"))
                    .timeout(Duration.ofSeconds(10))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                log.error("[Telegram Bot] Failed to send message: {}", response.body());
                return false;
            }
            return true;
        } catch (Exception e) {
            log.error("[Telegram Bot] Error sending message", e);
            return false;
        }
    }

    /** Получает информацию о чате по chat_id; null, если бот не настроен или чат не найден. */
    public Optional<TelegramUserInfo> getUserInfo(String chatId) {
        if (!isConfigured()) {
            return Optional.empty();
        }
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("chat_id", chatId);
            HttpRequest request = HttpRequest.newBuilder(URI.create(apiUrl + "/getChat"))
                    .timeout(Duration.ofSeconds(10))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                return Optional.empty();
            }
            JsonNode data = objectMapper.readTree(response.body());
            if (data.path("ok").asBoolean(false) && data.has("result")) {
                JsonNode result = data.get("result");
                return Optional.of(new TelegramUserInfo(
                        result.path("id").asText(null),
                        textOrNull(result, "first_name"),
                        textOrNull(result, "last_name"),
                        textOrNull(result, "username")
                ));
            }
            return Optional.empty();
        } catch (Exception e) {
            log.error("[Telegram Bot] Error getting user info", e);
            return Optional.empty();
        }
    }

    /** Генерирует 6-значный код авторизации. */
    public String generateAuthCode() {
        return String.valueOf(ThreadLocalRandom.current().nextInt(100000, 1000000));
    }

    private static String textOrNull(JsonNode node, String field) {
        JsonNode v = node.get(field);
        return v != null && !v.isNull() ? v.asText() : null;
    }

    /** Информация о Telegram-чате (подмножество ответа getChat). */
    public record TelegramUserInfo(String id, String firstName, String lastName, String username) {
    }
}
