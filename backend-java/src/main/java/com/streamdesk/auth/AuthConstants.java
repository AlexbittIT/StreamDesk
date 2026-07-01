package com.streamdesk.auth;

import java.util.List;

/**
 * Константы авторизации — перенос из backend/routes.ts.
 */
public final class AuthConstants {

    private AuthConstants() {
    }

    /** Имя атрибута сессии с id пользователя — аналог req.session.userId. */
    public static final String SESSION_USER_ID = "userId";

    /** Спец-значение для fallback-админа (нет записи в БД). */
    public static final String FALLBACK_ADMIN_ID = "admin-fallback";

    /** Полный набор прав админа — как в fallback-ветке login Express. */
    public static final List<String> FALLBACK_ADMIN_PERMISSIONS = List.of(
            "admin:panel",
            "users:manage",
            "roles:manage",
            "tasks:view",
            "tasks:create",
            "tasks:edit",
            "tasks:delete",
            "tasks:assign",
            "equipment:view",
            "equipment:create",
            "equipment:edit",
            "equipment:delete",
            "equipment:reserve",
            "events:view",
            "events:create",
            "events:edit",
            "events:delete",
            "streams:view",
            "streams:manage",
            "systems:view",
            "systems:manage",
            "settings:manage"
    );

    /** Принципал fallback-админа. */
    public static AuthenticatedUser fallbackAdmin(String username) {
        return new AuthenticatedUser(
                FALLBACK_ADMIN_ID,
                username,
                "Администратор",
                null,
                null,
                "admin",
                null,
                FALLBACK_ADMIN_PERMISSIONS,
                true,
                true,
                "platform_admin",
                true
        );
    }
}