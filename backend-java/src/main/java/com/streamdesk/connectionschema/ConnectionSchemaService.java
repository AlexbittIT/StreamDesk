package com.streamdesk.connectionschema;

import com.streamdesk.config.ApiException;
import com.streamdesk.connectionschema.dto.ComponentRequest;
import com.streamdesk.connectionschema.dto.ConnectionRequest;
import com.streamdesk.connectionschema.dto.SchemaRequest;
import com.streamdesk.connectionschema.validation.BuildResult;
import com.streamdesk.connectionschema.validation.ConnectionValidator;
import com.streamdesk.connectionschema.validation.ConnectorTypes;
import com.streamdesk.connectionschema.validation.ValidationResult;
import com.streamdesk.connectionschema.validation.Violation;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Логика схем подключения — перенос /api/connection-schemas из backend/routes.ts.
 * ai-generate — детерминированная генерация компонентов по ключевым словам (не внешний AI).
 */
@Service
public class ConnectionSchemaService {

    private final ConnectionSchemaRepository schemaRepository;
    private final ConnectionSchemaComponentRepository componentRepository;

    public ConnectionSchemaService(ConnectionSchemaRepository schemaRepository,
                                   ConnectionSchemaComponentRepository componentRepository) {
        this.schemaRepository = schemaRepository;
        this.componentRepository = componentRepository;
    }

    public List<ConnectionSchema> list() {
        return schemaRepository.findByOrderByCreatedAtDesc();
    }

    /** GET /api/connection-schemas/{id} — схема вместе с компонентами. */
    public Map<String, Object> getWithComponents(String id) {
        ConnectionSchema schema = schemaRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Schema not found"));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", schema.getId());
        result.put("name", schema.getName());
        result.put("description", schema.getDescription());
        result.put("createdAt", schema.getCreatedAt());
        result.put("updatedAt", schema.getUpdatedAt());
        result.put("components", componentRepository.findBySchemaIdOrderByCreatedAt(id));
        return result;
    }

    @Transactional
    public ConnectionSchema createSchema(SchemaRequest req) {
        if (isBlank(req.name())) {
            throw ApiException.badRequest("Name is required");
        }
        ConnectionSchema schema = new ConnectionSchema();
        schema.setName(req.name());
        schema.setDescription(req.description());
        return schemaRepository.save(schema);
    }

    @Transactional
    public ConnectionSchema updateSchema(String id, SchemaRequest req) {
        ConnectionSchema schema = schemaRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Schema not found"));
        if (!isBlank(req.name())) {
            schema.setName(req.name());
        }
        if (req.description() != null) {
            schema.setDescription(req.description());
        }
        schema.setUpdatedAt(Instant.now());
        return schemaRepository.save(schema);
    }

    @Transactional
    public void deleteSchema(String id) {
        if (!schemaRepository.existsById(id)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Schema not found");
        }
        componentRepository.deleteBySchemaId(id);
        schemaRepository.deleteById(id);
    }

    // --- components ---

    @Transactional
    public ConnectionSchemaComponent createComponent(String schemaId, ComponentRequest req) {
        if (isBlank(req.type()) || isBlank(req.name())) {
            throw ApiException.badRequest("Type and name are required");
        }
        ConnectionSchemaComponent component = new ConnectionSchemaComponent();
        component.setSchemaId(schemaId);
        component.setType(req.type());
        component.setName(req.name());
        component.setPosition(req.position() != null ? req.position() : Map.of("x", 0, "y", 0));
        component.setProperties(req.properties() != null ? req.properties() : new LinkedHashMap<>());
        component.setConnections(req.connections() != null ? req.connections() : new ArrayList<>());
        return componentRepository.save(component);
    }

    @Transactional
    public ConnectionSchemaComponent updateComponent(String id, ComponentRequest req) {
        ConnectionSchemaComponent component = componentRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Component not found"));
        if (!isBlank(req.type())) {
            component.setType(req.type());
        }
        if (!isBlank(req.name())) {
            component.setName(req.name());
        }
        if (req.position() != null) {
            component.setPosition(req.position());
        }
        if (req.properties() != null) {
            component.setProperties(req.properties());
        }
        if (req.connections() != null) {
            component.setConnections(req.connections());
        }
        component.setUpdatedAt(Instant.now());
        return componentRepository.save(component);
    }

    @Transactional
    public void deleteComponent(String id) {
        if (!componentRepository.existsById(id)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Component not found");
        }
        componentRepository.deleteById(id);
    }

    // --- ai-generate (детерминированная генерация компонентов) ---

    @Transactional
    public Map<String, Object> aiGenerate(String schemaId, String promptInput) {
        ConnectionSchema schema = schemaRepository.findById(schemaId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Схема не найдена"));

        String prompt = firstNonBlank(promptInput, schema.getDescription(), schema.getName(), "").trim();
        List<String> searchTerms = Arrays.stream(prompt.split("[,;\\n]+"))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .limit(18)
                .toList();
        List<String> terms = searchTerms.isEmpty()
                ? List.of("камера", "микрофон", "видеомикшер", "компьютер трансляции", "роутер")
                : searchTerms;

        List<ConnectionSchemaComponent> created = new ArrayList<>();
        for (int index = 0; index < terms.size(); index++) {
            String term = terms.get(index);
            String lower = term.toLowerCase();
            String type = detectType(lower);

            List<Map<String, Object>> portsIn = new ArrayList<>();
            List<Map<String, Object>> portsOut = new ArrayList<>();
            buildPorts(lower, type, portsIn, portsOut);

            Map<String, Object> properties = new LinkedHashMap<>();
            properties.put("source", "ai-assistant");
            properties.put("portsIn", portsIn);
            properties.put("portsOut", portsOut);

            Map<String, Object> position = new LinkedHashMap<>();
            position.put("x", 80 + (index % 3) * 320);
            position.put("y", 90 + (index / 3) * 150);

            ConnectionSchemaComponent component = new ConnectionSchemaComponent();
            component.setSchemaId(schemaId);
            component.setType(type);
            component.setName(term);
            component.setPosition(position);
            component.setProperties(properties);
            component.setConnections(new ArrayList<>());
            created.add(componentRepository.save(component));
        }

        boolean aiAvailable = !isBlank(System.getenv("HUGGINGFACE_API_KEY")) || !isBlank(System.getenv("HF_TOKEN"));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("created", created);
        result.put("aiAvailable", aiAvailable);
        return result;
    }

    private String detectType(String lower) {
        if (find(lower, "камера|camera")) return "camera";
        if (find(lower, "микрофон|mic")) return "mic";
        if (find(lower, "свет|light")) return "lighting";
        if (find(lower, "router|switch|роутер|сеть|lan")) return "network";
        if (find(lower, "atem|микшер|коммутатор|switcher")) return "video";
        if (find(lower, "монитор|экран|display")) return "display";
        return "computer";
    }

    private void buildPorts(String lower, String type,
                            List<Map<String, Object>> portsIn, List<Map<String, Object>> portsOut) {
        if (find(lower, "atem.*mini")) {
            for (int n = 1; n <= 4; n++) addPort(portsIn, "in", "HDMI IN " + n, "HDMI");
            addPort(portsOut, "out", "HDMI OUT", "HDMI");
            addPort(portsIn, "in", "LAN", "LAN");
            addPort(portsIn, "in", "USB-C", "USB");
        } else if (find(lower, "atem|switcher|видеомикшер|коммутатор")) {
            for (int n = 1; n <= 8; n++) addPort(portsIn, "in", "SDI IN " + n, "SDI");
            for (int n = 1; n <= 4; n++) addPort(portsOut, "out", "SDI OUT " + n, "SDI");
            addPort(portsIn, "in", "LAN", "LAN");
        } else if (type.equals("camera")) {
            if (find(lower, "sdi|studio|broadcast")) addPort(portsOut, "out", "SDI", "SDI");
            addPort(portsOut, "out", "HDMI", "HDMI");
            addPort(portsIn, "in", "DC", "DC");
        } else if (type.equals("network")) {
            int count = find(lower, "24") ? 24 : find(lower, "16") ? 16 : 8;
            for (int i = 1; i <= count; i++) addPort(portsIn, "in", "LAN" + i, "LAN");
        } else if (type.equals("mic")) {
            addPort(portsOut, "out", "XLR", "XLR");
        } else if (type.equals("display")) {
            addPort(portsIn, "in", "HDMI 1", "HDMI");
            addPort(portsIn, "in", "HDMI 2", "HDMI");
        } else {
            addPort(portsIn, "in", "LAN", "LAN");
            addPort(portsOut, "out", "HDMI", "HDMI");
        }
    }

    private void addPort(List<Map<String, Object>> ports, String direction, String name, String portType) {
        Map<String, Object> port = new LinkedHashMap<>();
        port.put("id", direction + "-" + (ports.size() + 1));
        port.put("name", name);
        port.put("type", direction);
        port.put("portType", portType);
        ports.add(port);
    }

    private boolean find(String text, String regex) {
        return Pattern.compile(regex, Pattern.CASE_INSENSITIVE).matcher(text).find();
    }

    private String firstNonBlank(String... values) {
        for (String v : values) {
            if (v != null && !v.isBlank()) {
                return v;
            }
        }
        return "";
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    // --- connections: валидация и хранение связей (Sprint 2) ---

    /** Компоненты схемы, индексированные по id. */
    private Map<String, ConnectionSchemaComponent> componentsById(String schemaId) {
        Map<String, ConnectionSchemaComponent> byId = new LinkedHashMap<>();
        for (ConnectionSchemaComponent c : componentRepository.findBySchemaIdOrderByCreatedAt(schemaId)) {
            byId.put(c.getId(), c);
        }
        return byId;
    }

    /** Все связи схемы (хранятся в connections каждого компонента). */
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> allConnections(Map<String, ConnectionSchemaComponent> byId) {
        List<Map<String, Object>> all = new ArrayList<>();
        for (ConnectionSchemaComponent c : byId.values()) {
            List<Object> list = c.getConnections();
            if (list == null) {
                continue;
            }
            for (Object item : list) {
                if (item instanceof Map<?, ?> map) {
                    all.add((Map<String, Object>) map);
                }
            }
        }
        return all;
    }

    /** POST /{schemaId}/connections — проверка одной новой связи по правилам контракта. */
    public ValidationResult validateConnection(String schemaId, ConnectionRequest req) {
        if (req == null || isBlank(req.fromDeviceId()) || isBlank(req.fromPortId())
                || isBlank(req.toDeviceId()) || isBlank(req.toPortId())) {
            throw ApiException.badRequest("Нужны fromDeviceId, fromPortId, toDeviceId, toPortId");
        }
        Map<String, ConnectionSchemaComponent> byId = componentsById(schemaId);
        List<Map<String, Object>> existing = allConnections(byId);
        return ValidationResult.of(ConnectionValidator.validate(req, byId, existing));
    }

    /** Сохраняет валидную связь в connections компонента-источника, возвращает её с id. */
    @Transactional
    public Map<String, Object> persistConnection(String schemaId, ConnectionRequest req) {
        ConnectionSchemaComponent from = componentRepository.findById(req.fromDeviceId())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Компонент-источник не найден"));

        Map<String, Object> conn = new LinkedHashMap<>();
        conn.put("id", UUID.randomUUID().toString());
        conn.put("fromDeviceId", req.fromDeviceId());
        conn.put("fromPortId", req.fromPortId());
        conn.put("toDeviceId", req.toDeviceId());
        conn.put("toPortId", req.toPortId());
        conn.put("cableType", req.cableType());
        conn.put("protocol", req.protocol());

        List<Object> list = from.getConnections() != null ? from.getConnections() : new ArrayList<>();
        list.add(conn);
        from.setConnections(list);
        from.setUpdatedAt(Instant.now());
        componentRepository.save(from);
        return conn;
    }

    /** DELETE /connections/{id} — удаляет связь из компонента, где она хранится. */
    @Transactional
    public void deleteConnection(String connectionId) {
        for (ConnectionSchemaComponent c : componentRepository.findAll()) {
            List<Object> list = c.getConnections();
            if (list == null || list.isEmpty()) {
                continue;
            }
            boolean removed = list.removeIf(o ->
                    o instanceof Map<?, ?> m && connectionId.equals(String.valueOf(m.get("id"))));
            if (removed) {
                c.setConnections(list);
                c.setUpdatedAt(Instant.now());
                componentRepository.save(c);
                return;
            }
        }
        throw new ApiException(HttpStatus.NOT_FOUND, "Connection not found");
    }

    /** POST /{id}/validate — прогон правил по всем связям схемы. */
    public ValidationResult validateSchema(String schemaId) {
        Map<String, ConnectionSchemaComponent> byId = componentsById(schemaId);
        List<Map<String, Object>> all = allConnections(byId);
        List<Violation> violations = new ArrayList<>();
        for (Map<String, Object> conn : all) {
            ConnectionRequest req = toRequest(conn);
            List<Map<String, Object>> others = all.stream().filter(x -> x != conn).toList();
            violations.addAll(ConnectionValidator.validate(req, byId, others));
        }
        return ValidationResult.of(violations);
    }

    /** POST /{id}/build — проверка целостности схемы + краткий вердикт. */
    public BuildResult buildSchema(String schemaId) {
        ValidationResult vr = validateSchema(schemaId);
        String summary = vr.ok()
                ? "Схема корректна: нарушений не найдено."
                : "Найдено нарушений: " + vr.violations().size();
        return new BuildResult(vr.ok(), vr.violations(), summary);
    }

    /** GET /connector-types — справочник типов разъёмов. */
    public List<ConnectorTypes.ConnectorType> connectorTypes() {
        return ConnectorTypes.all();
    }

    private ConnectionRequest toRequest(Map<String, Object> conn) {
        return new ConnectionRequest(
                asString(conn.get("fromDeviceId")),
                asString(conn.get("fromPortId")),
                asString(conn.get("toDeviceId")),
                asString(conn.get("toPortId")),
                asString(conn.get("cableType")),
                asString(conn.get("protocol"))
        );
    }

    private static String asString(Object value) {
        return value == null ? null : String.valueOf(value);
    }
}
