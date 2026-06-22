package com.streamdesk;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Точка входа Spring Boot — аналог backend/index.ts в текущем (TypeScript) бэкенде.
 */
@SpringBootApplication
public class StreamDeskApplication {

    public static void main(String[] args) {
        SpringApplication.run(StreamDeskApplication.class, args);
    }
}