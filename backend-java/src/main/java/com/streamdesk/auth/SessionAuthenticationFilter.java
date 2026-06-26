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
        if (session != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            Object userId = session.getAttribute(AuthConstants.SESSION_USER_ID);
            if (userId instanceof String sid && !sid.isBlank()) {
                AuthenticatedUser principal = resolve(sid);
                if (principal != null) {
                    var auth = new UsernamePasswordAuthenticationToken(principal, null, authorities(principal));
                    SecurityContextHolder.getContext().setAuthentication(auth);
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
        return user.map(AuthenticatedUser::fromEntity).orElse(null);
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