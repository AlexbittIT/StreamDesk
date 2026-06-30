package com.streamdesk.e2e;

import com.fasterxml.jackson.databind.JsonNode;
import com.streamdesk.config.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.Map;

import static org.hamcrest.Matchers.greaterThan;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * E2E AI-генерации схемы через HTTP (/api/connection-schemas/ai-schema) с мокнутым DeepSeek.
 *
 * Дополняет юнит-тест AiSchemaServiceTest на уровне всего стека: ответ модели проходит
 * серверную валидацию — невалидные связи (out→out, несовпадение типов) отбрасываются,
 * итоговая схема ok=true, а сбой AI пробрасывается явной ошибкой без молчаливого фолбэка.
 */
class AiSchemaHttpE2ETest extends AbstractE2ETest {

    // Три связи: валидна только SDI→SDI (in-1). Type-mismatch (SDI→XLR) и out→out отбрасываются.
    private static final String AI_JSON = """
            {
              "nodes": [
                {"id":"cam","type":"camera","name":"Камера",
                 "portsIn":[],
                 "portsOut":[{"id":"out-1","type":"out","portType":"SDI"}]},
                {"id":"mixer","type":"video","name":"Видеомикшер",
                 "portsIn":[{"id":"in-1","type":"in","portType":"SDI"},{"id":"in-2","type":"in","portType":"XLR"}],
                 "portsOut":[{"id":"out-1","type":"out","portType":"HDMI"}]}
              ],
              "connections": [
                {"fromDeviceId":"cam","fromPortId":"out-1","toDeviceId":"mixer","toPortId":"in-1","cableType":"SDI"},
                {"fromDeviceId":"cam","fromPortId":"out-1","toDeviceId":"mixer","toPortId":"in-2","cableType":"SDI"},
                {"fromDeviceId":"cam","fromPortId":"out-1","toDeviceId":"mixer","toPortId":"out-1","cableType":"HDMI"}
              ]
            }
            """;

    @Test
    void aiSchema_returnsValidatedSchema_dropsInvalidConnections() throws Exception {
        JsonNode node = objectMapper.readTree(AI_JSON);
        when(deepSeekClient.generateJson(anyString(), anyString())).thenReturn(node);

        mockMvc.perform(post("/api/connection-schemas/ai-schema").with(as(admin()))
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("prompt", "камера + видеомикшер"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.source").value("ai"))
                .andExpect(jsonPath("$.nodes.length()").value(2))
                // из трёх связей остаётся одна валидная (SDI→SDI)
                .andExpect(jsonPath("$.connections.length()").value(1))
                .andExpect(jsonPath("$.validation.ok").value(true))
                // причины отброса прозрачно перечислены, а не молча исправлены
                .andExpect(jsonPath("$.dropped.length()", greaterThan(0)));
    }

    @Test
    void aiSchema_propagatesAiFailureWithoutFallback() throws Exception {
        when(deepSeekClient.generateJson(anyString(), anyString()))
                .thenThrow(new ApiException(HttpStatus.BAD_GATEWAY, "AI не ответил"));

        mockMvc.perform(post("/api/connection-schemas/ai-schema").with(as(admin()))
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("prompt", "камера"))))
                .andExpect(status().isBadGateway());
    }
}
