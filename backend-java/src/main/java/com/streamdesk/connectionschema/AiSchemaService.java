package com.streamdesk.connectionschema;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.streamdesk.ai.DeepSeekClient;
import com.streamdesk.config.ApiException;
import com.streamdesk.connectionschema.dto.AiSchemaRequest;
import com.streamdesk.connectionschema.dto.AiSchemaResponse;
import com.streamdesk.connectionschema.dto.ConnectionRequest;
import com.streamdesk.connectionschema.validation.ConnectionValidator;
import com.streamdesk.connectionschema.validation.ConnectorTypes;
import com.streamdesk.connectionschema.validation.ValidationResult;
import com.streamdesk.connectionschema.validation.Violation;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * AI-генерация схемы подключения через DeepSeek.
 *
 * Поток: ТЗ/оборудование → промпт → DeepSeek (строгий JSON, ретраи) → разбор
 * нод и связей → серверная валидация связей (переиспользует {@link ConnectionValidator}).
 * Невалидные связи отбрасываются с указанием причины (поле dropped), так что
 * ВОЗВРАЩАЕМАЯ схема гарантированно проходит валидацию. Фолбэка на шаблон нет:
 * при сбое AI {@link DeepSeekClient} кидает явную ошибку.
 */
@Service
public class AiSchemaService {

    private static final String SYSTEM_PROMPT = buildSystemPrompt();

    /**
     * Системный промпт собирается из справочника разъёмов ({@link ConnectorTypes}) —
     * единого источника истины, а не из захардкоженного списка. Модель обязана
     * вернуть portType КОДОМ из справочника (канон), сопоставляя свободные
     * обозначения через перечисленные синонимы.
     */
    private static String buildSystemPrompt() {
        return """
                Ты инженер аудио-видео и IT, проектируешь схему подключения оборудования.
                Верни ТОЛЬКО валидный JSON-объект (json), без markdown и пояснений, строго по схеме:
                {
                  "nodes": [
                    {"id":"n1","type":"camera","name":"Камера 1","position":{"x":80,"y":90},
                     "portsIn":[{"id":"in-1","name":"Power","type":"in","portType":"POWER"}],
                     "portsOut":[{"id":"out-1","name":"SDI OUT","type":"out","portType":"SDI"}]}
                  ],
                  "connections": [
                    {"fromDeviceId":"n1","fromPortId":"out-1","toDeviceId":"n2","toPortId":"in-1","cableType":"SDI"}
                  ]
                }
                Правила: связь идёт ТОЛЬКО из выходного порта (out) во входной (in);
                типы разъёмов (portType) у соединяемых портов должны совпадать; используй
                только те id портов, что объявлены у нод; один входной порт принимает один кабель.
                Типы нод: computer, camera, mic, lighting, network, video, display, splitter, extender, input, cable, signal.
                Типы разъёмов (portType) — используй ТОЛЬКО код из справочника ниже (канон),
                сопоставляя свободные обозначения через синонимы в скобках:
                """ + ConnectorTypes.promptVocabulary() + "\n";
    }

    private final DeepSeekClient deepSeek;
    private final ObjectMapper objectMapper;

    public AiSchemaService(DeepSeekClient deepSeek, ObjectMapper objectMapper) {
        this.deepSeek = deepSeek;
        this.objectMapper = objectMapper;
    }

    public AiSchemaResponse generate(AiSchemaRequest req) {
        String userPrompt = buildUserPrompt(req);
        // Бросает явную ошибку при сбое/исчерпании ретраев — без молчаливого фолбэка.
        JsonNode json = deepSeek.generateJson(SYSTEM_PROMPT, userPrompt);

        List<Map<String, Object>> nodes = toMaps(json.get("nodes"));
        List<Map<String, Object>> rawConnections = toMaps(json.get("connections"));
        if (nodes.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "AI не вернул ни одной ноды");
        }
        normalizeNodes(nodes);

        Map<String, ConnectionSchemaComponent> byId = buildComponents(nodes);

        // Принимаем только связи, прошедшие валидацию; занятость учитываем накопительно.
        List<Map<String, Object>> accepted = new ArrayList<>();
        List<Violation> dropped = new ArrayList<>();
        for (Map<String, Object> conn : rawConnections) {
            List<Violation> v = ConnectionValidator.validate(toConnectionRequest(conn), byId, accepted);
            if (v.isEmpty()) {
                if (conn.get("id") == null) {
                    conn.put("id", UUID.randomUUID().toString());
                }
                accepted.add(conn);
            } else {
                dropped.addAll(v);
            }
        }

        // Контрольная проверка итоговой схемы — гарантируем ok=true.
        List<Violation> finalViolations = new ArrayList<>();
        for (Map<String, Object> conn : accepted) {
            List<Map<String, Object>> others = accepted.stream().filter(x -> x != conn).toList();
            finalViolations.addAll(ConnectionValidator.validate(toConnectionRequest(conn), byId, others));
        }

        return new AiSchemaResponse("ai", nodes, accepted, ValidationResult.of(finalViolations), dropped);
    }

    private String buildUserPrompt(AiSchemaRequest req) {
        StringBuilder sb = new StringBuilder();
        if (req != null && req.prompt() != null && !req.prompt().isBlank()) {
            sb.append("Техническое задание:\n").append(req.prompt().trim()).append("\n\n");
        }
        if (req != null && req.equipment() != null && !req.equipment().isEmpty()) {
            sb.append("Доступное оборудование (используй как ноды):\n");
            for (AiSchemaRequest.EquipmentInput e : req.equipment()) {
                sb.append("- ").append(nz(e.name()));
                if (e.type() != null && !e.type().isBlank()) {
                    sb.append(" [").append(e.type()).append("]");
                }
                if (e.model() != null && !e.model().isBlank()) {
                    sb.append(" ").append(e.model());
                }
                sb.append("\n");
            }
        }
        if (sb.length() == 0) {
            throw ApiException.badRequest("Нужно ТЗ (prompt) или список оборудования (equipment)");
        }
        sb.append("\nСпроектируй связную схему подключения: добавь нужные узлы ")
                .append("(микшер, коммутатор, компьютер трансляции, сеть и т.п.) и кабели между ними. ")
                .append("Верни строгий JSON.");
        return sb.toString();
    }

    private List<Map<String, Object>> toMaps(JsonNode node) {
        if (node == null || !node.isArray()) {
            return new ArrayList<>();
        }
        return objectMapper.convertValue(node, new TypeReference<List<Map<String, Object>>>() {
        });
    }

    private void normalizeNodes(List<Map<String, Object>> nodes) {
        int i = 0;
        for (Map<String, Object> n : nodes) {
            if (n.get("id") == null || String.valueOf(n.get("id")).isBlank()) {
                n.put("id", "n" + (i + 1));
            }
            if (n.get("type") == null) {
                n.put("type", "computer");
            }
            if (n.get("name") == null) {
                n.put("name", String.valueOf(n.getOrDefault("type", "Узел")));
            }
            if (!(n.get("position") instanceof Map)) {
                Map<String, Object> pos = new LinkedHashMap<>();
                pos.put("x", 80 + (i % 3) * 320);
                pos.put("y", 90 + (i / 3) * 170);
                n.put("position", pos);
            }
            if (!(n.get("portsIn") instanceof List)) {
                n.put("portsIn", new ArrayList<>());
            }
            if (!(n.get("portsOut") instanceof List)) {
                n.put("portsOut", new ArrayList<>());
            }
            i++;
        }
    }

    private Map<String, ConnectionSchemaComponent> buildComponents(List<Map<String, Object>> nodes) {
        Map<String, ConnectionSchemaComponent> byId = new LinkedHashMap<>();
        for (Map<String, Object> n : nodes) {
            ConnectionSchemaComponent c = new ConnectionSchemaComponent();
            c.setId(String.valueOf(n.get("id")));
            c.setType(String.valueOf(n.getOrDefault("type", "computer")));
            c.setName(String.valueOf(n.getOrDefault("name", "")));
            Map<String, Object> props = new LinkedHashMap<>();
            props.put("portsIn", n.get("portsIn"));
            props.put("portsOut", n.get("portsOut"));
            c.setProperties(props);
            byId.put(c.getId(), c);
        }
        return byId;
    }

    private ConnectionRequest toConnectionRequest(Map<String, Object> conn) {
        return new ConnectionRequest(
                str(conn.get("fromDeviceId")),
                str(conn.get("fromPortId")),
                str(conn.get("toDeviceId")),
                str(conn.get("toPortId")),
                str(conn.get("cableType")),
                str(conn.get("protocol"))
        );
    }

    private static String str(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private static String nz(String value) {
        return value == null ? "" : value;
    }
}
