package com.streamdesk.equipment;

import com.streamdesk.config.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Поиск оборудования: по штрихкоду (/api/equipment/barcode/{barcode}) и
 * детерминированный парсер из названия (/api/equipment/search). Перенос из backend/routes.ts.
 */
@Service
public class EquipmentSearchService {

    private static final List<String> MANUFACTURERS = List.of(
            "Sony", "Canon", "Panasonic", "Blackmagic", "ATEM", "Elgato",
            "Behringer", "TP-Link", "D-Link", "LG", "Samsung", "OTIS");

    private static final List<PortRule> EXPLICIT_COUNTS = List.of(
            new PortRule(Pattern.compile("(\\d+)\\s*(x|×)?\\s*sdi|sdi\\s*(\\d+)", Pattern.CASE_INSENSITIVE), "SDI", "SDI"),
            new PortRule(Pattern.compile("(\\d+)\\s*(x|×)?\\s*hdmi|hdmi\\s*(\\d+)", Pattern.CASE_INSENSITIVE), "HDMI", "HDMI"),
            new PortRule(Pattern.compile("(\\d+)\\s*(x|×)?\\s*(lan|ethernet|rj45)|(?:lan|ethernet|rj45)\\s*(\\d+)", Pattern.CASE_INSENSITIVE), "LAN", "LAN"),
            new PortRule(Pattern.compile("(\\d+)\\s*(x|×)?\\s*xlr|xlr\\s*(\\d+)", Pattern.CASE_INSENSITIVE), "XLR", "XLR"));

    private final EquipmentRepository repository;

    public EquipmentSearchService(EquipmentRepository repository) {
        this.repository = repository;
    }

    /** GET /api/equipment/barcode/{barcode} — по штрихкоду, иначе по inventoryNumber/serialNumber/id. */
    public Equipment findByBarcode(String barcodeRaw) {
        String barcode = barcodeRaw != null ? barcodeRaw.trim() : "";
        Equipment item = repository.findByBarcode(barcode).orElse(null);
        if (item == null) {
            String needle = normalize(barcode);
            item = repository.findAll().stream()
                    .filter(e -> List.of(normalize(e.getBarcode()), normalize(e.getInventoryNumber()),
                                    normalize(e.getSerialNumber()), normalize(e.getId())).stream()
                            .filter(s -> !s.isEmpty())
                            .anyMatch(needle::equals))
                    .findFirst()
                    .orElse(null);
        }
        if (item == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Equipment not found with this barcode");
        }
        return item;
    }

    /** POST /api/equipment/search — разбор названия в тип/производителя/модель/порты. */
    public Map<String, Object> search(String query) {
        if (query == null || query.isBlank()) {
            throw ApiException.badRequest("Query is required");
        }
        String queryLower = query.toLowerCase();

        String type = detectType(queryLower);

        // Производитель и модель.
        String[] parts = query.trim().split("\\s+");
        String manufacturer = "";
        String model = "";
        for (int i = 0; i < parts.length; i++) {
            String partLower = parts[i].toLowerCase();
            String found = MANUFACTURERS.stream().filter(m -> partLower.contains(m.toLowerCase())).findFirst().orElse(null);
            if (found != null) {
                manufacturer = found;
                if (i < parts.length - 1) {
                    model = String.join(" ", java.util.Arrays.copyOfRange(parts, i + 1, parts.length));
                }
                break;
            }
        }

        List<Map<String, Object>> portsIn = new ArrayList<>();
        List<Map<String, Object>> portsOut = new ArrayList<>();

        // Явно указанное число портов (первое сработавшее правило).
        boolean explicit = false;
        for (PortRule rule : EXPLICIT_COUNTS) {
            Matcher m = rule.pattern.matcher(queryLower);
            if (m.find()) {
                int count = firstInt(m.group(1), m.group(3));
                if (count > 0) {
                    String direction = (type.equals("camera") || type.equals("computer")) ? "out" : "in";
                    addMany(direction, portsIn, portsOut, rule.name, Math.min(count, 64), rule.type);
                    explicit = true;
                    break;
                }
            }
        }

        if (Pattern.compile("atem.*mini", Pattern.CASE_INSENSITIVE).matcher(queryLower).find()) {
            addMany("in", portsIn, portsOut, "HDMI IN ", 4, "HDMI");
            addOut(portsOut, "HDMI OUT", "HDMI");
            addIn(portsIn, "USB-C", "USB");
            addIn(portsIn, "LAN", "LAN");
            addIn(portsIn, "MIC 1", "3.5mm");
            addIn(portsIn, "MIC 2", "3.5mm");
        } else if (find(queryLower, "atem.*(television|studio|constellation|sdi)")) {
            addMany("in", portsIn, portsOut, "SDI IN ", 8, "SDI");
            addMany("out", portsIn, portsOut, "SDI OUT ", 4, "SDI");
            addIn(portsIn, "LAN", "LAN");
        } else if (type.equals("camera")) {
            if (!explicit) {
                if (find(queryLower, "sdi|broadcast|studio|ursa|fx6|fx9|c300|c500|ag-")) {
                    addOut(portsOut, "SDI", "SDI");
                }
                if (find(queryLower, "hdmi|a7|alpha|canon|lumix|gh\\d|bmpcc|pocket|zv-") || portsOut.isEmpty()) {
                    addOut(portsOut, "HDMI", "HDMI");
                }
            }
            addIn(portsIn, "DC", "DC");
        } else if (type.equals("computer")) {
            if (!explicit) {
                addOut(portsOut, "HDMI", "HDMI");
                addOut(portsOut, "DisplayPort", "DisplayPort");
            }
            addIn(portsIn, "LAN", "LAN");
            addIn(portsIn, "USB", "USB");
        } else if (type.equals("network")) {
            if (!explicit) {
                int count = find(queryLower, "24") ? 24 : find(queryLower, "16") ? 16 : 8;
                addMany("in", portsIn, portsOut, "LAN", count, "LAN");
            }
            addIn(portsIn, "Uplink", "LAN");
            addIn(portsIn, "Power", "DC");
        } else if (type.equals("display")) {
            if (!explicit) {
                addIn(portsIn, "HDMI 1", "HDMI");
                addIn(portsIn, "HDMI 2", "HDMI");
            }
            addIn(portsIn, "USB", "USB");
        } else if (type.equals("audio") || type.equals("mic")) {
            if (type.equals("mic")) {
                addOut(portsOut, "XLR", "XLR");
            } else {
                addMany("in", portsIn, portsOut, "XLR IN ", 4, "XLR");
                addMany("out", portsIn, portsOut, "XLR OUT ", 2, "XLR");
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("name", query.trim());
        result.put("manufacturer", manufacturer.isEmpty() ? null : manufacturer);
        result.put("model", model.isEmpty() ? null : model);
        result.put("type", type);
        result.put("portsIn", portsIn);
        result.put("portsOut", portsOut);
        result.put("specifications", new LinkedHashMap<>());

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("results", List.of(result));
        return response;
    }

    // --- helpers ---

    private String detectType(String q) {
        if (q.contains("камера") || q.contains("camera")) return "camera";
        if (q.contains("микрофон") || q.contains("mic")) return "mic";
        if (q.contains("микшер") || q.contains("mixer")) return "audio";
        if (q.contains("роутер") || q.contains("router") || q.contains("switch")) return "network";
        if (q.contains("монитор") || q.contains("monitor") || q.contains("телевизор") || q.contains("tv")) return "display";
        return "computer";
    }

    private void addIn(List<Map<String, Object>> portsIn, String name, String portType) {
        portsIn.add(port("in-" + (portsIn.size() + 1), name, "in", portType));
    }

    private void addOut(List<Map<String, Object>> portsOut, String name, String portType) {
        portsOut.add(port("out-" + (portsOut.size() + 1), name, "out", portType));
    }

    private void addMany(String direction, List<Map<String, Object>> portsIn, List<Map<String, Object>> portsOut,
                         String prefix, int count, String portType) {
        for (int i = 1; i <= count; i++) {
            if ("in".equals(direction)) {
                addIn(portsIn, prefix + i, portType);
            } else {
                addOut(portsOut, prefix + i, portType);
            }
        }
    }

    private Map<String, Object> port(String id, String name, String type, String portType) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id);
        m.put("name", name);
        m.put("type", type);
        m.put("portType", portType);
        return m;
    }

    private boolean find(String text, String regex) {
        return Pattern.compile(regex, Pattern.CASE_INSENSITIVE).matcher(text).find();
    }

    private int firstInt(String a, String b) {
        Integer v = parseOrNull(a);
        if (v == null) {
            v = parseOrNull(b);
        }
        return v != null ? v : 0;
    }

    private Integer parseOrNull(String s) {
        if (s == null) {
            return null;
        }
        try {
            return Integer.parseInt(s.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String normalize(String value) {
        return value != null ? value.trim().toLowerCase() : "";
    }

    private record PortRule(Pattern pattern, String name, String type) {
    }
}
