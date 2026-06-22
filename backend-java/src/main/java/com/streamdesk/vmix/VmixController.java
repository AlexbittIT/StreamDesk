package com.streamdesk.vmix;

import com.streamdesk.config.ApiException;
import com.streamdesk.vmix.dto.AgentResultRequest;
import com.streamdesk.vmix.dto.CommandRequest;
import com.streamdesk.vmix.dto.ConnectRequest;
import com.streamdesk.vmix.dto.SchedulerEventRequest;
import com.streamdesk.vmix.dto.SchedulerEventUpdate;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * REST-контроллер vMix — перенос /api/vmix/*, /api/integrations/vmix/scheduler и агентных
 * /api/agents/*vmix-scheduler* из backend/routes.ts. Пути сохранены.
 */
@RestController
public class VmixController {

    private final VmixClient vmixClient;
    private final VmixSchedulerService schedulerService;

    public VmixController(VmixClient vmixClient, VmixSchedulerService schedulerService) {
        this.vmixClient = vmixClient;
        this.schedulerService = schedulerService;
    }

    // --- vMix HTTP ---

    @PostMapping("/api/vmix/connect")
    public ResponseEntity<Map<String, Object>> connect(@RequestBody ConnectRequest req) {
        if (isBlank(req.host()) || isBlank(req.port())) {
            throw ApiException.badRequest("Host and port are required");
        }
        Map<String, Object> result = vmixClient.connect(req.host(), req.port());
        return statusFor(result, "connected");
    }

    @GetMapping("/api/vmix/status")
    public Map<String, Object> status(@RequestParam(required = false) String host,
                                      @RequestParam(required = false) String port) {
        return vmixClient.status(host, port);
    }

    @GetMapping("/api/vmix/timecode")
    public Map<String, Object> timecode(@RequestParam(required = false) String host,
                                        @RequestParam(required = false) String port) {
        return vmixClient.timecode(host, port);
    }

    @PostMapping("/api/vmix/command")
    public ResponseEntity<Map<String, Object>> command(@RequestBody CommandRequest req) {
        if (isBlank(req.command())) {
            throw ApiException.badRequest("Command is required");
        }
        Map<String, Object> result = vmixClient.command(req.command(), req.host(), req.port(), req.input());
        return statusFor(result, "success");
    }

    // --- scheduler (DB) ---

    @GetMapping("/api/vmix/scheduler")
    public Map<String, Object> scheduler() {
        return schedulerService.listEvents();
    }

    @PostMapping("/api/vmix/scheduler/events")
    public Map<String, Object> createEvent(@RequestBody SchedulerEventRequest req) {
        return schedulerService.createEvent(req);
    }

    @PutMapping("/api/vmix/scheduler/events/{id}")
    public Map<String, Object> updateEvent(@PathVariable String id, @RequestBody SchedulerEventUpdate req) {
        return schedulerService.updateEvent(id, req);
    }

    @DeleteMapping("/api/vmix/scheduler/events/{id}")
    public Map<String, Boolean> deleteEvent(@PathVariable String id) {
        schedulerService.deleteEvent(id);
        return Map.of("success", true);
    }

    // --- agent polling ---

    @GetMapping("/api/agents/{agentKey}/vmix-scheduler/due")
    public Map<String, Object> due(@PathVariable String agentKey,
                                   @RequestParam(required = false) String companyId,
                                   @RequestParam(required = false) String workspaceKey,
                                   @RequestParam(name = "global", required = false) String global,
                                   @RequestParam(required = false) Integer lookAheadSec) {
        boolean includeGlobal = "true".equals(global);
        int look = Math.max(5, Math.min(300, lookAheadSec != null ? lookAheadSec : 30));
        return schedulerService.dueForAgent(agentKey, companyId, workspaceKey, includeGlobal, look);
    }

    @PostMapping("/api/agents/vmix-scheduler/{eventId}/result")
    public Map<String, Object> agentResult(@PathVariable String eventId, @RequestBody AgentResultRequest req) {
        return schedulerService.agentResult(eventId, req);
    }

    // --- integrations (mock, как в Express) ---

    @GetMapping("/api/integrations/vmix/scheduler")
    public Map<String, Object> integrationScheduler() {
        Instant now = Instant.now();
        List<Map<String, Object>> events = List.of(
                mockEvent("1", "Утренний эфир", now.plus(2, ChronoUnit.HOURS), now.plus(4, ChronoUnit.HOURS),
                        "morning_show", "main"),
                mockEvent("2", "Вечерний стрим", now.plus(8, ChronoUnit.HOURS), now.plus(11, ChronoUnit.HOURS),
                        "evening_stream", "main"),
                mockEvent("3", "Ночной повтор", now.plus(24, ChronoUnit.HOURS), null, "replay", "secondary")
        );
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("connected", true);
        response.put("events", events);
        response.put("lastSync", now.toString());
        response.put("nextEvent", events.get(0));
        return response;
    }

    // --- helpers ---

    private Map<String, Object> mockEvent(String id, String title, Instant start, Instant end,
                                          String preset, String channel) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id);
        m.put("title", title);
        m.put("startTime", start.toString());
        if (end != null) {
            m.put("endTime", end.toString());
        }
        m.put("status", "scheduled");
        m.put("preset", preset);
        m.put("channel", channel);
        return m;
    }

    private ResponseEntity<Map<String, Object>> statusFor(Map<String, Object> result, String flag) {
        boolean ok = Boolean.TRUE.equals(result.get(flag));
        return ResponseEntity.status(ok ? 200 : 500).body(result);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
