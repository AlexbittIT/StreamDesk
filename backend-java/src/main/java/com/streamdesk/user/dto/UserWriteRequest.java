package com.streamdesk.user.dto;

import java.util.List;

/**
 * Тело создания/обновления пользователя (POST/PUT /api/users).
 */
public record UserWriteRequest(
        String username,
        String password,
        String name,
        String email,
        String phone,
        String position,
        String department,
        String role,
        List<String> permissions,
        String telegramId,
        String avatar,
        Boolean active,
        Boolean onboardingCompleted,
        String workspaceMode,
        Boolean emailNotificationsEnabled
) {
}
