package com.streamdesk.equipmentports;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.streamdesk.ai.DeepSeekClient;
import com.streamdesk.equipment.EquipmentRepository;
import com.streamdesk.equipmentports.dto.PortLookupResponse;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Поиск портов (Task 2): известные коды маппятся на справочник, неизвестные уходят в
 * очередь (НЕ становятся портами), подтверждённый кэш отдаётся без обращения к ИИ.
 */
class PortLookupServiceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    // SDI известен справочнику, MADI — нет (должен уйти в unmapped и не стать портом).
    private static final String AI_JSON = """
            {
              "deviceType":"camera",
              "configurablePorts":false,
              "confidence":0.82,
              "portsIn":[{"name":"Power","portType":"POWER"}],
              "portsOut":[{"name":"SDI OUT","portType":"SDI"},{"name":"MADI OUT","portType":"MADI"}],
              "unmappedTerms":[]
            }
            """;

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> portsOf(EquipmentModelPorts row, String key) {
        return (List<Map<String, Object>>) row.getPorts().get(key);
    }

    @Test
    void freshLookupMapsKnownAndQueuesUnknown() throws Exception {
        JsonNode node = objectMapper.readTree(AI_JSON);
        DeepSeekClient deepSeek = mock(DeepSeekClient.class);
        when(deepSeek.generateJson(anyString(), anyString())).thenReturn(node);
        when(deepSeek.modelName()).thenReturn("deepseek-chat");

        EquipmentModelPortsRepository portsRepo = mock(EquipmentModelPortsRepository.class);
        when(portsRepo.findFirstByManufacturerIgnoreCaseAndModelIgnoreCase(anyString(), anyString()))
                .thenReturn(Optional.empty());
        when(portsRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        UnmappedTermRepository unmappedRepo = mock(UnmappedTermRepository.class);
        when(unmappedRepo.findFirstByTermIgnoreCaseAndStatus(anyString(), anyString()))
                .thenReturn(Optional.empty());
        when(unmappedRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        EquipmentRepository equipmentRepo = mock(EquipmentRepository.class);

        PortLookupService service =
                new PortLookupService(deepSeek, objectMapper, portsRepo, unmappedRepo, equipmentRepo);

        PortLookupResponse res = service.lookup("Sony", "HXC-FB80");

        assertEquals(PortLookupResponse.SOURCE_AI, res.source());
        EquipmentModelPorts row = res.result();
        assertEquals(EquipmentModelPorts.STATUS_PENDING, row.getStatus());
        assertEquals("deepseek-chat", row.getSourceModel());

        // POWER + SDI прошли, MADI отброшен
        assertEquals(1, portsOf(row, "portsIn").size(), "POWER должен пройти");
        assertEquals(1, portsOf(row, "portsOut").size(), "только SDI; MADI отброшен");
        assertEquals("SDI", portsOf(row, "portsOut").get(0).get("portType"));

        assertTrue(res.unmappedTerms().contains("MADI"), "MADI должен быть в unmapped: " + res.unmappedTerms());
        // MADI поставлен в очередь на ручное добавление
        verify(unmappedRepo).save(any());
    }

    @Test
    void confirmedCacheReturnsWithoutCallingAi() {
        EquipmentModelPorts cached = new EquipmentModelPorts();
        cached.setManufacturer("Sony");
        cached.setModel("HXC-FB80");
        cached.setStatus(EquipmentModelPorts.STATUS_CONFIRMED);

        DeepSeekClient deepSeek = mock(DeepSeekClient.class);
        EquipmentModelPortsRepository portsRepo = mock(EquipmentModelPortsRepository.class);
        when(portsRepo.findFirstByManufacturerIgnoreCaseAndModelIgnoreCase(eq("Sony"), eq("HXC-FB80")))
                .thenReturn(Optional.of(cached));
        UnmappedTermRepository unmappedRepo = mock(UnmappedTermRepository.class);
        EquipmentRepository equipmentRepo = mock(EquipmentRepository.class);

        PortLookupService service =
                new PortLookupService(deepSeek, objectMapper, portsRepo, unmappedRepo, equipmentRepo);

        PortLookupResponse res = service.lookup("Sony", "HXC-FB80");

        assertEquals(PortLookupResponse.SOURCE_CACHE, res.source());
        assertTrue(res.unmappedTerms().isEmpty());
        // подтверждённый кэш — ИИ не дёргаем, новую запись не сохраняем
        verify(deepSeek, never()).generateJson(anyString(), anyString());
        verify(portsRepo, never()).save(any());
    }

    @Test
    void confirmMarksConfirmedAndReviewer() {
        EquipmentModelPorts row = new EquipmentModelPorts();
        row.setStatus(EquipmentModelPorts.STATUS_PENDING);

        DeepSeekClient deepSeek = mock(DeepSeekClient.class);
        EquipmentModelPortsRepository portsRepo = mock(EquipmentModelPortsRepository.class);
        when(portsRepo.findById(eq("row-1"))).thenReturn(Optional.of(row));
        when(portsRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        UnmappedTermRepository unmappedRepo = mock(UnmappedTermRepository.class);
        EquipmentRepository equipmentRepo = mock(EquipmentRepository.class);

        PortLookupService service =
                new PortLookupService(deepSeek, objectMapper, portsRepo, unmappedRepo, equipmentRepo);

        EquipmentModelPorts confirmed = service.confirm("row-1", "user-42");

        assertEquals(EquipmentModelPorts.STATUS_CONFIRMED, confirmed.getStatus());
        assertEquals("user-42", confirmed.getReviewedBy());
        assertFalse(confirmed.getReviewedAt() == null, "reviewedAt должен проставиться");
    }
}
