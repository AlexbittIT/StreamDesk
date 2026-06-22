package com.streamdesk.terminal;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingResponseWrapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;

/**
 * Пишет строку лога на каждый /api-запрос — порт middleware из backend/index.ts:
 * "[ISO] METHOD path status in Xms :: {json}" (обрезка до 80). Логин/логаут без тела.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TerminalRequestLogFilter extends OncePerRequestFilter {

    private final TerminalLogBuffer buffer;

    public TerminalRequestLogFilter(TerminalLogBuffer buffer) {
        this.buffer = buffer;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getRequestURI();
        if (!path.startsWith("/api")) {
            chain.doFilter(request, response);
            return;
        }

        long start = System.currentTimeMillis();
        ContentCachingResponseWrapper wrapped = new ContentCachingResponseWrapper(response);
        try {
            chain.doFilter(request, wrapped);
        } finally {
            long duration = System.currentTimeMillis() - start;
            String logLine = request.getMethod() + " " + path + " " + wrapped.getStatus() + " in " + duration + "ms";

            boolean isAuthPath = "/api/auth/login".equals(path) || "/api/auth/logout".equals(path);
            byte[] body = wrapped.getContentAsByteArray();
            if (body.length > 0 && !isAuthPath) {
                logLine += " :: " + new String(body, StandardCharsets.UTF_8);
            }
            if (logLine.length() > 80) {
                logLine = logLine.substring(0, 79) + "…";
            }
            buffer.add("[" + Instant.now() + "] " + logLine);

            wrapped.copyBodyToResponse();
        }
    }
}
