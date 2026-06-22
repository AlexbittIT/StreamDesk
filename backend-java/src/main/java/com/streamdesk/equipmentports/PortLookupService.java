package com.streamdesk.equipmentports;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.streamdesk.ai.DeepSeekClient;
import com.streamdesk.config.ApiException;
import com.streamdesk.connectionschema.validation.ConnectorTypes;
import com.streamdesk.equipment.Equipment;
import com.streamdesk.equipment.EquipmentRepository;
import com.streamdesk.equipmentports.dto.ApproveDeviceRequest;
import com.streamdesk.equipmentports.dto.DeviceDiscoveryResponse;
import com.streamdesk.equipmentports.dto.DiscoveredDevice;
import com.streamdesk.equipmentports.dto.PortLookupResponse;
import com.streamdesk.equipmentports.dto.UnmappedResolveRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Поиск/кэш портов оборудования (Task 2).
 *
 * Поток (см. docs/ai_port_lookup_pipeline_v2.png):
 *   lookup(производитель, модель)
 *     ├─ кэш confirmed?           → мгновенно вернуть (source=cache)
 *     └─ иначе → DeepSeek (промпт со ВСЕМ справочником разъёмов из {@link ConnectorTypes})
 *                → серверная валидация кодов по справочнику
 *                     ├─ код есть   → порт с каноническим кодом
 *                     └─ кода нет    → в очередь {@link UnmappedTerm} (НЕ угадываем, НЕ теряем)
 *                → upsert кэша со status=pending_review + provenance → вернуть (source=ai)
 *   человек подтверждает (confirm → confirmed, кэш навсегда) либо правит руками (updatePorts).
 *
 * Источник портов — знания модели DeepSeek (без реального веб-fetch в v1), поэтому
 * provenance = source_model + fetched_at + confidence; source_url пока null.
 */
@Service
public class PortLookupService {

    private static final String PORT_RULES = """
            Правила:
            - portType — ТОЛЬКО код из справочника ниже (канон). Свободные обозначения
              сопоставляй через синонимы в скобках.
            - Если разъём из спеки НЕ находится в справочнике — НЕ угадывай и НЕ создавай
              для него порт: помести исходное обозначение строкой в unmappedTerms.
            - Если оборудование модульное (слоты/карты расширения) — поставь
              configurablePorts=true и НЕ перечисляй порты слотов (их добавят вручную).
            - Не выдумывай порты, которых нет у модели. confidence — уверенность 0..1.
            Типы нод (deviceType): computer, camera, mic, lighting, network, video,
            display, splitter, extender, input, cable, signal.
            Справочник разъёмов (portType):
            """;

    private static final String PORT_SYSTEM_PROMPT = """
            Ты инженер AV/IT. По «производитель + модель» устройства верни ТОЛЬКО валидный
            JSON-объект (json), без markdown и пояснений, строго по схеме:
            {
              "deviceType":"camera",
              "configurablePorts":false,
              "confidence":0.0,
              "portsIn":[{"name":"SDI IN","portType":"SDI"}],
              "portsOut":[{"name":"HDMI OUT","portType":"HDMI"}],
              "unmappedTerms":[]
            }
            """ + PORT_RULES + "%VOCAB%\n";

    private static final String DISCOVER_SYSTEM_PROMPT = """
            Ты инженер AV/IT. По свободному описанию опознай КОНКРЕТНУЮ модель устройства
            и верни ТОЛЬКО валидный JSON-объект (json), без markdown, строго по схеме:
            {
              "name":"Blackmagic ATEM Mini",
              "manufacturer":"Blackmagic Design",
              "model":"ATEM Mini",
              "deviceType":"video",
              "specifications":{},
              "configurablePorts":false,
              "confidence":0.0,
              "portsIn":[{"name":"HDMI IN 1","portType":"HDMI"}],
              "portsOut":[{"name":"USB-C","portType":"USB_C"}],
              "unmappedTerms":[]
            }
            Если по описанию нельзя уверенно определить модель — верни наиболее вероятную с
            низким confidence. specifications — краткие ключевые характеристики.
            """ + PORT_RULES + "%VOCAB%\n";

    private final DeepSeekClient deepSeek;
    private final ObjectMapper objectMapper;
    private final EquipmentModelPortsRepository portsRepository;
    private final UnmappedTermRepository unmappedRepository;
    private final EquipmentRepository equipmentRepository;

    public PortLookupService(DeepSeekClient deepSeek,
                             ObjectMapper objectMapper,
                             EquipmentModelPortsRepository portsRepository,
                             UnmappedTermRepository unmappedRepository,
                             EquipmentRepository equipmentRepository) {
        this.deepSeek = deepSeek;
        this.objectMapper = objectMapper;
        this.portsRepository = portsRepository;
        this.unmappedRepository = unmappedRepository;
        this.equipmentRepository = equipmentRepository;
    }

    // ---- lookup для устройства, которое уже есть на складе ----

    public PortLookupResponse lookup(String manufacturer, String model) {
        String mf = clean(manufacturer);
        String md = clean(model);
        if (mf.isEmpty() || md.isEmpty()) {
            throw ApiException.badRequest("Нужны производитель и модель");
        }

        Optional<EquipmentModelPorts> existing =
                portsRepository.findFirstByManufacturerIgnoreCaseAndModelIgnoreCase(mf, md);
        if (existing.isPresent() && EquipmentModelPorts.STATUS_CONFIRMED.equals(existing.get().getStatus())) {
            // Подтверждённый кэш — мгновенно, без обращения к ИИ.
            return new PortLookupResponse(PortLookupResponse.SOURCE_CACHE, existing.get(), List.of());
        }

        List<String> unmapped = new ArrayList<>();
        Extraction ex = extractForModel(mf, md, unmapped);

        EquipmentModelPorts row = existing.orElseGet(EquipmentModelPorts::new);
        row.setManufacturer(mf);
        row.setModel(md);
        row.setDeviceType(ex.deviceType());
        row.setPorts(buildPortsMap(ex.portsIn(), ex.portsOut()));
        row.setConfigurablePorts(ex.configurable());
        row.setStatus(EquipmentModelPorts.STATUS_PENDING);
        row.setSourceModel(deepSeek.modelName());
        row.setSourceUrl(null);
        row.setConfidence(ex.confidence());
        row.setFetchedAt(Instant.now());
        row.setReviewedBy(null);
        row.setReviewedAt(null);
        row.setUpdatedAt(Instant.now());

        EquipmentModelPorts saved = portsRepository.save(row);
        return new PortLookupResponse(PortLookupResponse.SOURCE_AI, saved, unmapped);
    }

    /** Человек подтверждает найденные ИИ порты — кэшируется навсегда. */
    public EquipmentModelPorts confirm(String id, String userId) {
        EquipmentModelPorts row = find(id);
        row.setStatus(EquipmentModelPorts.STATUS_CONFIRMED);
        row.setReviewedBy(userId);
        row.setReviewedAt(Instant.now());
        row.setUpdatedAt(Instant.now());
        return portsRepository.save(row);
    }

    /** Ручная правка портов человеком. По умолчанию — сразу confirmed (человек выверил). */
    public EquipmentModelPorts updatePorts(String id, Map<String, Object> ports, String status, String userId) {
        EquipmentModelPorts row = find(id);
        if (ports != null) {
            row.setPorts(ports);
        }
        String newStatus = (status != null && !status.isBlank())
                ? status : EquipmentModelPorts.STATUS_CONFIRMED;
        row.setStatus(newStatus);
        row.setReviewedBy(userId);
        row.setReviewedAt(Instant.now());
        row.setUpdatedAt(Instant.now());
        return portsRepository.save(row);
    }

    public List<EquipmentModelPorts> listByStatus(String status) {
        if (status == null || status.isBlank()) {
            return portsRepository.findAll();
        }
        return portsRepository.findByStatusOrderByUpdatedAtDesc(status);
    }

    // ---- device discovery: устройства нет на складе ----

    /** Опознать устройство по свободному описанию и предложить порты (на одобрение). */
    public DeviceDiscoveryResponse discover(String query) {
        String q = clean(query);
        if (q.isEmpty()) {
            throw ApiException.badRequest("Нужно описание устройства (query)");
        }
        List<String> unmapped = new ArrayList<>();
        JsonNode json = deepSeek.generateJson(vocab(DISCOVER_SYSTEM_PROMPT),
                "Описание устройства: " + q + "\nОпознай модель и определи её физические порты.");

        String mf = text(json, "manufacturer");
        String md = text(json, "model");
        collectExplicitUnmapped(json, mf, md, unmapped);
        List<Map<String, Object>> in = parsePorts(json.get("portsIn"), "in", mf, md, unmapped);
        List<Map<String, Object>> out = parsePorts(json.get("portsOut"), "out", mf, md, unmapped);

        DiscoveredDevice device = new DiscoveredDevice(
                text(json, "name"), mf, md, text(json, "deviceType"), specifications(json));
        return new DeviceDiscoveryResponse(
                device, buildPortsMap(in, out),
                json.path("configurablePorts").asBoolean(false),
                confidence(json), unmapped);
    }

    /**
     * Человек одобряет опознанное устройство: создаётся запись оборудования и
     * подтверждённый кэш портов. {@code ports} могут быть отредактированы человеком.
     */
    public Equipment approveDiscovered(ApproveDeviceRequest req, String userId) {
        if (req == null || req.device() == null || isBlank(req.device().name())) {
            throw ApiException.badRequest("Нужно устройство с названием");
        }
        DiscoveredDevice d = req.device();

        Equipment equipment = new Equipment();
        equipment.setName(d.name().trim());
        equipment.setManufacturer(emptyToNull(d.manufacturer()));
        equipment.setModel(emptyToNull(d.model()));
        equipment.setType(isBlank(d.deviceType()) ? "other" : d.deviceType());
        equipment.setSpecifications(d.specifications());
        equipment.setStatus("available");
        Equipment savedEquipment = equipmentRepository.save(equipment);

        // Кэш портов имеет смысл только при известных производителе+модели.
        String mf = clean(d.manufacturer());
        String md = clean(d.model());
        if (!mf.isEmpty() && !md.isEmpty()) {
            EquipmentModelPorts row = portsRepository
                    .findFirstByManufacturerIgnoreCaseAndModelIgnoreCase(mf, md)
                    .orElseGet(EquipmentModelPorts::new);
            row.setManufacturer(mf);
            row.setModel(md);
            row.setDeviceType(equipment.getType());
            row.setPorts(req.ports() != null ? req.ports() : new LinkedHashMap<>());
            row.setConfigurablePorts(req.configurablePorts());
            row.setStatus(EquipmentModelPorts.STATUS_CONFIRMED);
            row.setSourceModel(deepSeek.modelName());
            row.setFetchedAt(Instant.now());
            row.setReviewedBy(userId);
            row.setReviewedAt(Instant.now());
            row.setUpdatedAt(Instant.now());
            portsRepository.save(row);
        }
        return savedEquipment;
    }

    // ---- очередь неизвестных разъёмов ----

    public List<UnmappedTerm> listUnmapped(String status) {
        if (status == null || status.isBlank()) {
            return unmappedRepository.findAllByOrderByCreatedAtDesc();
        }
        return unmappedRepository.findByStatusOrderByCreatedAtDesc(status);
    }

    /**
     * Разрешение записи очереди. {@code add} — помечаем как добавленную в справочник
     * (фактическая правка connector_types.json — ручной шаг разработчика, т.к. справочник
     * это bundled-ресурс); {@code dismiss} — отклонить.
     */
    public UnmappedTerm resolveUnmapped(String id, UnmappedResolveRequest req, String userId) {
        UnmappedTerm term = unmappedRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Запись очереди не найдена"));
        String action = req != null ? req.action() : null;
        if (UnmappedResolveRequest.ACTION_ADD.equals(action)) {
            if (req.suggestedCode() == null || req.suggestedCode().isBlank()) {
                throw ApiException.badRequest("Для add нужен suggestedCode");
            }
            term.setSuggestedCode(req.suggestedCode().trim());
            term.setStatus(UnmappedTerm.STATUS_ADDED);
        } else if (UnmappedResolveRequest.ACTION_DISMISS.equals(action)) {
            term.setStatus(UnmappedTerm.STATUS_DISMISSED);
        } else {
            throw ApiException.badRequest("action должен быть add или dismiss");
        }
        term.setResolvedBy(userId);
        term.setResolvedAt(Instant.now());
        return unmappedRepository.save(term);
    }

    // ---- extraction / parsing ----

    private record Extraction(String deviceType,
                              List<Map<String, Object>> portsIn,
                              List<Map<String, Object>> portsOut,
                              boolean configurable,
                              BigDecimal confidence) {
    }

    private Extraction extractForModel(String mf, String md, List<String> unmapped) {
        JsonNode json = deepSeek.generateJson(vocab(PORT_SYSTEM_PROMPT),
                "Производитель: " + mf + "\nМодель: " + md
                        + "\nОпредели физические порты (входы и выходы) этой модели.");
        collectExplicitUnmapped(json, mf, md, unmapped);
        List<Map<String, Object>> in = parsePorts(json.get("portsIn"), "in", mf, md, unmapped);
        List<Map<String, Object>> out = parsePorts(json.get("portsOut"), "out", mf, md, unmapped);
        return new Extraction(text(json, "deviceType"), in, out,
                json.path("configurablePorts").asBoolean(false), confidence(json));
    }

    /**
     * Разбор массива портов с серверной валидацией кодов по справочнику.
     * Неизвестные коды НЕ становятся портами — уходят в очередь unmapped.
     */
    private List<Map<String, Object>> parsePorts(JsonNode arr, String direction,
                                                 String mf, String md, List<String> unmapped) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (arr == null || !arr.isArray()) {
            return out;
        }
        int i = 1;
        for (JsonNode p : arr) {
            String rawType = text(p, "portType");
            String name = text(p, "name");
            if (rawType == null || rawType.isBlank()) {
                continue;
            }
            if (!ConnectorTypes.isKnown(rawType)) {
                addUnmapped(unmapped, rawType);
                recordUnmapped(rawType, mf, md, name, direction);
                continue;
            }
            Map<String, Object> port = new LinkedHashMap<>();
            port.put("id", direction + "-" + i);
            port.put("name", (name != null && !name.isBlank()) ? name : ConnectorTypes.normalize(rawType));
            port.put("portType", ConnectorTypes.normalize(rawType));
            port.put("type", direction);
            out.add(port);
            i++;
        }
        return out;
    }

    private void collectExplicitUnmapped(JsonNode json, String mf, String md, List<String> unmapped) {
        JsonNode arr = json.get("unmappedTerms");
        if (arr == null || !arr.isArray()) {
            return;
        }
        for (JsonNode t : arr) {
            String term = t.asText("").trim();
            if (term.isEmpty() || ConnectorTypes.isKnown(term)) {
                continue;
            }
            addUnmapped(unmapped, term);
            recordUnmapped(term, mf, md, null, null);
        }
    }

    /** Кладёт неизвестное обозначение в очередь, без дублей в статусе pending. */
    private void recordUnmapped(String term, String mf, String md, String portName, String direction) {
        String t = term.trim();
        if (t.isEmpty()) {
            return;
        }
        if (unmappedRepository.findFirstByTermIgnoreCaseAndStatus(t, UnmappedTerm.STATUS_PENDING).isPresent()) {
            return;
        }
        UnmappedTerm u = new UnmappedTerm();
        u.setTerm(t);
        u.setManufacturer(emptyToNull(mf));
        u.setModel(emptyToNull(md));
        Map<String, Object> ctx = new LinkedHashMap<>();
        if (portName != null && !portName.isBlank()) {
            ctx.put("portName", portName);
        }
        if (direction != null) {
            ctx.put("direction", direction);
        }
        u.setContext(ctx);
        unmappedRepository.save(u);
    }

    private static void addUnmapped(List<String> list, String term) {
        String t = term.trim();
        if (t.isEmpty()) {
            return;
        }
        for (String existing : list) {
            if (existing.equalsIgnoreCase(t)) {
                return;
            }
        }
        list.add(t);
    }

    private Map<String, Object> buildPortsMap(List<Map<String, Object>> in, List<Map<String, Object>> out) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("portsIn", in);
        m.put("portsOut", out);
        return m;
    }

    private Map<String, Object> specifications(JsonNode json) {
        JsonNode specs = json.get("specifications");
        if (specs == null || !specs.isObject()) {
            return new LinkedHashMap<>();
        }
        return objectMapper.convertValue(specs,
                new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {
                });
    }

    private BigDecimal confidence(JsonNode json) {
        JsonNode c = json.path("confidence");
        if (!c.isNumber()) {
            return null;
        }
        double v = Math.max(0.0, Math.min(1.0, c.asDouble()));
        return BigDecimal.valueOf(v).setScale(3, RoundingMode.HALF_UP);
    }

    private EquipmentModelPorts find(String id) {
        return portsRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Запись портов не найдена"));
    }

    private static String vocab(String template) {
        return template.replace("%VOCAB%", ConnectorTypes.promptVocabulary());
    }

    private static String text(JsonNode node, String field) {
        if (node == null) {
            return null;
        }
        JsonNode v = node.get(field);
        return (v == null || v.isNull()) ? null : v.asText();
    }

    private static String clean(String value) {
        return value == null ? "" : value.trim();
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static String emptyToNull(String value) {
        String v = clean(value);
        return v.isEmpty() ? null : v;
    }
}
