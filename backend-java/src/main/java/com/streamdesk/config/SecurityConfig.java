package com.streamdesk.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.streamdesk.auth.SessionAuthenticationFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfigurationSource;

import java.util.Map;

/**
 * Настройка Spring Security под cookie-сессии (как express-session).
 *
 * - /api/auth/login, /register, /logout и /api/health — открыты;
 * - остальные /api/** требуют авторизованную сессию;
 * - пользователя в контекст кладёт SessionAuthenticationFilter из HttpSession;
 * - вместо редиректа на форму логина при 401 отдаём JSON { message } — как у Express.
 */
@Configuration
public class SecurityConfig {

    private final SessionAuthenticationFilter sessionAuthenticationFilter;
    private final CorsConfigurationSource corsConfigurationSource;

    public SecurityConfig(SessionAuthenticationFilter sessionAuthenticationFilter,
                          CorsConfigurationSource corsConfigurationSource) {
        this.sessionAuthenticationFilter = sessionAuthenticationFilter;
        this.corsConfigurationSource = corsConfigurationSource;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .cors(cors -> cors.configurationSource(corsConfigurationSource))
                // CSRF выключен — это REST API для SPA (как в текущем Express).
                .csrf(AbstractHttpConfigurer::disable)
                // Сессию создаём сами в AuthController; Spring её не навязывает.
                // sessionFixation().none() — НЕ менять id сессии на каждом запросе:
                // кастомный SessionAuthenticationFilter «аутентифицирует» из сессии каждый запрос,
                // из-за чего Spring по умолчанию ротировал session id на каждом ответе. При
                // параллельных запросах SPA (переключение вкладок) это вызывало гонку и 401 → разлогин.
                .sessionManagement(sm -> sm
                        .sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED)
                        .sessionFixation(sf -> sf.none()))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(
                                "/api/auth/login",
                                "/api/auth/register",
                                "/api/auth/logout",
                                "/api/health",
                                "/api/auth/telegram",
                                "/api/auth/telegram/**",
                                "/api/agents/**",
                                "/api/company-invites/resolve/**"
                        ).permitAll()
                        // Сборка смет — только для авторизованных (внутри ещё проверяется
                        // доступ к рабочему пространству). Явное правило для /api/estimates/**.
                        .requestMatchers("/api/estimates/**").authenticated()
                        .requestMatchers("/api/**").authenticated()
                        .anyRequest().permitAll()
                )
                // Никаких форм/Basic — только наша сессия.
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .exceptionHandling(eh -> eh.authenticationEntryPoint(jsonAuthEntryPoint()))
                .addFilterBefore(sessionAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    /** При отсутствии авторизации отдаём 401 с JSON { message }, а не редирект. */
    private AuthenticationEntryPoint jsonAuthEntryPoint() {
        ObjectMapper mapper = new ObjectMapper();
        return (request, response, authException) -> {
            response.setStatus(HttpStatus.UNAUTHORIZED.value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding("UTF-8");
            mapper.writeValue(response.getWriter(), Map.of("message", "Требуется авторизация"));
        };
    }

    /**
     * BCrypt с тем же cost-фактором (12), что и SALT_ROUNDS в backend/auth.ts.
     * Понимает существующие хеши формата $2a/$2b — пароли пользователей перевыпускать не нужно.
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }
}