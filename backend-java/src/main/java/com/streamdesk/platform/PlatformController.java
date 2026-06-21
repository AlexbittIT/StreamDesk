package com.streamdesk.platform;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.config.ApiException;
import com.streamdesk.platform.dto.ResetPasswordRequest;
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
 * REST-контроллер платформы — управление пользователями владельцем платформы.
 * Перенос /api/platform/users из backend/routes.ts. Доступ только владельцу платформы.
 */
@RestController
@RequestMapping("/api/platform")
public class PlatformController {

    private final PlatformService platformService;

    public PlatformController(PlatformService platformService) {
        this.platformService = platformService;
    }

    @GetMapping("/users")
    public List<Map<String, Object>> users(@AuthenticationPrincipal AuthenticatedUser user) {
        requirePlatformAdmin(user);
        return platformService.listUsers();
    }

    @PostMapping("/users/{id}/reset-password")
    public Map<String, Object> resetPassword(@PathVariable String id,
                                             @RequestBody(required = false) ResetPasswordRequest req,
                                             @AuthenticationPrincipal AuthenticatedUser user) {
        requirePlatformAdmin(user);
        return platformService.resetPassword(id, req != null ? req.password() : null);
    }

    @DeleteMapping("/users/{id}")
    public Map<String, Boolean> deleteUser(@PathVariable String id,
                                           @AuthenticationPrincipal AuthenticatedUser user) {
        AuthenticatedUser admin = requirePlatformAdmin(user);
        platformService.deleteUser(admin.id(), id);
        return Map.of("success", true);
    }

    /** Доступ только владельцу платформы — порт requirePlatformAdmin из routes.ts. */
    private AuthenticatedUser requirePlatformAdmin(AuthenticatedUser user) {
        boolean isPlatformAdmin = user != null
                && ("admin".equals(user.role())
                || (user.permissions() != null && user.permissions().contains("platform:admin")));
        if (!isPlatformAdmin) {
            throw ApiException.forbidden("Доступно только владельцу платформы");
        }
        return user;
    }
}
