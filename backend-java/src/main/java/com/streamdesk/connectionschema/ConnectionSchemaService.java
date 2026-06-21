package com.streamdesk.connectionschema;

import com.streamdesk.config.ApiException;
import com.streamdesk.connectionschema.dto.ComponentRequest;
import com.streamdesk.connectionschema.dto.SchemaRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
}
