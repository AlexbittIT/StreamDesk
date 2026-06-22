package com.streamdesk.connectionschema.validation;

import com.streamdesk.connectionschema.ConnectionSchemaComponent;
import com.streamdesk.connectionschema.dto.ConnectionRequest;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Правила валидации соединений (acceptance criteria S2):
 * отклоняются in→in, out→out, несовместимый тип, занятый порт; OUT→IN совместимого
 * типа проходит; коды совпадают с контрактом docs/openapi.yaml.
 */
class ConnectionValidatorTest {

    private Map<String, Object> port(String id, String direction, String portType) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("id", id);
        p.put("type", direction);
        p.put("portType", portType);
        return p;
    }

    private ConnectionSchemaComponent device(String id, List<Map<String, Object>> portsIn,
                                             List<Map<String, Object>> portsOut) {
        ConnectionSchemaComponent c = new ConnectionSchemaComponent();
        c.setId(id);
        c.setType("video");
        c.setName(id);
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("portsIn", portsIn);
        props.put("portsOut", portsOut);
        c.setProperties(props);
        return c;
    }

    private Map<String, ConnectionSchemaComponent> schema(ConnectionSchemaComponent... cs) {
        Map<String, ConnectionSchemaComponent> m = new LinkedHashMap<>();
        for (ConnectionSchemaComponent c : cs) {
            m.put(c.getId(), c);
        }
        return m;
    }

    private boolean has(List<Violation> violations, String code) {
        return violations.stream().anyMatch(v -> v.code().equals(code));
    }

    // Камера: OUT HDMI; Микшер: IN HDMI(in-1), IN XLR(in-2), OUT HDMI(out-1)
    private Map<String, ConnectionSchemaComponent> sampleSchema() {
        ConnectionSchemaComponent cam = device("cam",
                List.of(port("in-1", "in", "HDMI")),
                List.of(port("out-1", "out", "HDMI")));
        ConnectionSchemaComponent mixer = device("mixer",
                List.of(port("in-1", "in", "HDMI"), port("in-2", "in", "XLR")),
                List.of(port("out-1", "out", "HDMI")));
        return schema(cam, mixer);
    }

    @Test
    void validOutToInPasses() {
        var req = new ConnectionRequest("cam", "out-1", "mixer", "in-1", "HDMI", null);
        List<Violation> v = ConnectionValidator.validate(req, sampleSchema(), List.of());
        assertTrue(v.isEmpty(), "OUT→IN совместимого типа должно проходить, нарушения: " + v);
    }

    @Test
    void inToInRejected() {
        // источник — входной порт камеры (in-1), приёмник — входной порт микшера
        var req = new ConnectionRequest("cam", "in-1", "mixer", "in-1", "HDMI", null);
        List<Violation> v = ConnectionValidator.validate(req, sampleSchema(), List.of());
        assertTrue(has(v, ConnectionValidator.ERR_DIRECTION), "in→in должно отклоняться: " + v);
    }

    @Test
    void outToOutRejected() {
        var req = new ConnectionRequest("cam", "out-1", "mixer", "out-1", "HDMI", null);
        List<Violation> v = ConnectionValidator.validate(req, sampleSchema(), List.of());
        assertTrue(has(v, ConnectionValidator.ERR_DIRECTION), "out→out должно отклоняться: " + v);
    }

    @Test
    void typeMismatchRejected() {
        // HDMI OUT → XLR IN
        var req = new ConnectionRequest("cam", "out-1", "mixer", "in-2", "HDMI", null);
        List<Violation> v = ConnectionValidator.validate(req, sampleSchema(), List.of());
        assertTrue(has(v, ConnectionValidator.ERR_TYPE_MISMATCH), "несовместимый тип должен отклоняться: " + v);
    }

    @Test
    void occupiedPortRejected() {
        Map<String, Object> existing = new LinkedHashMap<>();
        existing.put("toDeviceId", "mixer");
        existing.put("toPortId", "in-1");
        var req = new ConnectionRequest("cam", "out-1", "mixer", "in-1", "HDMI", null);
        List<Violation> v = ConnectionValidator.validate(req, sampleSchema(), List.of(existing));
        assertTrue(has(v, ConnectionValidator.ERR_PORT_OCCUPIED), "занятый порт должен отклоняться: " + v);
    }

    @Test
    void selfConnectionRejected() {
        var req = new ConnectionRequest("cam", "out-1", "cam", "in-1", "HDMI", null);
        List<Violation> v = ConnectionValidator.validate(req, sampleSchema(), List.of());
        assertTrue(has(v, ConnectionValidator.ERR_SELF_CONNECTION), "self-connection должно отклоняться: " + v);
    }

    @Test
    void portNotFoundRejected() {
        var req = new ConnectionRequest("cam", "out-404", "mixer", "in-1", "HDMI", null);
        List<Violation> v = ConnectionValidator.validate(req, sampleSchema(), List.of());
        assertTrue(has(v, ConnectionValidator.ERR_PORT_NOT_FOUND), "несуществующий порт должен отклоняться: " + v);
    }

    @Test
    void aliasedNetworkTypesAreCompatible() {
        // LAN OUT → ETH IN считаются совместимыми (синонимы)
        ConnectionSchemaComponent a = device("a", new ArrayList<>(), List.of(port("out-1", "out", "LAN")));
        ConnectionSchemaComponent b = device("b", List.of(port("in-1", "in", "ETH")), new ArrayList<>());
        var req = new ConnectionRequest("a", "out-1", "b", "in-1", "LAN", null);
        List<Violation> v = ConnectionValidator.validate(req, schema(a, b), List.of());
        assertFalse(has(v, ConnectionValidator.ERR_TYPE_MISMATCH), "LAN↔ETH должны быть совместимы: " + v);
        assertTrue(v.isEmpty(), "связь LAN→ETH должна быть валидной: " + v);
    }

    @Test
    void codesMatchContract() {
        // Коды совпадают с enum Violation.code в docs/openapi.yaml
        assertEquals("ERR_DIRECTION", ConnectionValidator.ERR_DIRECTION);
        assertEquals("ERR_TYPE_MISMATCH", ConnectionValidator.ERR_TYPE_MISMATCH);
        assertEquals("ERR_PORT_OCCUPIED", ConnectionValidator.ERR_PORT_OCCUPIED);
        assertEquals("ERR_SELF_CONNECTION", ConnectionValidator.ERR_SELF_CONNECTION);
        assertEquals("ERR_PORT_NOT_FOUND", ConnectionValidator.ERR_PORT_NOT_FOUND);
    }
}
