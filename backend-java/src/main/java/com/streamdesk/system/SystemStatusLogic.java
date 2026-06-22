package com.streamdesk.system;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

/**
 * Логика статуса систем — перенос расчётов из GET /api/systems в routes.ts.
 * Системой «управляет агент», если в specifications есть agentKey (на верхнем уровне или внутри agent).
 */
final class SystemStatusLogic {

    private SystemStatusLogic() {
    }

    /** specifications как Map (или пустой), даже если null/не объект. */
    @SuppressWarnings("unchecked")
    static Map<String, Object> spec(SystemEntity system) {
        Object raw = system.getSpecifications();
        return raw instanceof Map ? (Map<String, Object>) raw : new HashMap<>();
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> agent(Map<String, Object> spec) {
        Object raw = spec.get("agent");
        return raw instanceof Map ? (Map<String, Object>) raw : new HashMap<>();
    }

    static boolean isAgentManaged(Map<String, Object> spec) {
        return notBlank(spec.get("agentKey")) || notBlank(agent(spec).get("agentKey"));
    }

    /** Результат расчёта статуса агентной системы. */
    record AgentStatus(String status, long staleSec) {
    }

    static AgentStatus computeAgentStatus(Map<String, Object> spec, Instant lastPing) {
        int intervalSec = Math.max(15, toInt(agent(spec).get("intervalSec"), 15));
        long lastPingMs = lastPing != null ? lastPing.toEpochMilli() : 0L;
        long staleSec = lastPingMs != 0
                ? Math.round((System.currentTimeMillis() - lastPingMs) / 1000.0)
                : 999_999L;
        String status = staleSec <= (long) intervalSec * 4 ? "online" : "offline";
        return new AgentStatus(status, staleSec);
    }

    static String companyId(Map<String, Object> spec) {
        Object value = spec.get("companyId");
        return value != null ? String.valueOf(value) : null;
    }

    private static boolean notBlank(Object value) {
        return value != null && !String.valueOf(value).isBlank();
    }

    private static int toInt(Object value, int fallback) {
        if (value instanceof Number n) {
            return n.intValue();
        }
        try {
            return value != null ? Integer.parseInt(String.valueOf(value).trim()) : fallback;
        } catch (NumberFormatException e) {
            return fallback;
        }
    }
}
