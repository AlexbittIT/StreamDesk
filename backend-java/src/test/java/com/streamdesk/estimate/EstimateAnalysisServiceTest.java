package com.streamdesk.estimate;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.streamdesk.ai.DeepSeekClient;
import com.streamdesk.config.ApiException;
import com.streamdesk.equipment.Equipment;
import com.streamdesk.estimate.dto.EstimateAnalyzeRequest;
import com.streamdesk.estimate.dto.EstimateLine;
import com.streamdesk.estimate.dto.EstimateResult;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Интеграция сборки сметы: индикатор source на строках, ветка «без цены» → дефицит,
 * различие смет на разных ТЗ и типизированная ошибка при requireAi + сбое ИИ.
 */
class EstimateAnalysisServiceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    private EstimateAnalysisService service(DeepSeekClient client) {
        CatalogService catalog = new CatalogService();
        EstimateMatchingService matching = new EstimateMatchingService();
        EstimateAiService ai = new EstimateAiService(client, matching);
        return new EstimateAnalysisService(catalog, matching, ai,
                new LocalRequirementPlanner(), new ShiftCalculator(), new FileTextExtractor());
    }

    private EstimateAnalyzeRequest request(String text, String eventType, boolean requireAi) {
        return new EstimateAnalyzeRequest("Тестовая смета", text, requireAi, eventType,
                null, null, null, null, null, null, null,
                null, null, null, null, null, null);
    }

    private JsonNode aiItems(String json) {
        try {
            return objectMapper.readTree(json);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    @Test
    void linesCarrySourceIndicatorAiAndLocal() throws Exception {
        DeepSeekClient client = mock(DeepSeekClient.class);
        when(client.isConfigured()).thenReturn(true);
        when(client.generateJson(anyString(), anyString())).thenReturn(aiItems(
                "{\"items\":[{\"name\":\"Сабвуфер L-Acoustics SB18\",\"type\":\"audio\",\"quantity\":2,\"unitPrice\":4550,\"reason\":\"Низ\",\"confidence\":0.8}]}"));

        EstimateResult result = service(client).analyze(
                request("Конференция со спикерами, презентации, трансляция", "конференция", false),
                null, List.of());

        assertEquals("ai", result.source(), "если ИИ задействован — источник сметы ai");
        Set<String> sources = result.items().stream().map(EstimateLine::source).collect(Collectors.toSet());
        assertTrue(sources.contains("ai"), "позиция ИИ должна нести source=ai");
        assertTrue(sources.contains("local"), "локальные позиции должны нести source=local");
    }

    @Test
    void noPriceItemGoesIntoMissing() throws Exception {
        // Склад содержит хейзер без цены; ИИ просит хейзер → строка no_price → в дефиците.
        DeepSeekClient client = mock(DeepSeekClient.class);
        when(client.isConfigured()).thenReturn(true);
        when(client.generateJson(anyString(), anyString())).thenReturn(aiItems(
                "{\"items\":[{\"name\":\"Хейзер\",\"type\":\"effects\",\"quantity\":1,\"reason\":\"Атмосфера\"}]}"));

        List<Equipment> equipment = List.of(
                EstimateTestFixtures.equipmentNoPrice("e1", "Хейзер", "effects", "", "available"));

        EstimateResult result = service(client).analyze(
                request("Вечеринка с дымом и светом", "вечеринка", false), null, equipment);

        EstimateLine hazer = result.items().stream()
                .filter(l -> l.type().equals("effects"))
                .findFirst().orElseThrow();
        assertEquals("no_price", hazer.priceStatus());
        assertTrue(result.missing().stream().anyMatch(m -> m.name().equals(hazer.name())),
                "позиция без цены должна попасть в дефицит (missing)");
    }

    @Test
    void differentBriefsProduceDifferentEstimates() {
        // ИИ выключен — различия дают локальный планировщик и текст ТЗ.
        DeepSeekClient client = mock(DeepSeekClient.class);
        when(client.isConfigured()).thenReturn(false);
        EstimateAnalysisService svc = service(client);

        EstimateResult party = svc.analyze(
                request("Вечеринка, диджей, концерт на сцене, мощный звук, сабвуферы, свет и дым", "вечеринка", false),
                null, List.of());
        EstimateResult conference = svc.analyze(
                request("Конференция, спикеры, доклады, презентации, петличные микрофоны, экран", "конференция", false),
                null, List.of());
        EstimateResult shoot = svc.analyze(
                request("Съёмка, камеры, оператор, запись, рекордер, видеомикшер", "съёмка", false),
                null, List.of());

        Set<String> partyNames = names(party);
        Set<String> confNames = names(conference);
        Set<String> shootNames = names(shoot);

        assertNotEqualSets(partyNames, confNames, "вечеринка ≠ конференция");
        assertNotEqualSets(partyNames, shootNames, "вечеринка ≠ съёмка");
        assertNotEqualSets(confNames, shootNames, "конференция ≠ съёмка");

        // Профильные маркеры: у вечеринки/концерта есть сабвуфер, у конференции —
        // презентер/кликер (уникален для конференц-блока, не схлопывается дедупом).
        assertTrue(party.items().stream().anyMatch(l -> l.name().toLowerCase().contains("сабвуфер")));
        assertTrue(conference.items().stream().anyMatch(l -> l.name().toLowerCase().contains("презентер")));
    }

    @Test
    void requireAiFailureThrowsTypedError() {
        DeepSeekClient client = mock(DeepSeekClient.class);
        when(client.isConfigured()).thenReturn(true);
        when(client.generateJson(anyString(), anyString()))
                .thenThrow(new ApiException(HttpStatus.BAD_GATEWAY, "AI не ответил"));

        EstimateAnalysisService svc = service(client);
        assertThrows(ApiException.class, () -> svc.analyze(
                request("Конференция", "конференция", true), null, List.of()),
                "requireAi=true и сбой ИИ → ApiException без фолбэка");
    }

    @Test
    void requireAiWithoutSilentFallbackUsesLocalWhenNotRequired() {
        // requireAi=false и сбой ИИ → тихий фолбэк на локальный подбор, без исключения.
        DeepSeekClient client = mock(DeepSeekClient.class);
        when(client.isConfigured()).thenReturn(true);
        when(client.generateJson(anyString(), anyString()))
                .thenThrow(new ApiException(HttpStatus.BAD_GATEWAY, "AI не ответил"));

        EstimateResult result = service(client).analyze(
                request("Конференция со спикерами", "конференция", false), null, List.of());

        assertEquals("heuristic", result.source());
        assertFalse(result.items().isEmpty(), "локальный план собрал позиции несмотря на сбой ИИ");
        assertTrue(result.items().stream().allMatch(l -> "local".equals(l.source())));
    }

    private static Set<String> names(EstimateResult result) {
        return result.items().stream().map(l -> l.name().toLowerCase()).collect(Collectors.toSet());
    }

    private static void assertNotEqualSets(Set<String> a, Set<String> b, String message) {
        assertFalse(a.equals(b), message);
    }
}
