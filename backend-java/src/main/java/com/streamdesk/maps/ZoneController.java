package com.streamdesk.maps;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.maps.dto.ZoneAssigneeRequest;
import com.streamdesk.maps.dto.ZoneCreateRequest;
import com.streamdesk.maps.dto.ZoneStatusRequest;
import com.streamdesk.maps.dto.ZoneUpdateRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * REST-контроллер зон — {@code /api/maps/{mapId}/zones/**} по контракту docs/openapi-maps.yaml.
 * Комментарии и фото зоны ({@code /comments}, {@code /photos}) — отдельная задача VM-16.
 */
@RestController
@RequestMapping("/api/maps/{mapId}/zones")
public class ZoneController {

    private final ZoneService zoneService;

    public ZoneController(ZoneService zoneService) {
        this.zoneService = zoneService;
    }

    @GetMapping
    public List<Zone> list(@PathVariable String mapId, @AuthenticationPrincipal AuthenticatedUser user) {
        return zoneService.list(mapId, user);
    }

    @PostMapping
    public ResponseEntity<Zone> create(@PathVariable String mapId, @RequestBody ZoneCreateRequest req,
                                       @AuthenticationPrincipal AuthenticatedUser user) {
        return ResponseEntity.status(HttpStatus.CREATED).body(zoneService.create(mapId, req, user));
    }

    @GetMapping("/{zoneId}")
    public Zone get(@PathVariable String mapId, @PathVariable String zoneId,
                    @AuthenticationPrincipal AuthenticatedUser user) {
        return zoneService.get(mapId, zoneId, user);
    }

    @PutMapping("/{zoneId}")
    public Zone update(@PathVariable String mapId, @PathVariable String zoneId,
                       @RequestBody ZoneUpdateRequest req, @AuthenticationPrincipal AuthenticatedUser user) {
        return zoneService.update(mapId, zoneId, req, user);
    }

    @DeleteMapping("/{zoneId}")
    public Map<String, Boolean> delete(@PathVariable String mapId, @PathVariable String zoneId,
                                       @AuthenticationPrincipal AuthenticatedUser user) {
        zoneService.delete(mapId, zoneId, user);
        return Map.of("success", true);
    }

    @PatchMapping("/{zoneId}/status")
    public Zone changeStatus(@PathVariable String mapId, @PathVariable String zoneId,
                             @RequestBody ZoneStatusRequest req,
                             @AuthenticationPrincipal AuthenticatedUser user) {
        return zoneService.changeStatus(mapId, zoneId, req, user);
    }

    @GetMapping("/{zoneId}/status-history")
    public List<ZoneStatusHistory> history(@PathVariable String mapId, @PathVariable String zoneId,
                                           @AuthenticationPrincipal AuthenticatedUser user) {
        return zoneService.history(mapId, zoneId, user);
    }

    @PutMapping("/{zoneId}/assignee")
    public Zone assign(@PathVariable String mapId, @PathVariable String zoneId,
                       @RequestBody ZoneAssigneeRequest req,
                       @AuthenticationPrincipal AuthenticatedUser user) {
        return zoneService.assign(mapId, zoneId, req, user);
    }
}
