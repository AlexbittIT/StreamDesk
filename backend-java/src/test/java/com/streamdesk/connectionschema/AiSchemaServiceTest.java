package com.streamdesk.connectionschema;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.streamdesk.ai.DeepSeekClient;
import com.streamdesk.config.ApiException;
import com.streamdesk.connectionschema.dto.AiSchemaRequest;
import com.streamdesk.connectionschema.dto.AiSchemaResponse;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * AI-генерация схемы: возвращаемая схема проходит серверную валидацию
 * (невалидные связи AI отбрасываются), а при сбое AI — явная ошибка без фолбэка.
 */
class AiSchemaServiceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

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
    void returnsValidatedSchemaAndDropsInvalidConnections() throws Exception {
        JsonNode node = objectMapper.readTree(AI_JSON);
        DeepSeekClient client = mock(DeepSeekClient.class);
        when(client.generateJson(anyString(), anyString())).thenReturn(node);

        AiSchemaService service = new AiSchemaService(client, objectMapper);
        AiSchemaResponse res = service.generate(new AiSchemaRequest("камера + видеомикшер", null));

        assertEquals("ai", res.source());
        assertEquals(2, res.nodes().size());
        // из трёх связей валидна только SDI→SDI (in-1); type-mismatch и out→out отброшены
        assertEquals(1, res.connections().size(), "должна остаться одна валидная связь");
        assertTrue(res.validation().ok(), "итоговая схема обязана проходить валидацию");
        assertFalse(res.dropped().isEmpty(), "причины отброса должны быть прозрачно перечислены");
    }

    @Test
    void aiFailurePropagatesAsErrorWithoutFallback() {
        DeepSeekClient client = mock(DeepSeekClient.class);
        when(client.generateJson(anyString(), anyString()))
                .thenThrow(new ApiException(org.springframework.http.HttpStatus.BAD_GATEWAY, "AI не ответил"));

        AiSchemaService service = new AiSchemaService(client, objectMapper);
        // никакого молчаливого фолбэка на шаблон — ошибка пробрасывается
        assertThrows(ApiException.class,
                () -> service.generate(new AiSchemaRequest("камера", null)));
    }
}
