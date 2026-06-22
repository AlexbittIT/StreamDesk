package com.streamdesk.chat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.streamdesk.chat.dto.CompletionRequest;
import com.streamdesk.chat.dto.MessageRequest;
import com.streamdesk.chat.dto.SessionRequest;
import com.streamdesk.config.ApiException;
import com.streamdesk.transcription.WhisperXClient;
import com.streamdesk.transcription.dto.TranscribeOptions;
import com.streamdesk.user.UserService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Логика чата — перенос /api/chat/* из backend/routes.ts.
 * /completions проксирует запрос к локальной OpenAI-совместимой модели (как в Express).
 */
@Service
public class ChatService {

    private final ChatSessionRepository sessionRepository;
    private final ChatMessageRepository messageRepository;
    private final UserService userService;
    private final ObjectMapper objectMapper;
    private final WhisperXClient whisperXClient;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    public ChatService(ChatSessionRepository sessionRepository,
                       ChatMessageRepository messageRepository,
                       UserService userService,
                       ObjectMapper objectMapper,
                       WhisperXClient whisperXClient) {
        this.sessionRepository = sessionRepository;
        this.messageRepository = messageRepository;
        this.userService = userService;
        this.objectMapper = objectMapper;
        this.whisperXClient = whisperXClient;
    }

    // --- sessions ---

    public List<ChatSession> getSessions(String userId) {
        if (isBlank(userId)) {
            throw ApiException.badRequest("UserId is required");
        }
        return sessionRepository.findByUserIdOrderByUpdatedAtDesc(userId);
    }

    @Transactional
    public ChatSession createSession(SessionRequest req) {
        if (isBlank(req.userId())) {
            throw ApiException.badRequest("UserId is required");
        }
        if (isBlank(req.title())) {
            throw ApiException.badRequest("Title is required");
        }
        if (userService.findById(req.userId()).isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "User not found");
        }
        ChatSession session = new ChatSession();
        session.setUserId(req.userId());
        session.setTitle(req.title().trim());
        session.setModelId(req.modelId());
        return sessionRepository.save(session);
    }

    @Transactional
    public void deleteSession(String id, String userId) {
        if (isBlank(userId)) {
            throw ApiException.badRequest("UserId is required");
        }
        ChatSession session = ownedSessionOr404(id, userId);
        messageRepository.deleteBySessionId(session.getId());
        sessionRepository.deleteById(session.getId());
    }

    // --- messages ---

    public List<ChatMessage> getMessages(String sessionId, String userId) {
        if (isBlank(userId)) {
            throw ApiException.badRequest("UserId is required");
        }
        ChatSession session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Chat session not found"));
        if (!session.getUserId().equals(userId)) {
            throw ApiException.forbidden("Access denied");
        }
        return messageRepository.findBySessionIdOrderByCreatedAt(sessionId);
    }

    @Transactional
    public ChatMessage createMessage(String sessionId, MessageRequest req) {
        if (isBlank(req.userId())) {
            throw ApiException.badRequest("UserId is required");
        }
        ChatSession session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Chat session not found"));
        if (!session.getUserId().equals(req.userId())) {
            throw ApiException.forbidden("Access denied");
        }
        if (isBlank(req.role()) || isBlank(req.content())) {
            throw ApiException.badRequest("Role and content are required");
        }
        ChatMessage message = new ChatMessage();
        message.setSessionId(sessionId);
        message.setRole(req.role());
        message.setContent(req.content());
        message.setAttachments(req.attachments() != null ? req.attachments() : new ArrayList<>());
        return messageRepository.save(message);
    }

    // --- completions (прокси к локальной модели) ---

    public Map<String, Object> completions(CompletionRequest req) {
        if (isBlank(req.model()) || req.messages() == null || isBlank(req.endpoint())) {
            throw ApiException.badRequest("Missing required parameters");
        }

        // Проверка доступности локальной модели (как health-check в Express).
        String healthUrl = req.endpoint().replace("/v1/chat/completions", "/health");
        if (!isModelHealthy(healthUrl)) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Локальная модель недоступна. Убедитесь, что модель запущена.");
        }

        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("model", req.model());
            payload.put("messages", req.messages());
            payload.put("temperature", 0.7);
            payload.put("stream", false);

            HttpRequest request = HttpRequest.newBuilder(URI.create(req.endpoint()))
                    .timeout(Duration.ofSeconds(120))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                throw new RuntimeException("Model returned error: " + response.statusCode());
            }

            JsonNode data = objectMapper.readTree(response.body());
            String content = data.path("choices").path(0).path("message").path("content").asText("");
            if (content.isEmpty()) {
                content = "Не удалось получить ответ от модели";
            }
            String modelOut = data.path("model").asText(req.model());

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("content", content);
            result.put("model", modelOut);
            return result;
        } catch (Exception e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR,
                    e.getMessage() != null ? e.getMessage() : "Failed to get response from local model");
        }
    }

    // --- upload ---

    /**
     * Загрузка файла в чат — сохраняет в uploads/chat и возвращает метаданные.
     * Транскрипция аудио/видео через WhisperX отложена (внешний сервис) — поле transcription пока null.
     */
    public Map<String, Object> uploadFile(String userId, String sessionId, MultipartFile file) {
        if (isBlank(userId)) {
            throw ApiException.badRequest("UserId is required");
        }
        if (isBlank(sessionId)) {
            throw ApiException.badRequest("Session ID is required");
        }
        ownedSessionOr404(sessionId, userId);
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("File is required");
        }

        try {
            Path uploadDir = Paths.get(System.getProperty("user.dir"), "uploads", "chat");
            Files.createDirectories(uploadDir);

            String originalName = file.getOriginalFilename() != null ? file.getOriginalFilename() : "file";
            String ext = originalName.contains(".") ? originalName.substring(originalName.lastIndexOf('.')) : "";
            String base = (ext.isEmpty() ? originalName : originalName.substring(0, originalName.length() - ext.length()))
                    .replaceAll("[^\\p{L}0-9_\\- ]", "_");
            String uniqueSuffix = System.currentTimeMillis() + "-" + ThreadLocalRandom.current().nextInt(1_000_000_000);
            String filename = base + "-" + uniqueSuffix + ext;

            Path target = uploadDir.resolve(filename);
            file.transferTo(target.toFile());

            String url = "/uploads/chat/" + filename;
            String contentType = file.getContentType() != null ? file.getContentType() : "application/octet-stream";

            // Если аудио/видео и WhisperX настроен — транскрибируем (best-effort, не ломаем загрузку).
            // Локальный fallback на whisper.cpp из Node не переносим (спавн бинарника, окружение-специфично).
            String transcription = null;
            if ((contentType.startsWith("audio/") || contentType.startsWith("video/"))
                    && whisperXClient.isConfigured()) {
                try {
                    transcription = whisperXClient.transcribe(target, TranscribeOptions.of("ru", false)).getText();
                } catch (Exception e) {
                    // не прерываем загрузку — просто не добавляем транскрипцию
                }
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("id", UUID.randomUUID().toString());
            result.put("name", originalName);
            result.put("url", url);
            result.put("type", contentType);
            result.put("size", file.getSize());
            result.put("transcription", transcription);
            return result;
        } catch (IOException e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Failed to upload chat file: " + e.getMessage());
        }
    }

    // --- helpers ---

    private boolean isModelHealthy(String healthUrl) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(healthUrl))
                    .timeout(Duration.ofSeconds(5))
                    .header("Content-Type", "application/json")
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            return response.statusCode() / 100 == 2;
        } catch (Exception e) {
            return false;
        }
    }

    private ChatSession ownedSessionOr404(String id, String userId) {
        ChatSession session = sessionRepository.findById(id).orElse(null);
        if (session == null || !session.getUserId().equals(userId)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Chat session not found");
        }
        return session;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
