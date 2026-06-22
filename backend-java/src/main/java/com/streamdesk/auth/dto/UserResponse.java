package com.streamdesk.auth.dto;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.user.User;

import java.util.List;

/**
 * Безопасное представление пользователя для API (без пароля).
 * Совпадает по полям с объектом user, который Express отдаёт на login/register/me.
 */
public record UserResponse(
        String id,
        String username,
        String name,
        String role,
        List<String> permissions,
        String avatar,
        Boolean active,
        Boolean onboardingCompleted,
        String workspaceMode
) {

    public static UserResponse fromEntity(User u) {
        return new UserResponse(
                u.getId(),
                u.getUsername(),
                u.getName(),
                u.getRole(),
                u.getPermissions(),
                u.getAvatar(),
                u.getActive(),
                u.getOnboardingCompleted(),
                u.getWorkspaceMode()
        );
    }

    public static UserResponse fromPrincipal(AuthenticatedUser u) {
        return new UserResponse(
                u.id(),
                u.username(),
                u.name(),
                u.role(),
                u.permissions(),
                u.avatar(),
                u.active(),
                u.onboardingCompleted(),
                u.workspaceMode()
        );
    }
}