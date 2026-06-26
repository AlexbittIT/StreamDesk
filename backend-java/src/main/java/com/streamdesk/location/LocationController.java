package com.streamdesk.location;

import com.streamdesk.location.dto.LocationRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * REST-контроллер локаций — перенос /api/locations из backend/routes.ts. Пути сохранены.
 */
@RestController
@RequestMapping("/api/locations")
public class LocationController {

    private final LocationService locationService;

    public LocationController(LocationService locationService) {
        this.locationService = locationService;
    }

    @GetMapping
    public List<CustomLocation> list() {
        return locationService.list();
    }

    @PostMapping
    public ResponseEntity<CustomLocation> create(@RequestBody LocationRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(locationService.create(req));
    }

    @DeleteMapping("/{id}")
    public Map<String, Boolean> delete(@PathVariable String id) {
        locationService.delete(id);
        return Map.of("success", true);
    }
}
