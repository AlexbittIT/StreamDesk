package com.streamdesk.e2e;

import com.streamdesk.auth.AuthenticatedUser;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.hamcrest.Matchers.hasItem;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * E2E критического пути «схемы подключения» через HTTP:
 * создать схему → добавить компоненты с портами → добавить соединения → провалидировать.
 *
 * Проверяет сервеную валидацию связей сквозь контроллер и JPA (jsonb-хранение портов и
 * связей): валидная OUT→IN проходит (200), нарушение направления (out→out) и несовпадение
 * типов портов отклоняются (422 с кодами), а итоговая схема из одной валидной связи — ok.
 * Это дополняет юнит-тест ConnectionValidatorTest на уровне всего стека, а не правил в вакууме.
 */
class ConnectionSchemaFlowE2ETest extends AbstractE2ETest {

    @Test
    void buildValidateFlow_acceptsValid_rejectsDirectionAndTypeMismatch() throws Exception {
        AuthenticatedUser admin = admin();

        // 1. Создаём схему.
        String schemaJson = mockMvc.perform(post("/api/connection-schemas").with(as(admin))
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("name", "E2E схема"))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String schemaId = objectMapper.readTree(schemaJson).get("id").asText();

        // 2. Компоненты с портами: камера (OUT HDMI), микшер (IN HDMI, IN XLR, OUT HDMI).
        String camId = createComponent(admin, schemaId, "camera", "Камера",
                List.of(), List.of(port("out-1", "out", "HDMI")));
        String mixerId = createComponent(admin, schemaId, "video", "Видеомикшер",
                List.of(port("in-1", "in", "HDMI"), port("in-2", "in", "XLR")),
                List.of(port("out-1", "out", "HDMI")));

        // 3. Валидная связь: OUT HDMI → IN HDMI — сохраняется (200, с присвоенным id).
        mockMvc.perform(post("/api/connection-schemas/{id}/connections", schemaId).with(as(admin))
                        .contentType(APPLICATION_JSON)
                        .content(connection(camId, "out-1", mixerId, "in-1", "HDMI")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").exists());

        // 4. Нарушение направления: OUT → OUT — отклоняется (422, ERR_DIRECTION).
        mockMvc.perform(post("/api/connection-schemas/{id}/connections", schemaId).with(as(admin))
                        .contentType(APPLICATION_JSON)
                        .content(connection(camId, "out-1", mixerId, "out-1", "HDMI")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.ok").value(false))
                .andExpect(jsonPath("$.violations[*].code", hasItem("ERR_DIRECTION")));

        // 5. Несовпадение типов портов: HDMI OUT → XLR IN — отклоняется (422, ERR_TYPE_MISMATCH).
        mockMvc.perform(post("/api/connection-schemas/{id}/connections", schemaId).with(as(admin))
                        .contentType(APPLICATION_JSON)
                        .content(connection(camId, "out-1", mixerId, "in-2", "HDMI")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.violations[*].code", hasItem("ERR_TYPE_MISMATCH")));

        // 6. /validate: сохранена только валидная связь → схема корректна (ok=true).
        mockMvc.perform(post("/api/connection-schemas/{id}/validate", schemaId).with(as(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true));
    }

    /** Создаёт компонент с портами и возвращает его id (для адресации в связях). */
    private String createComponent(AuthenticatedUser user, String schemaId, String type, String name,
                                   List<Map<String, Object>> portsIn,
                                   List<Map<String, Object>> portsOut) throws Exception {
        Map<String, Object> body = Map.of(
                "type", type,
                "name", name,
                "properties", Map.of("portsIn", portsIn, "portsOut", portsOut));
        String json = mockMvc.perform(post("/api/connection-schemas/{schemaId}/components", schemaId).with(as(user))
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(json).get("id").asText();
    }

    private Map<String, Object> port(String id, String direction, String portType) {
        return Map.of("id", id, "type", direction, "portType", portType);
    }

    private String connection(String fromDeviceId, String fromPortId,
                              String toDeviceId, String toPortId, String cableType) throws Exception {
        return objectMapper.writeValueAsString(Map.of(
                "fromDeviceId", fromDeviceId,
                "fromPortId", fromPortId,
                "toDeviceId", toDeviceId,
                "toPortId", toPortId,
                "cableType", cableType));
    }
}
