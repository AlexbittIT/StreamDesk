package com.streamdesk.obs;

import com.streamdesk.obs.dto.ObsRequest;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * REST-контроллер подключений OBS — перенос /api/obs/connections из backend/routes.ts.
 */
@RestController
@RequestMapping("/api/obs/connections")
public class ObsController {

    private final ObsService obsService;

    public ObsController(ObsService obsService) {
        this.obsService = obsService;
    }

    @GetMapping
    public List<ObsConnection> list() {
        return obsService.list();
    }

    @PostMapping
    public ObsConnection create(@RequestBody ObsRequest req) {
        return obsService.create(req);
    }

    @PutMapping("/{id}")
    public ObsConnection update(@PathVariable String id, @RequestBody ObsRequest req) {
        return obsService.update(id, req);
    }

    @DeleteMapping("/{id}")
    public Map<String, Boolean> delete(@PathVariable String id) {
        obsService.delete(id);
        return Map.of("success", true);
    }
}
