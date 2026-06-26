package com.streamdesk.show;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.show.dto.MarkerRequest;
import com.streamdesk.show.dto.ProfileRequest;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * REST-контроллер шоу — профили участников и маркеры (перенос из backend/routes.ts). Пути сохранены.
 */
@RestController
public class ShowController {

    private final ShowService showService;

    public ShowController(ShowService showService) {
        this.showService = showService;
    }

    // --- participant profiles ---

    @GetMapping("/api/events/{eventId}/participant-profiles")
    public List<ShowParticipantProfile> profiles(@PathVariable String eventId) {
        return showService.getProfiles(eventId);
    }

    @PostMapping("/api/events/{eventId}/participant-profiles")
    public ShowParticipantProfile createProfile(@PathVariable String eventId, @RequestBody ProfileRequest req) {
        return showService.createProfile(eventId, req);
    }

    @PutMapping("/api/participant-profiles/{id}")
    public ShowParticipantProfile updateProfile(@PathVariable String id, @RequestBody ProfileRequest req) {
        return showService.updateProfile(id, req);
    }

    @DeleteMapping("/api/participant-profiles/{id}")
    public Map<String, Boolean> deleteProfile(@PathVariable String id) {
        showService.deleteProfile(id);
        return Map.of("success", true);
    }

    // --- markers ---

    @GetMapping("/api/events/{eventId}/markers")
    public List<ShowMarker> markers(@PathVariable String eventId) {
        return showService.getMarkers(eventId);
    }

    @PostMapping("/api/events/{eventId}/markers")
    public ShowMarker createMarker(@PathVariable String eventId, @RequestBody MarkerRequest req,
                                   @AuthenticationPrincipal AuthenticatedUser user) {
        return showService.createMarker(eventId, req, user != null ? user.id() : null);
    }

    @PutMapping("/api/markers/{id}")
    public ShowMarker updateMarker(@PathVariable String id, @RequestBody MarkerRequest req) {
        return showService.updateMarker(id, req);
    }

    @DeleteMapping("/api/markers/{id}")
    public Map<String, Boolean> deleteMarker(@PathVariable String id) {
        showService.deleteMarker(id);
        return Map.of("success", true);
    }
}
