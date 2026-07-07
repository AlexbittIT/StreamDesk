package com.streamdesk.maps;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.maps.dto.MapCreateRequest;
import com.streamdesk.maps.dto.MapResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

/**
 * REST-контроллер карт — {@code /api/maps} по контракту docs/openapi-maps.yaml.
 */
@RestController
@RequestMapping("/api/maps")
public class MapController {

    private final MapService mapService;

    public MapController(MapService mapService) {
        this.mapService = mapService;
    }

    @GetMapping
    public List<MapResponse> list(@AuthenticationPrincipal AuthenticatedUser user,
                                  @RequestParam(required = false) String venueId) {
        return mapService.list(user, venueId);
    }

    @PostMapping
    public ResponseEntity<MapResponse> create(@RequestBody MapCreateRequest req,
                                              @AuthenticationPrincipal AuthenticatedUser user) {
        return ResponseEntity.status(HttpStatus.CREATED).body(mapService.create(req, user));
    }

    @GetMapping("/{mapId}")
    public MapResponse get(@PathVariable String mapId, @AuthenticationPrincipal AuthenticatedUser user) {
        return mapService.getWithZones(mapId, user);
    }

    @PutMapping("/{mapId}")
    public MapResponse update(@PathVariable String mapId, @RequestBody MapCreateRequest req,
                              @AuthenticationPrincipal AuthenticatedUser user) {
        return mapService.update(mapId, req, user);
    }

    @DeleteMapping("/{mapId}")
    public Map<String, Boolean> delete(@PathVariable String mapId,
                                       @AuthenticationPrincipal AuthenticatedUser user) {
        mapService.delete(mapId, user);
        return Map.of("success", true);
    }

    @PostMapping("/{mapId}/plan")
    public MapResponse uploadPlan(@PathVariable String mapId,
                                  @RequestParam("file") MultipartFile file,
                                  @AuthenticationPrincipal AuthenticatedUser user) {
        return mapService.uploadPlan(mapId, file, user);
    }
}
