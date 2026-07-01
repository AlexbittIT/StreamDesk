package com.streamdesk.connectionschema.validation;

import com.streamdesk.connectionschema.ConnectionSchemaComponent;
import com.streamdesk.connectionschema.dto.ConnectionRequest;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Правила валидации соединений схемы подключения. Сервер — источник истины.
 *
 * Коды нарушений (совпадают с enum Violation.code в docs/openapi.yaml):
 *   ERR_SELF_CONNECTION — устройство соединяют само с собой;
 *   ERR_PORT_NOT_FOUND  — компонент или порт не найден;
 *   ERR_DIRECTION       — направление не OUT → IN (in→in, out→out, in→out);
 *   ERR_TYPE_MISMATCH   — несовместимые типы разъёмов;
 *   ERR_PORT_OCCUPIED   — входной порт уже занят другим кабелем.
 */
public final class ConnectionValidator {

    public static final String ERR_DIRECTION = "ERR_DIRECTION";
    public static final String ERR_TYPE_MISMATCH = "ERR_TYPE_MISMATCH";
    public static final String ERR_PORT_OCCUPIED = "ERR_PORT_OCCUPIED";
    public static final String ERR_SELF_CONNECTION = "ERR_SELF_CONNECTION";
    public static final String ERR_PORT_NOT_FOUND = "ERR_PORT_NOT_FOUND";

    private ConnectionValidator() {
    }

    private record PortView(String id, String direction, String portType) {
    }

    /**
     * Проверяет одну связь.
     *
     * @param req      запрашиваемая связь
     * @param byId     компоненты схемы по id
     * @param existing уже существующие связи схемы (для проверки занятости порта)
     * @return список нарушений (пустой — связь валидна)
     */
    public static List<Violation> validate(ConnectionRequest req,
                                           Map<String, ConnectionSchemaComponent> byId,
                                           List<Map<String, Object>> existing) {
        List<Violation> violations = new ArrayList<>();

        // 1) Устройство само на себя
        if (req.fromDeviceId() != null && req.fromDeviceId().equals(req.toDeviceId())) {
            violations.add(Violation.component(ERR_SELF_CONNECTION,
                    "Нельзя соединять устройство само с собой", req.fromDeviceId()));
        }

        // 2) Компоненты существуют
        ConnectionSchemaComponent from = byId.get(req.fromDeviceId());
        ConnectionSchemaComponent to = byId.get(req.toDeviceId());
        if (from == null) {
            violations.add(Violation.component(ERR_PORT_NOT_FOUND,
                    "Компонент-источник не найден", req.fromDeviceId()));
        }
        if (to == null) {
            violations.add(Violation.component(ERR_PORT_NOT_FOUND,
                    "Компонент-приёмник не найден", req.toDeviceId()));
        }
        if (from == null || to == null) {
            return violations;
        }

        // 3) Порты существуют
        PortView fromPort = findPort(from, req.fromPortId());
        PortView toPort = findPort(to, req.toPortId());
        if (fromPort == null) {
            violations.add(Violation.ports(ERR_PORT_NOT_FOUND,
                    "Порт-источник не найден: " + req.fromPortId(), req.fromPortId(), req.toPortId()));
        }
        if (toPort == null) {
            violations.add(Violation.ports(ERR_PORT_NOT_FOUND,
                    "Порт-приёмник не найден: " + req.toPortId(), req.fromPortId(), req.toPortId()));
        }
        if (fromPort == null || toPort == null) {
            return violations;
        }

        // 4) Направление: только OUT → IN
        boolean fromOut = "out".equalsIgnoreCase(fromPort.direction());
        boolean toIn = "in".equalsIgnoreCase(toPort.direction());
        if (!(fromOut && toIn)) {
            String message;
            if (!fromOut && toIn) {
                message = "Нельзя соединять вход со входом — нужно OUT → IN";
            } else if (fromOut) {
                message = "Нельзя соединять выход с выходом — нужно OUT → IN";
            } else {
                message = "Источник должен быть выходом (OUT), а приёмник — входом (IN); поменяйте местами";
            }
            violations.add(Violation.ports(ERR_DIRECTION, message, req.fromPortId(), req.toPortId()));
        }

        // 5) Совместимость типов разъёмов
        if (!ConnectorTypes.compatible(fromPort.portType(), toPort.portType())) {
            violations.add(Violation.ports(ERR_TYPE_MISMATCH,
                    "Несовместимые типы разъёмов: " + nz(fromPort.portType()) + " → " + nz(toPort.portType()),
                    req.fromPortId(), req.toPortId()));
        }

        // 6) Занятость входного порта (IN принимает только один кабель)
        for (Map<String, Object> conn : existing) {
            if (req.toDeviceId().equals(str(conn.get("toDeviceId")))
                    && req.toPortId().equals(str(conn.get("toPortId")))) {
                violations.add(Violation.ports(ERR_PORT_OCCUPIED,
                        "Входной порт уже занят другим кабелем", req.fromPortId(), req.toPortId()));
                break;
            }
        }

        return violations;
    }

    private static PortView findPort(ConnectionSchemaComponent component, String portId) {
        if (component == null || portId == null) {
            return null;
        }
        for (Map<String, Object> p : portList(component, "portsIn")) {
            if (portId.equals(str(p.get("id")))) {
                return new PortView(portId, "in", str(p.get("portType")));
            }
        }
        for (Map<String, Object> p : portList(component, "portsOut")) {
            if (portId.equals(str(p.get("id")))) {
                return new PortView(portId, "out", str(p.get("portType")));
            }
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> portList(ConnectionSchemaComponent component, String key) {
        Object value = component.getProperties() != null ? component.getProperties().get(key) : null;
        if (value instanceof List<?> list) {
            List<Map<String, Object>> out = new ArrayList<>();
            for (Object item : list) {
                if (item instanceof Map<?, ?> map) {
                    out.add((Map<String, Object>) map);
                }
            }
            return out;
        }
        return List.of();
    }

    private static String str(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private static String nz(String value) {
        return (value == null || value.isBlank()) ? "?" : value;
    }
}
