package com.streamdesk.event;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.company.CompanyService;
import com.streamdesk.event.dto.EventRequest;
import com.streamdesk.event.dto.EventResponse;
import com.streamdesk.event.dto.ParticipantResponse;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * REST-контроллер событий — перенос маршрутов /api/events из backend/routes.ts.
 * Пути и формат ответов совпадают с Express, чтобы фронт-календарь работал без изменений.
 */
@RestController
@RequestMapping("/api/events")
public class EventController {

    private final EventService eventService;
    private final CompanyService companyService;

    public EventController(EventService eventService, CompanyService companyService) {
        this.eventService = eventService;
        this.companyService = companyService;
    }

    // GET /api/events  (опц. ?userId= | ?start=&end=)
    @GetMapping
    public List<EventResponse> list(@AuthenticationPrincipal AuthenticatedUser user,
                                    @RequestParam(required = false) String userId,
                                    @RequestParam(required = false) String start,
                                    @RequestParam(required = false) String end) {
        // Как в Express: без доступа к рабочему пространству отдаём пустой список, а не 403.
        if (!companyService.hasWorkspaceAccess(user)) {
            return List.of();
        }
        return eventService.listEvents(user, userId, start, end);
    }

    // POST /api/events
    @PostMapping
    public Event create(@RequestBody EventRequest req, @AuthenticationPrincipal AuthenticatedUser user) {
        return eventService.createEvent(req, user != null ? user.id() : null);
    }

    // PUT /api/events/{id}
    @PutMapping("/{id}")
    public Event update(@PathVariable String id, @RequestBody EventRequest req,
                        @AuthenticationPrincipal AuthenticatedUser user) {
        eventService.getAccessibleEvent(id, user);
        return eventService.updateEvent(id, req);
    }

    // DELETE /api/events/{id}
    @DeleteMapping("/{id}")
    public Map<String, Boolean> delete(@PathVariable String id, @AuthenticationPrincipal AuthenticatedUser user) {
        eventService.getAccessibleEvent(id, user);
        eventService.deleteEvent(id);
        return Map.of("success", true);
    }

    // GET /api/events/{eventId}/participants
    @GetMapping("/{eventId}/participants")
    public List<ParticipantResponse> participants(@PathVariable String eventId,
                                                  @AuthenticationPrincipal AuthenticatedUser user) {
        return eventService.getParticipants(eventId, user);
    }

    // PATCH /api/events/{eventId}/participants/{participantId}
    @PatchMapping("/{eventId}/participants/{participantId}")
    public EventParticipant updateParticipant(@PathVariable String eventId,
                                              @PathVariable String participantId,
                                              @RequestBody Map<String, String> body,
                                              @AuthenticationPrincipal AuthenticatedUser user) {
        eventService.getAccessibleEvent(eventId, user);
        return eventService.updateParticipantStatus(participantId, body != null ? body.get("status") : null);
    }
}