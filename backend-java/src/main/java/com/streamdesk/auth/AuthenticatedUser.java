package com.streamdesk.auth;

import com.streamdesk.user.User;

import java.util.ArrayList;
import java.util.List;

/**
 * Текущий пользователь в SecurityContext — аналог req.user из Express-middleware.
 * Кладётся как principal. Для fallback-админа сущности в БД нет (fallback=true).
 */
public record AuthenticatedUser(
        String id,
        String username,
        String name,
        String email,
        String avatar,
        String role,
        String department,
        List<String> permissions,
        boolean active,
        boolean onboardingCompleted,
        String workspaceMode,
        boolean fallback
) {

    public static AuthenticatedUser fromEntity(User u) {
        return new AuthenticatedUser(
                u.getId(),
                u.getUsername(),
                u.getName(),
                u.getEmail(),
                u.getAvatar(),
                u.getRole(),
                u.getDepartment(),
                u.getPermissions() != null ? u.getPermissions() : new ArrayList<>(),
                Boolean.TRUE.equals(u.getActive()),
                Boolean.TRUE.equals(u.getOnboardingCompleted()),
                u.getWorkspaceMode(),
                false
        );
    }

    public boolean isAdmin() {
        return "admin".equals(role);
    }
}