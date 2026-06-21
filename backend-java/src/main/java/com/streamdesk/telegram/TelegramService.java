package com.streamdesk.telegram;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.streamdesk.config.ApiException;
import com.streamdesk.config.TimeParse;
import com.streamdesk.telegram.dto.TelegramUserRequest;
import com.streamdesk.user.User;
import com.streamdesk.user.UserService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Логика Telegram-пользователей — перенос /api/auth/telegram* и /api/telegram-users из routes.ts.
 * Перенесено: создание записи, привязка, вход через Telegram (с HMAC-проверкой виджета), список,
 * request-code/verify-code (бот-клиент {@link TelegramBotClient}).
 */
@Service
public class TelegramService {

    private final TelegramUserRepository repository;
    private final UserService userService;
    private final ObjectMapper objectMapper;
    private final TelegramBotClient telegramBot;
    private final SecureRandom secureRandom = new SecureRandom();

    // In-memory хранилище кодов авторизации (как Map authCodes в backend/routes.ts).
    // Сбрасывается при перезапуске; чистка истекших кодов выполняется лениво при обращении.
    private final Map<String, AuthCode> authCodes = new ConcurrentHashMap<>();

    private static final long CODE_TTL_MS = 10 * 60 * 1000L; // 10 минут

    public TelegramService(TelegramUserRepository repository, UserService userService,
                           ObjectMapper objectMapper, TelegramBotClient telegramBot) {
        this.repository = repository;
        this.userService = userService;
        this.objectMapper = objectMapper;
        this.telegramBot = telegramBot;
    }

    private record AuthCode(String code, long expiresAt) {
    }

    /** POST /api/auth/telegram — создать запись Telegram-пользователя, если её ещё нет. */
    @Transactional
    public TelegramUser createOrGet(TelegramUserRequest req) {
        if (req == null || isBlank(req.telegramId())) {
            throw ApiException.badRequest("Invalid telegram data");
        }
        Optional<TelegramUser> existing = repository.findByTelegramId(req.telegramId());
        if (existing.isPresent()) {
            return existing.get();
        }
        TelegramUser tu = new TelegramUser();
        tu.setTelegramId(req.telegramId());
        tu.setUsername(req.username());
        tu.setFirstName(req.firstName());
        tu.setLastName(req.lastName());
        tu.setPhotoUrl(req.photoUrl());
        tu.setAuthDate(parseOrNull(req.authDate()));
        tu.setUserId(req.userId());
        return repository.save(tu);
    }

    /** POST /api/auth/telegram/link — привязать запись Telegram к пользователю. */
    @Transactional
    public TelegramUser link(String telegramId, String userId) {
        TelegramUser tu = repository.findByTelegramId(telegramId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Telegram user not found"));
        tu.setUserId(userId);
        return repository.save(tu);
    }

    /** POST /api/auth/telegram/login — вход через Telegram Login Widget. */
    @Transactional
    public Map<String, Object> login(Map<String, Object> data) {
        String botToken = System.getenv("TELEGRAM_BOT_TOKEN");
        boolean verified = isBlank(botToken) || verifyTelegramAuth(data, botToken);
        if (!verified) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid Telegram auth data");
        }

        String telegramId = str(data, "id");
        User user = userService.findByTelegramId(telegramId).orElse(null);

        if (user == null) {
            Instant authDate = epochSeconds(data.get("auth_date"));
            TelegramUser tu = repository.findByTelegramId(telegramId).orElseGet(TelegramUser::new);
            tu.setTelegramId(telegramId);
            tu.setUsername(str(data, "username"));
            tu.setFirstName(str(data, "first_name"));
            tu.setLastName(str(data, "last_name"));
            tu.setPhotoUrl(str(data, "photo_url"));
            tu.setAuthDate(authDate);
            tu = repository.save(tu);

            String name = Stream.of(str(data, "first_name"), str(data, "last_name"))
                    .filter(s -> s != null && !s.isBlank())
                    .collect(Collectors.joining(" "));

            User newUser = new User();
            newUser.setUsername(!isBlank(str(data, "username")) ? str(data, "username") : "tg_" + telegramId);
            newUser.setPassword(randomHex(32));
            newUser.setName(!name.isBlank() ? name : "Telegram User " + telegramId);
            newUser.setTelegramId(telegramId);
            newUser.setAvatar(str(data, "photo_url"));
            newUser.setRole("employee");
            newUser.setActive(true);
            user = userService.save(newUser);

            tu.setUserId(user.getId());
            repository.save(tu);
        } else {
            user.setLastLogin(Instant.now());
            user = userService.save(user);
        }

        Map<String, Object> userBlock = new LinkedHashMap<>();
        userBlock.put("id", user.getId());
        userBlock.put("username", user.getUsername());
        userBlock.put("name", user.getName());
        userBlock.put("role", user.getRole());
        userBlock.put("avatar", user.getAvatar());
        userBlock.put("permissions", user.getPermissions());
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("user", userBlock);
        return response;
    }

    /**
     * POST /api/auth/telegram/request-code — генерирует код и отправляет его через бота.
     * Возвращает только timestamp (как в Express) — сам код наружу не отдаётся.
     */
    public Map<String, Object> requestCode(String telegramId, String chatId) {
        if (isBlank(telegramId) || isBlank(chatId)) {
            throw ApiException.badRequest("Telegram ID и Chat ID обязательны");
        }
        if (!telegramBot.isConfigured()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Telegram бот не настроен. Добавьте TELEGRAM_BOT_TOKEN в .env");
        }

        if (telegramBot.getUserInfo(chatId).isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Пользователь не найден в Telegram");
        }

        sweepExpired();
        String code = telegramBot.generateAuthCode();
        long timestamp = System.currentTimeMillis();
        long expiresAt = timestamp + CODE_TTL_MS;
        authCodes.put(telegramId + ":" + timestamp, new AuthCode(code, expiresAt));

        String message = "🔐 Код авторизации для StreamDesk:\n\n"
                + "`" + code + "`\n\n"
                + "Введите этот код на сайте для входа.\n"
                + "Код действителен 10 минут.";

        if (!telegramBot.sendMessage(chatId, message, "Markdown")) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Не удалось отправить код через Telegram");
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("timestamp", timestamp);
        response.put("message", "Код отправлен в Telegram");
        return response;
    }

    /**
     * POST /api/auth/telegram/verify-code — проверяет код и логинит/создаёт пользователя.
     * phoneNumber играет роль telegramId (как в backend/routes.ts).
     */
    @Transactional
    public Map<String, Object> verifyCode(String code, String phoneNumber, Long timestamp) {
        if (isBlank(code) || isBlank(phoneNumber) || timestamp == null) {
            throw ApiException.badRequest("Код, номер телефона и timestamp обязательны");
        }

        String codeKey = phoneNumber + ":" + timestamp;
        AuthCode codeData = authCodes.get(codeKey);
        if (codeData == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Код не найден или истек");
        }
        if (codeData.expiresAt() < System.currentTimeMillis()) {
            authCodes.remove(codeKey);
            throw new ApiException(HttpStatus.GONE, "Код истек");
        }
        if (!codeData.code().equals(code)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Неверный код");
        }
        authCodes.remove(codeKey);

        // Ищем пользователя по telegramId, затем по телефону.
        User user = userService.findByTelegramId(phoneNumber).orElse(null);
        if (user == null) {
            user = userService.getAllUsers().stream()
                    .filter(u -> phoneNumber.equals(u.getPhone()) || phoneNumber.equals(u.getTelegramId()))
                    .findFirst()
                    .orElse(null);
        }

        if (user == null) {
            String last4 = phoneNumber.length() >= 4 ? phoneNumber.substring(phoneNumber.length() - 4) : phoneNumber;
            User newUser = new User();
            newUser.setUsername("phone_" + phoneNumber.replaceAll("\\D", ""));
            newUser.setPassword(randomHex(32));
            newUser.setName("Пользователь " + last4);
            newUser.setPhone(phoneNumber);
            newUser.setTelegramId(phoneNumber);
            newUser.setRole("employee");
            newUser.setActive(true);
            user = userService.save(newUser);

            TelegramUser tu = new TelegramUser();
            tu.setTelegramId(phoneNumber);
            tu.setAuthDate(Instant.now());
            tu.setUserId(user.getId());
            repository.save(tu);
        } else {
            user.setLastLogin(Instant.now());
            user = userService.save(user);
        }

        Map<String, Object> userBlock = new LinkedHashMap<>();
        userBlock.put("id", user.getId());
        userBlock.put("username", user.getUsername());
        userBlock.put("name", user.getName());
        userBlock.put("role", user.getRole());
        userBlock.put("avatar", user.getAvatar());
        userBlock.put("permissions", user.getPermissions());
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("user", userBlock);
        return response;
    }

    /** Удаляет истекшие коды (ленивая замена setInterval-чистки из Express). */
    private void sweepExpired() {
        long now = System.currentTimeMillis();
        authCodes.values().removeIf(c -> c.expiresAt() < now);
    }

    /** GET /api/telegram-users — пользователи, привязанные к Telegram (без паролей). */
    public List<Map<String, Object>> listTelegramUsers() {
        return userService.getActiveUsers().stream()
                .filter(u -> u.getTelegramId() != null && !u.getTelegramId().isBlank())
                .map(this::strip)
                .toList();
    }

    // --- helpers ---

    /** Проверка подписи Telegram Login Widget (HMAC-SHA256). */
    private boolean verifyTelegramAuth(Map<String, Object> data, String botToken) {
        Object hash = data.get("hash");
        if (hash == null) {
            return false;
        }
        String dataCheckString = new TreeMap<>(data).entrySet().stream()
                .filter(e -> !"hash".equals(e.getKey()))
                .map(e -> e.getKey() + "=" + String.valueOf(e.getValue()))
                .collect(Collectors.joining("\n"));
        try {
            byte[] secretKey = MessageDigest.getInstance("SHA-256")
                    .digest(botToken.getBytes(StandardCharsets.UTF_8));
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secretKey, "HmacSHA256"));
            byte[] hmac = mac.doFinal(dataCheckString.getBytes(StandardCharsets.UTF_8));
            return toHex(hmac).equals(String.valueOf(hash));
        } catch (Exception e) {
            return false;
        }
    }

    private String randomHex(int bytes) {
        byte[] buf = new byte[bytes];
        secureRandom.nextBytes(buf);
        return toHex(buf);
    }

    private String toHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }

    private Instant epochSeconds(Object value) {
        if (value instanceof Number n) {
            return Instant.ofEpochSecond(n.longValue());
        }
        if (value != null) {
            try {
                return Instant.ofEpochSecond(Long.parseLong(String.valueOf(value)));
            } catch (NumberFormatException ignored) {
                // не число — оставим null
            }
        }
        return null;
    }

    private Instant parseOrNull(String value) {
        if (isBlank(value)) {
            return null;
        }
        try {
            return TimeParse.toInstant(value);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private Map<String, Object> strip(User user) {
        Map<String, Object> map = objectMapper.convertValue(user, new TypeReference<Map<String, Object>>() {
        });
        map.remove("password");
        return map;
    }

    private String str(Map<String, Object> data, String key) {
        Object v = data.get(key);
        return v != null ? String.valueOf(v) : null;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
