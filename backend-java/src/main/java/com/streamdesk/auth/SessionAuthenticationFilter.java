package com.streamdesk.auth;

import com.streamdesk.user.User;
import com.streamdesk.user.UserService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Заполняет SecurityContext из сессии — прямой аналог Express-middleware на /api,
 * которое читало req.session.userId и клало пользователя в req.user.
 *
 * Сессию не создаёт (getSession(false)); если userId нет — запрос остаётся анонимным,
 * а доступ решает SecurityConfig.
 */
@Component
public class SessionAuthenticationFilter extends OncePerRequestFilter {

    private final UserService userService;
    private final String fallbackAdminUsername;

    public SessionAuthenticationFilter(
            UserService userService,
            @Value("${app.auth.admin-username:admin}") String fallbackAdminUsername) {
        this.userService = userService;
        this.fallbackAdminUsername = fallbackAdminUsername;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {

        HttpSession session = request.getSession(false);
        if (session != null) {
            Object userId = session.getAttribute(AuthConstants.SESSION_USER_ID);
            if (userId instanceof String sid && !sid.isBlank()) {
                // Всегда перечитываем пользователя из БД по userId сессии и перезаписываем
                // Authentication. Нельзя полагаться на SecurityContext, который Spring Security
                // сохраняет в HTTP-сессии: иначе роль/права/состояние онбординга «замерзают»
                // на момент входа, а при смене аккаунта в том же браузере (регистрация поверх
                // старой сессии) запрос остаётся под прежним принципалом.
                AuthenticatedUser principal = resolve(sid);
                var context = SecurityContextHolder.getContext();
                if (principal != null) {
                    context.setAuthentication(
                            new UsernamePasswordAuthenticationToken(principal, null, authorities(principal)));
                } else {
                    context.setAuthentication(null);
                }
            }
        }
        chain.doFilter(request, response);
    }

    /** Превращает userId из сессии в принципала: спец-случай fallback-админа или загрузка из БД. */
    private AuthenticatedUser resolve(String userId) {
        if (AuthConstants.FALLBACK_ADMIN_ID.equals(userId)) {
            return AuthConstants.fallbackAdmin(fallbackAdminUsername);
        }
        Optional<User> user = userService.findById(userId);
        // Забаненный пользователь трактуется как неаутентифицированный — его активные сессии
        // перестают работать сразу после бана.
        return user.filter(u -> !Boolean.TRUE.equals(u.getBanned()))
                .map(AuthenticatedUser::fromEntity)
                .orElse(null);
    }

    /** ROLE_<role> + по одной authority на каждое разрешение (для будущих @PreAuthorize). */
    private List<GrantedAuthority> authorities(AuthenticatedUser principal) {
        List<GrantedAuthority> auths = new ArrayList<>();
        if (principal.role() != null && !principal.role().isBlank()) {
            auths.add(new SimpleGrantedAuthority("ROLE_" + principal.role().toUpperCase()));
        }
        if (principal.permissions() != null) {
            principal.permissions().forEach(p -> auths.add(new SimpleGrantedAuthority(p)));
        }
        return auths;
    }
}