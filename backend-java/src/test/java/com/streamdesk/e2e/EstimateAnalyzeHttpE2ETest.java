package com.streamdesk.e2e;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.hamcrest.Matchers.greaterThan;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * E2E сборки сметы через HTTP (POST /api/estimates/analyze, multipart) — закрывает
 * «дыру», описанную в e2e-scenarios.md (эндпоинт теперь реализован в backend-java).
 *
 * Проверяет: гейт доступа к рабочему пространству, локальную сборку при недоступном ИИ
 * (DeepSeek мокнут, isConfigured=false → source="heuristic", без молчаливого падения),
 * и явную 503 при requireAi=true без ключа.
 */
class EstimateAnalyzeHttpE2ETest extends AbstractE2ETest {

    private static final String TZ =
            "Конференция на день: 3 камеры, видеомикшер, 4 радиомикрофона, 2 экрана, "
            + "коммутация и сеть, запись и трансляция";

    @Test
    void analyze_buildsEstimateForWorkspaceUser() throws Exception {
        // admin всегда имеет доступ к рабочему пространству (hasWorkspaceAccess).
        mockMvc.perform(multipart("/api/estimates/analyze").with(as(admin()))
                        .param("title", "Смета конференции")
                        .param("text", TZ))
                .andExpect(status().isOk())
                // ИИ не настроен (мок) → честный локальный источник, не «тихий шаблон»
                .andExpect(jsonPath("$.source").value("heuristic"))
                .andExpect(jsonPath("$.items.length()", greaterThan(0)))
                .andExpect(jsonPath("$.totals.subtotal").exists());
    }

    @Test
    void analyze_forbiddenWithoutWorkspaceAccess() throws Exception {
        // Обычный пользователь без компании — нет доступа к рабочему пространству.
        var outsider = user("outsider-1", "user", List.of());
        mockMvc.perform(multipart("/api/estimates/analyze").with(as(outsider))
                        .param("text", TZ))
                .andExpect(status().isForbidden());
    }

    @Test
    void analyze_requireAiWithoutKey_returns503() throws Exception {
        // requireAi=true, но DeepSeek не настроен → явная 503, а не молчаливый фолбэк.
        mockMvc.perform(multipart("/api/estimates/analyze").with(as(admin()))
                        .param("text", TZ)
                        .param("requireAi", "true"))
                .andExpect(status().isServiceUnavailable());
    }
}
