package com.streamdesk.estimate;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.streamdesk.ai.DeepSeekClient;
import com.streamdesk.config.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * ИИ-подбор позиций (SD-157): строки помечаются source="ai", а сбой ИИ —
 * типизированная ошибка без молчаливого фолбэка (ретраи живут в DeepSeekClient,
 * здесь он замокан).
 */
class EstimateAiServiceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final EstimateMatchingService matching = new EstimateMatchingService();

    private static final String AI_JSON = """
            {"items":[
              {"name":"Цифровой микшерный пульт","type":"audio","model":"X32","quantity":1,"unitPrice":4550,"reason":"Сведение","confidence":0.8},
              {"name":"Ручная радиосистема","type":"microphone","quantity":4,"reason":"Спикеры","confidence":0.7}
            ]}
            """;

    @Test
    void parsesItemsAndTagsThemAsAi() throws Exception {
        JsonNode node = objectMapper.readTree(AI_JSON);
        DeepSeekClient client = mock(DeepSeekClient.class);
        when(client.isConfigured()).thenReturn(true);
        when(client.generateJson(anyString(), anyString())).thenReturn(node);

        EstimateAiService service = new EstimateAiService(client, matching);
        List<RequirementItem> items = service.suggest("Смета", "конференция со спикерами", "конференция", List.of());

        assertEquals(2, items.size());
        assertTrue(items.stream().allMatch(i -> "ai".equals(i.source())), "все позиции ИИ помечены source=ai");
        assertEquals("audio", items.get(0).type());
        assertEquals(4, items.get(1).quantity());
    }

    @Test
    void aiFailurePropagatesAsTypedErrorWithoutFallback() {
        DeepSeekClient client = mock(DeepSeekClient.class);
        when(client.isConfigured()).thenReturn(true);
        when(client.generateJson(anyString(), anyString()))
                .thenThrow(new ApiException(HttpStatus.BAD_GATEWAY, "AI не ответил"));

        EstimateAiService service = new EstimateAiService(client, matching);
        // никакого молчаливого фолбэка — типизированная ошибка пробрасывается
        assertThrows(ApiException.class,
                () -> service.suggest("Смета", "любое ТЗ", "вечеринка", List.of()));
    }

    @Test
    void blankNamesAreSkipped() throws Exception {
        JsonNode node = objectMapper.readTree("{\"items\":[{\"name\":\"  \",\"type\":\"audio\"},{\"name\":\"Сабвуфер\",\"type\":\"audio\"}]}");
        DeepSeekClient client = mock(DeepSeekClient.class);
        when(client.isConfigured()).thenReturn(true);
        when(client.generateJson(anyString(), anyString())).thenReturn(node);

        EstimateAiService service = new EstimateAiService(client, matching);
        List<RequirementItem> items = service.suggest("Смета", "концерт", "вечеринка", List.of());

        assertEquals(1, items.size());
        assertEquals("Сабвуфер", items.get(0).name());
        assertFalse(items.get(0).name().isBlank());
    }
}
