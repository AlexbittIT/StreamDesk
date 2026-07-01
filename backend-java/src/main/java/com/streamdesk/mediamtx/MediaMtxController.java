package com.streamdesk.mediamtx;

import com.fasterxml.jackson.databind.JsonNode;
import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.config.ApiException;
import com.streamdesk.mediamtx.dto.KickRequest;
import com.streamdesk.mediamtx.dto.PathRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * REST-контроллер управления MediaMTX (на Java, как и весь бэкенд).
 * Чтение (потоки/пути/health) — всем авторизованным; запись (создание/удаление путей,
 * отключение соединений) — только админам.
 */
@RestController
@RequestMapping("/api/mediamtx")
public class MediaMtxController {

    private final MediaMtxService mediaMtxService;

    public MediaMtxController(MediaMtxService mediaMtxService) {
        this.mediaMtxService = mediaMtxService;
    }

    // GET /api/mediamtx/health — доступен ли MediaMTX Control API
    @GetMapping("/health")
    public Map<String, Object> health() {
        boolean ok = mediaMtxService.isReachable();
        return Map.of("reachable", ok, "status", ok ? "online" : "offline");
    }

    // GET /api/mediamtx/streams — активные потоки с телеметрией для плиток дашборда
    @GetMapping("/streams")
    public List<Map<String, Object>> streams() {
        return mediaMtxService.listStreams();
    }

    // GET /api/mediamtx/paths — активные пути (рантайм)
    @GetMapping("/paths")
    public JsonNode listPaths() {
        return mediaMtxService.listPaths();
    }

    // GET /api/mediamtx/paths/{name} — путь + URL подключения
    @GetMapping("/paths/{name}")
    public Map<String, Object> getPath(@PathVariable String name) {
        return mediaMtxService.getPath(name);
    }

    // POST /api/mediamtx/paths — создать/настроить путь (admin)
    @PostMapping("/paths")
    public ResponseEntity<Map<String, Object>> createPath(@RequestBody PathRequest req,
                                                          @AuthenticationPrincipal AuthenticatedUser user) {
        requireAdmin(user);
        return ResponseEntity.status(HttpStatus.CREATED).body(mediaMtxService.createOrUpdatePath(req));
    }

    // DELETE /api/mediamtx/paths/{name} (admin)
    @DeleteMapping("/paths/{name}")
    public Map<String, Boolean> deletePath(@PathVariable String name,
                                           @AuthenticationPrincipal AuthenticatedUser user) {
        requireAdmin(user);
        mediaMtxService.deletePath(name);
        return Map.of("success", true);
    }

    // POST /api/mediamtx/kick — отключить читателя/соединение (admin)
    @PostMapping("/kick")
    public Map<String, Boolean> kick(@RequestBody KickRequest req,
                                     @AuthenticationPrincipal AuthenticatedUser user) {
        requireAdmin(user);
        mediaMtxService.kick(req != null ? req.type() : null, req != null ? req.id() : null);
        return Map.of("success", true);
    }

    private void requireAdmin(AuthenticatedUser user) {
        if (user == null || !user.isAdmin()) {
            throw ApiException.forbidden("Управление MediaMTX доступно только администраторам");
        }
    }
}
