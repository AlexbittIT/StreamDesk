package com.streamdesk.config;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Health-check — порт GET /api/health из backend/routes.ts.
 * Открыт без авторизации (см. SecurityConfig). stubMode всегда false: Java работает с реальной БД.
 */
@RestController
public class HealthController {

    @GetMapping("/api/health")
    public Map<String, Object> health() {
        return Map.of("ok", true, "stubMode", false);
    }
}