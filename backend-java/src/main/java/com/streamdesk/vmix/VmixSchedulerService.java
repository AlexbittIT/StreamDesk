package com.streamdesk.vmix;

import com.streamdesk.company.Company;
import com.streamdesk.company.CompanyService;
import com.streamdesk.config.ApiException;
import com.streamdesk.config.TimeParse;
import com.streamdesk.vmix.dto.AgentResultRequest;
import com.streamdesk.vmix.dto.SchedulerEventRequest;
import com.streamdesk.vmix.dto.SchedulerEventUpdate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Логика планировщика vMix — перенос /api/vmix/scheduler/* и агентных /api/agents/*vmix-scheduler*
 * из backend/routes.ts. Агентные эндпоинты авторизуются по workspaceKey компании.
 */
@Service
public class VmixSchedulerService {

    private final VmixSchedulerEventRepository repository;
    private final CompanyService companyService;

    public VmixSchedulerService(VmixSchedulerEventRepository repository, CompanyService companyService) {
        this.repository = repository;
        this.companyService = companyService;
    }

    /** GET /api/vmix/scheduler — список событий в формате фронтенда. */
    public Map<String, Object> listEvents() {
        List<Map<String, Object>> events = repository.findAllByOrderByStartTime().stream()
                .map(this::formatEvent)
                .toList();
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("events", events);
        return response;
    }

    @Transactional
    public Map<String, Object> createEvent(SchedulerEventRequest req) {
        if (isBlank(req.title()) || isBlank(req.startTime())) {
            throw ApiException.badRequest("Title and startTime are required");
        }
        VmixSchedulerEvent event = new VmixSchedulerEvent();
        event.setTitle(req.title());
        event.setStartTime(requireInstant(req.startTime()));
        event.setStatus("scheduled");
        event.setActions(req.actions() != null ? req.actions() : new ArrayList<>());
        event.setInput(req.input());
        event.setVmixHost(req.vmixHost());
        event.setVmixPort(req.vmixPort());
        return formatEvent(repository.save(event));
    }

    @Transactional
    public Map<String, Object> updateEvent(String id, SchedulerEventUpdate req) {
        VmixSchedulerEvent event = repository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Event not found"));
        if (!isBlank(req.title())) {
            event.setTitle(req.title());
        }
        if (!isBlank(req.startTime())) {
            event.setStartTime(requireInstant(req.startTime()));
        }
        if (req.input() != null) {
            event.setInput(req.input());
        }
        if (req.actions() != null) {
            event.setActions(req.actions());
        }
        if (!isBlank(req.status())) {
            event.setStatus(req.status());
        }
        if (req.vmixHost() != null) {
            event.setVmixHost(req.vmixHost());
        }
        if (req.vmixPort() != null) {
            event.setVmixPort(req.vmixPort());
        }
        if (req.executedAt() != null) {
            event.setExecutedAt(isBlank(req.executedAt()) ? null : requireInstant(req.executedAt()));
        }
        if (req.errorMessage() != null) {
            event.setErrorMessage(req.errorMessage());
        }
        event.setUpdatedAt(Instant.now());
        return formatEvent(repository.save(event));
    }

    @Transactional
    public void deleteEvent(String id) {
        if (!repository.existsById(id)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Event not found");
        }
        repository.deleteById(id);
    }

    /** GET /api/agents/{agentKey}/vmix-scheduler/due — отдать «созревшие» события агенту и пометить live. */
    @Transactional
    public Map<String, Object> dueForAgent(String agentKey, String companyId, String workspaceKey,
                                           boolean includeGlobal, int lookAheadSec) {
        if (isBlank(agentKey)) {
            throw ApiException.badRequest("agentKey is required");
        }
        requireWorkspace(companyId, workspaceKey);

        long now = System.currentTimeMillis();
        long windowEnd = now + lookAheadSec * 1000L;
        String key = agentKey.trim();

        List<VmixSchedulerEvent> due = repository.findAllByOrderByStartTime().stream()
                .filter(e -> "scheduled".equals(e.getStatus()))
                .filter(e -> {
                    if (e.getStartTime() == null) {
                        return false;
                    }
                    long startMs = e.getStartTime().toEpochMilli();
                    if (startMs < now - 5000 || startMs > windowEnd) {
                        return false;
                    }
                    String target = e.getVmixHost() != null ? e.getVmixHost().trim() : "";
                    return target.equals(key) || (includeGlobal && target.isEmpty());
                })
                .toList();

        List<Map<String, Object>> result = new ArrayList<>();
        for (VmixSchedulerEvent e : due) {
            e.setStatus("live");
            e.setExecutedAt(Instant.now());
            e.setUpdatedAt(Instant.now());
            repository.save(e);

            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", e.getId());
            m.put("title", e.getTitle());
            m.put("startTime", e.getStartTime().toString());
            m.put("actions", e.getActions() != null ? e.getActions() : new ArrayList<>());
            m.put("input", e.getInput());
            result.add(m);
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("events", result);
        return response;
    }

    /** POST /api/agents/vmix-scheduler/{eventId}/result — агент сообщает результат выполнения. */
    @Transactional
    public Map<String, Object> agentResult(String eventId, AgentResultRequest req) {
        requireWorkspace(req.companyId(), req.workspaceKey());

        VmixSchedulerEvent event = repository.findById(eventId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Event not found"));
        String target = event.getVmixHost() != null ? event.getVmixHost().trim() : "";
        String agentKey = req.agentKey() != null ? req.agentKey().trim() : "";
        if (!target.isEmpty() && !target.equals(agentKey)) {
            throw ApiException.forbidden("Event belongs to another agent");
        }

        String normalized = "completed".equals(req.status()) ? "completed"
                : "error".equals(req.status()) ? "error" : "live";
        event.setStatus(normalized);
        event.setExecutedAt(isBlank(req.executedAt()) ? Instant.now() : requireInstant(req.executedAt()));
        event.setErrorMessage("error".equals(normalized)
                ? (isBlank(req.message()) ? "Agent execution failed" : req.message())
                : null);
        event.setUpdatedAt(Instant.now());
        repository.save(event);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("ok", true);
        response.put("event", formatEvent(event));
        return response;
    }

    // --- helpers ---

    /** Проверка workspaceKey компании (как у агентных эндпоинтов в Express). 403 при несовпадении. */
    private void requireWorkspace(String companyId, String workspaceKey) {
        String expected = workspaceKeyFor(companyId);
        if (expected == null || !expected.equals(workspaceKey != null ? workspaceKey : "")) {
            throw ApiException.forbidden("Agent workspace rejected");
        }
    }

    @SuppressWarnings("unchecked")
    private String workspaceKeyFor(String companyId) {
        if (isBlank(companyId)) {
            return null;
        }
        Company company = companyService.getCompanyById(companyId).orElse(null);
        if (company == null || company.getSettings() == null) {
            return null;
        }
        Object monitoring = company.getSettings().get("monitoring");
        if (!(monitoring instanceof Map<?, ?> monitoringMap)) {
            return null;
        }
        Object key = ((Map<String, Object>) monitoringMap).get("workspaceKey");
        return key != null && !String.valueOf(key).isBlank() ? String.valueOf(key) : null;
    }

    private Map<String, Object> formatEvent(VmixSchedulerEvent e) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", e.getId());
        m.put("title", e.getTitle());
        m.put("startTime", e.getStartTime() != null ? e.getStartTime().toString() : Instant.now().toString());
        m.put("endTime", e.getEndTime() != null ? e.getEndTime().toString() : null);
        m.put("status", e.getStatus());
        m.put("actions", e.getActions() != null ? e.getActions() : new ArrayList<>());
        m.put("input", e.getInput());
        m.put("vmixHost", e.getVmixHost());
        m.put("vmixPort", e.getVmixPort());
        m.put("executedAt", e.getExecutedAt() != null ? e.getExecutedAt().toString() : null);
        m.put("errorMessage", e.getErrorMessage());
        return m;
    }

    private Instant requireInstant(String value) {
        try {
            return TimeParse.toInstant(value);
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("Некорректная дата: " + value);
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
