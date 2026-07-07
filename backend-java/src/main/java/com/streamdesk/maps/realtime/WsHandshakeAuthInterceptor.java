package com.streamdesk.maps.realtime;

import com.streamdesk.auth.AuthConstants;
import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.user.User;
import com.streamdesk.user.UserService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.Map;
import java.util.Optional;

/**
 * Аутентификация WS-рукопожатия из той же HttpSession, что и REST (тот же контракт, что
 * {@code SessionAuthenticationFilter}): читаем {@link AuthConstants#SESSION_USER_ID}, резолвим
 * пользователя из БД либо fallback-админа. Найденного принципала кладём в атрибуты WS-сессии
 * (ключ {@link #WS_USER}) — дальше по нему работают presence и изоляция компаний.
 *
 * <p>Нет сессии/пользователя → рукопожатие отклоняется (анонимный WS не пускаем).
 */
@Component
public class WsHandshakeAuthInterceptor implements HandshakeInterceptor {

    /** Ключ атрибута WS-сессии с аутентифицированным пользователем. */
    public static final String WS_USER = "wsUser";

    private final UserService userService;
    private final String fallbackAdminUsername;

    public WsHandshakeAuthInterceptor(UserService userService,
                                      @Value("${app.auth.admin-username:admin}") String fallbackAdminUsername) {
        this.userService = userService;
        this.fallbackAdminUsername = fallbackAdminUsername;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Map<String, Object> attributes) {
        if (!(request instanceof ServletServerHttpRequest servletRequest)) {
            return false;
        }
        HttpSession session = servletRequest.getServletRequest().getSession(false);
        if (session == null) {
            return false;
        }
        Object userId = session.getAttribute(AuthConstants.SESSION_USER_ID);
        if (!(userId instanceof String sid) || sid.isBlank()) {
            return false;
        }
        AuthenticatedUser principal = resolve(sid);
        if (principal == null) {
            return false;
        }
        attributes.put(WS_USER, principal);
        return true;
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                               WebSocketHandler wsHandler, Exception exception) {
        // Нечего делать после рукопожатия.
    }

    /** userId из сессии → принципал: спец-случай fallback-админа или загрузка из БД. */
    private AuthenticatedUser resolve(String userId) {
        if (AuthConstants.FALLBACK_ADMIN_ID.equals(userId)) {
            return AuthConstants.fallbackAdmin(fallbackAdminUsername);
        }
        Optional<User> user = userService.findById(userId);
        return user.map(AuthenticatedUser::fromEntity).orElse(null);
    }
}
