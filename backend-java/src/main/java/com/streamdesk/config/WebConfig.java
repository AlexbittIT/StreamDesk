package com.streamdesk.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

import java.io.IOException;
import java.nio.file.Paths;
import java.util.List;

/**
 * CORS для SPA + отдача загруженных файлов (/uploads/**) + раздача собранного фронта (SPA) с fallback.
 * Один Java-сервер отдаёт и сайт, и /api. Список CORS-источников — в application.yml.
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    /** Папка собранного фронта (vite build -> dist/public). Относительно cwd (backend-java). */
    @Value("${app.spa-dir:../dist/public}")
    private String spaDir;

    /** Корень "/" -> index.html (SPA). */
    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        registry.addViewController("/").setViewName("forward:/index.html");
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // Загруженные файлы (фото оборудования, аватары, чат, транскрипции).
        String uploadsPath = Paths.get(System.getProperty("user.dir"), "uploads").toUri().toString();
        registry.addResourceHandler("/uploads/**").addResourceLocations(uploadsPath);

        // Собранный фронт: статика + fallback на index.html для client-side роутинга.
        String spaLocation = Paths.get(System.getProperty("user.dir")).resolve(spaDir).normalize().toUri().toString();
        registry.addResourceHandler("/**")
                .addResourceLocations(spaLocation)
                .resourceChain(true)
                .addResolver(new PathResourceResolver() {
                    @Override
                    protected Resource getResource(String resourcePath, Resource location) throws IOException {
                        Resource requested = location.createRelative(resourcePath);
                        if (requested.exists() && requested.isReadable()) {
                            return requested;
                        }
                        // /api и /uploads обрабатываются отдельно — не подменяем их на index.html.
                        if (resourcePath.startsWith("api/") || resourcePath.startsWith("uploads/")) {
                            return null;
                        }
                        // SPA-роуты (например /dashboard, /equipment) -> index.html.
                        Resource index = location.createRelative("index.html");
                        return index.exists() && index.isReadable() ? index : null;
                    }
                });
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource(
            @Value("${app.cors.allowed-origins}") List<String> allowedOrigins) {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(allowedOrigins);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        // Обязательно для cookie-сессий: браузер шлёт streamdesk.sid только при credentials=true.
        config.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
