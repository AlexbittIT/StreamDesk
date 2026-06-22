package com.streamdesk.telegram;

import com.streamdesk.telegram.dto.LinkRequest;
import com.streamdesk.telegram.dto.RequestCodeRequest;
import com.streamdesk.telegram.dto.TelegramUserRequest;
import com.streamdesk.telegram.dto.VerifyCodeRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * REST-контроллер Telegram — перенос /api/auth/telegram* и /api/telegram-users из backend/routes.ts.
 */
@RestController
public class TelegramController {

    private final TelegramService telegramService;

    public TelegramController(TelegramService telegramService) {
        this.telegramService = telegramService;
    }

    // POST /api/auth/telegram — создать запись Telegram-пользователя
    @PostMapping("/api/auth/telegram")
    public TelegramUser create(@RequestBody TelegramUserRequest req) {
        return telegramService.createOrGet(req);
    }

    // POST /api/auth/telegram/link
    @PostMapping("/api/auth/telegram/link")
    public TelegramUser link(@RequestBody LinkRequest req) {
        return telegramService.link(req != null ? req.telegramId() : null, req != null ? req.userId() : null);
    }

    // POST /api/auth/telegram/login — вход через Telegram Login Widget
    @PostMapping("/api/auth/telegram/login")
    public Map<String, Object> login(@RequestBody Map<String, Object> data) {
        return telegramService.login(data);
    }

    // POST /api/auth/telegram/request-code — запрос кода авторизации через бота
    @PostMapping("/api/auth/telegram/request-code")
    public Map<String, Object> requestCode(@RequestBody RequestCodeRequest req) {
        return telegramService.requestCode(
                req != null ? req.telegramId() : null,
                req != null ? req.chatId() : null);
    }

    // POST /api/auth/telegram/verify-code — проверка кода и вход/создание пользователя
    @PostMapping("/api/auth/telegram/verify-code")
    public Map<String, Object> verifyCode(@RequestBody VerifyCodeRequest req) {
        return telegramService.verifyCode(
                req != null ? req.code() : null,
                req != null ? req.phoneNumber() : null,
                req != null ? req.timestamp() : null);
    }

    // GET /api/telegram-users — список привязанных к Telegram пользователей (без паролей)
    @GetMapping("/api/telegram-users")
    public List<Map<String, Object>> telegramUsers() {
        return telegramService.listTelegramUsers();
    }
}
