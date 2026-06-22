package com.streamdesk.system;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.company.CompanyService;
import com.streamdesk.system.dto.PingRequest;
import com.streamdesk.system.dto.PingResponse;
import com.streamdesk.system.dto.SystemRequest;
import com.streamdesk.system.dto.SystemResponse;
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
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * REST-контроллер систем — перенос /api/systems из backend/routes.ts. Пути сохранены.
 */
@RestController
@RequestMapping("/api/systems")
public class SystemController {

    private final SystemService systemService;
    private final CompanyService companyService;

    public SystemController(SystemService systemService, CompanyService companyService) {
        this.systemService = systemService;
        this.companyService = companyService;
    }

    // GET /api/systems — без доступа к рабочему пространству отдаём [], как в Express.
    @GetMapping
    public List<SystemResponse> list(@AuthenticationPrincipal AuthenticatedUser user) {
        if (!companyService.hasWorkspaceAccess(user)) {
            return List.of();
        }
        return systemService.listSystems(user);
    }

    // POST /api/systems
    @PostMapping
    public ResponseEntity<SystemEntity> create(@RequestBody SystemRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(systemService.createSystem(req));
    }

    // PUT /api/systems/{id}
    @PutMapping("/{id}")
    public SystemEntity update(@PathVariable String id, @RequestBody SystemRequest req) {
        return systemService.updateSystem(id, req);
    }

    // POST /api/systems/ping
    @PostMapping("/ping")
    public PingResponse ping(@RequestBody PingRequest body) {
        return systemService.ping(body != null ? body.ip() : null);
    }

    // DELETE /api/systems/{id}
    @DeleteMapping("/{id}")
    public Map<String, Boolean> delete(@PathVariable String id) {
        systemService.deleteSystem(id);
        return Map.of("success", true);
    }

    // POST /api/systems/{id}/ping — пинг конкретной системы
    @PostMapping("/{id}/ping")
    public Map<String, Object> pingById(@PathVariable String id) {
        return systemService.pingById(id);
    }
}
