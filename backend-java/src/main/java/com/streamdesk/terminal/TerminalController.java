package com.streamdesk.terminal;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.config.ApiException;
import com.streamdesk.terminal.dto.AccessRequest;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * REST-контроллер Терминала — перенос /api/terminal/* из backend/routes.ts.
 */
@RestController
@RequestMapping("/api/terminal")
public class TerminalController {

    private final TerminalAccessService accessService;
    private final TerminalLogBuffer logBuffer;

    public TerminalController(TerminalAccessService accessService, TerminalLogBuffer logBuffer) {
        this.accessService = accessService;
        this.logBuffer = logBuffer;
    }

    // GET /api/terminal/access
    @GetMapping("/access")
    public Map<String, Object> getAccess() {
        return Map.of("allowedRoles", accessService.getAllowedRoles());
    }

    // POST /api/terminal/access — только администратор
    @PostMapping("/access")
    public Map<String, Object> setAccess(@RequestBody AccessRequest req, @AuthenticationPrincipal AuthenticatedUser user) {
        if (user == null || !"admin".equals(user.role())) {
            throw ApiException.forbidden("Только администратор может менять доступ к Терминалу");
        }
        accessService.setAllowedRoles(req != null ? req.allowedRoles() : null);
        return Map.of("allowedRoles", accessService.getAllowedRoles());
    }

    // GET /api/terminal/logs — для ролей из «Доступ к Терминалу»
    @GetMapping("/logs")
    public Map<String, Object> getLogs(@AuthenticationPrincipal AuthenticatedUser user,
                                       @RequestParam(required = false) Integer limit) {
        if (user == null || user.id() == null) {
            throw ApiException.forbidden("Войдите в систему для просмотра логов");
        }
        if (!accessService.canView(user.role())) {
            throw ApiException.forbidden("Доступ к Терминалу для вашей роли отключён. Обратитесь к администратору "
                    + "или измените настройку в Настройках → Доступ к Терминалу.");
        }
        int effectiveLimit = limit != null ? Math.min(100, Math.max(1, limit)) : 15;
        TerminalLogBuffer.Result result = logBuffer.getLogs(0, effectiveLimit);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("lines", result.lines());
        response.put("nextIndex", result.nextIndex());
        return response;
    }
}
