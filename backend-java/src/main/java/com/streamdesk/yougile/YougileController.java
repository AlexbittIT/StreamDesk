package com.streamdesk.yougile;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.yougile.api.YougileModels.YgColumn;
import com.streamdesk.yougile.sync.YougileSyncService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * REST-контроллер YouGile — перенос /api/yougile/* и /api/projects/{id}/link-yougile-board
 * из backend/routes.ts.
 */
@RestController
public class YougileController {

    private final YougileEndpointService service;

    public YougileController(YougileEndpointService service) {
        this.service = service;
    }

    @PostMapping("/api/yougile/auth/key")
    public Map<String, Object> authKey(@RequestBody(required = false) Map<String, Object> body) {
        String login = body != null ? str(body.get("login")) : null;
        String password = body != null ? str(body.get("password")) : null;
        return service.authKey(login, password);
    }

    @GetMapping("/api/yougile/config")
    public Map<String, Object> config() {
        return service.config();
    }

    @GetMapping("/api/yougile/status")
    public Map<String, Object> status() {
        return service.status();
    }

    @GetMapping("/api/yougile/projects")
    public List<Map<String, Object>> projects(@RequestParam(required = false) String sync) {
        return service.projects(isTrue(sync));
    }

    @GetMapping("/api/yougile/boards")
    public List<Map<String, Object>> boards(@RequestParam(required = false) String projectId) {
        return service.boards(projectId);
    }

    @GetMapping("/api/yougile/boards-all")
    public List<Map<String, Object>> boardsAll() {
        return service.boardsAll();
    }

    @PostMapping("/api/yougile/sync-projects")
    public Map<String, Object> syncProjects() {
        return service.syncProjects();
    }

    @GetMapping("/api/yougile/columns")
    public List<Map<String, Object>> columns(@RequestParam(required = false) String boardId,
                                             @RequestParam(required = false) String sync) {
        return service.columns(boardId, isTrue(sync));
    }

    @GetMapping("/api/yougile/stickers")
    public List<Map<String, Object>> stickers(@RequestParam(required = false) String boardId) {
        return service.stickers(boardId);
    }

    @PostMapping("/api/yougile/columns")
    public ResponseEntity<YgColumn> createColumn(@RequestBody(required = false) Map<String, Object> body) {
        String boardId = body != null ? str(body.get("boardId")) : null;
        String title = body != null ? str(body.get("title")) : null;
        Integer color = body != null && body.get("color") instanceof Number n ? n.intValue() : null;
        return ResponseEntity.status(HttpStatus.CREATED).body(service.createColumn(boardId, title, color));
    }

    @GetMapping("/api/yougile/column-map")
    public Map<String, String> getColumnMap() {
        return service.getColumnMap();
    }

    @PostMapping("/api/yougile/column-map")
    public Map<String, String> setColumnMap(@RequestBody(required = false) Map<String, Object> body) {
        return service.setColumnMap(body);
    }

    @GetMapping("/api/yougile/tasks/{yougileTaskId}")
    public Map<String, Object> taskByYougileId(@PathVariable String yougileTaskId) {
        return service.taskByYougileId(yougileTaskId);
    }

    @GetMapping("/api/yougile/tasks")
    public List<Map<String, Object>> tasks(@RequestParam(required = false) String projectId,
                                           @RequestParam(required = false) String boardId,
                                           @RequestParam(required = false) String columnId,
                                           @RequestParam(required = false) String title,
                                           @RequestParam(required = false) Integer limit,
                                           @RequestParam(required = false) Integer offset) {
        return service.tasks(projectId, boardId, columnId, title, limit, offset);
    }

    @PostMapping("/api/yougile/sync")
    public YougileSyncService.YougileSyncResult sync(@AuthenticationPrincipal AuthenticatedUser user) {
        return service.sync(user != null ? user.id() : null);
    }

    @PostMapping("/api/projects/{id}/link-yougile-board")
    public Map<String, Object> linkYougileBoard(@PathVariable String id) {
        return service.linkYougileBoard(id);
    }

    private boolean isTrue(String v) {
        return "1".equals(v) || "true".equalsIgnoreCase(v);
    }

    private String str(Object o) {
        return o != null ? o.toString() : null;
    }
}
