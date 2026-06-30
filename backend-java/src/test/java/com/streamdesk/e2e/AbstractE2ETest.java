package com.streamdesk.e2e;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.streamdesk.ai.DeepSeekClient;
import com.streamdesk.auth.AuthenticatedUser;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.util.ArrayList;
import java.util.List;

/**
 * База для E2E-тестов через HTTP-слой: полный контекст Spring Boot на in-memory H2
 * (профиль "test") + MockMvc. Тесты проверяют реальную цепочку контроллер → сервис →
 * валидация/JPA, чтобы падать при поломке бизнес-логики, а не только мапперов.
 *
 * Аутентификация подменяется напрямую в SecurityContext (как это делает
 * SessionAuthenticationFilter из сессии) — без поднятия реального логина.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public abstract class AbstractE2ETest {

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected ObjectMapper objectMapper;

    /**
     * DeepSeek мокаем во всех E2E: реальная сеть/ключ не нужны, а конкретное поведение
     * AI задаётся точечно в тесте AI-генерации.
     */
    @MockitoBean
    protected DeepSeekClient deepSeekClient;

    /** Строит principal-пользователя — то же, что AuthenticatedUser.fromEntity, но без БД. */
    protected static AuthenticatedUser user(String id, String role, List<String> permissions) {
        return new AuthenticatedUser(
                id, id, id, id + "@test.local", null, role, null,
                permissions != null ? permissions : new ArrayList<>(),
                true, true, "company_member", false);
    }

    /** Admin всегда имеет доступ к рабочему пространству (hasWorkspaceAccess). */
    protected static AuthenticatedUser admin() {
        return user("admin-e2e", "admin", List.of());
    }

    /** RequestPostProcessor, кладущий принципала в SecurityContext запроса. */
    protected static RequestPostProcessor as(AuthenticatedUser principal) {
        List<GrantedAuthority> auths = new ArrayList<>();
        if (principal.role() != null && !principal.role().isBlank()) {
            auths.add(new SimpleGrantedAuthority("ROLE_" + principal.role().toUpperCase()));
        }
        if (principal.permissions() != null) {
            principal.permissions().forEach(p -> auths.add(new SimpleGrantedAuthority(p)));
        }
        return SecurityMockMvcRequestPostProcessors.authentication(
                new UsernamePasswordAuthenticationToken(principal, "n/a", auths));
    }
}
