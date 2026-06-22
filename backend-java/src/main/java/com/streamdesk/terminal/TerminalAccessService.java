package com.streamdesk.terminal;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Кто может смотреть Терминал. Перенос backend/terminal-access.ts.
 * Хранится в .terminal-access.json (иначе env TERMINAL_ALLOWED_ROLES, дефолт ["admin"]).
 */
@Service
public class TerminalAccessService {

    private static final Logger log = LoggerFactory.getLogger(TerminalAccessService.class);

    private final File file = new File(System.getProperty("user.dir"), ".terminal-access.json");
    private final ObjectMapper objectMapper = new ObjectMapper();

    @SuppressWarnings("unchecked")
    public List<String> getAllowedRoles() {
        if (file.exists()) {
            try {
                Map<String, Object> data = objectMapper.readValue(file, Map.class);
                Object roles = data.get("allowedRoles");
                if (roles instanceof List<?> list) {
                    List<String> result = list.stream()
                            .filter(r -> r instanceof String && !((String) r).isBlank())
                            .map(Object::toString)
                            .toList();
                    if (!result.isEmpty()) {
                        return result;
                    }
                }
            } catch (IOException e) {
                log.warn("[Terminal] Не удалось прочитать {}: {}", file.getName(), e.getMessage());
            }
        }
        String fromEnv = System.getenv("TERMINAL_ALLOWED_ROLES");
        if (fromEnv != null && !fromEnv.isBlank()) {
            List<String> roles = Arrays.stream(fromEnv.split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .collect(Collectors.toList());
            if (!roles.isEmpty()) {
                return roles;
            }
        }
        return List.of("admin");
    }

    public void setAllowedRoles(List<String> roles) {
        List<String> normalized = roles == null ? List.of() : roles.stream()
                .filter(r -> r != null && !r.isBlank())
                .map(String::trim)
                .toList();
        List<String> toStore = normalized.isEmpty() ? List.of("admin") : normalized;
        try {
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(file, Map.of("allowedRoles", toStore));
        } catch (IOException e) {
            log.warn("[Terminal] Не удалось записать {}: {}", file.getName(), e.getMessage());
        }
    }

    public boolean canView(String role) {
        return role != null && getAllowedRoles().contains(role);
    }
}
