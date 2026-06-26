package com.streamdesk.user;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.config.ApiException;
import com.streamdesk.user.dto.PermissionsRequest;
import com.streamdesk.user.dto.UserWriteRequest;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

/**
 * REST-контроллер пользователей — перенос /api/users из backend/routes.ts. Пути сохранены.
 */
@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserCrudService userCrudService;
    private final UserService userService;

    public UserController(UserCrudService userCrudService, UserService userService) {
        this.userCrudService = userCrudService;
        this.userService = userService;
    }

    // GET /api/users
    @GetMapping
    public List<Map<String, Object>> list(@AuthenticationPrincipal AuthenticatedUser user) {
        return userCrudService.listForViewer(user);
    }

    // GET /api/users/{id}
    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable String id) {
        return userCrudService.getById(id);
    }

    // POST /api/users
    @PostMapping
    public Map<String, Object> create(@RequestBody UserWriteRequest req) {
        return userCrudService.create(req);
    }

    // PUT /api/users/{id}
    @PutMapping("/{id}")
    public Map<String, Object> update(@PathVariable String id, @RequestBody UserWriteRequest req) {
        return userCrudService.update(id, req);
    }

    // POST /api/users/{id}/avatar (multipart, только свой аватар)
    @PostMapping("/{id}/avatar")
    public Map<String, Object> avatar(@PathVariable String id,
                                      @RequestParam(value = "avatar", required = false) MultipartFile avatar,
                                      @AuthenticationPrincipal AuthenticatedUser user) {
        if (user == null) {
            throw ApiException.unauthorized("Требуется авторизация");
        }
        return userCrudService.setAvatar(id, avatar, user.id());
    }

    // DELETE /api/users/{id} — только владелец платформы
    @DeleteMapping("/{id}")
    public Map<String, Boolean> delete(@PathVariable String id, @AuthenticationPrincipal AuthenticatedUser user) {
        requirePlatformAdmin(user);
        if (userService.existsById(id)) {
            userService.deleteById(id);
        }
        return Map.of("success", true);
    }

    // PUT /api/users/{id}/permissions
    @PutMapping("/{id}/permissions")
    public Map<String, Object> permissions(@PathVariable String id, @RequestBody PermissionsRequest req) {
        return userCrudService.updatePermissions(id, req);
    }

    private void requirePlatformAdmin(AuthenticatedUser user) {
        boolean ok = user != null
                && ("admin".equals(user.role())
                || (user.permissions() != null && user.permissions().contains("platform:admin")));
        if (!ok) {
            throw ApiException.forbidden("Доступно только владельцу платформы");
        }
    }
}
