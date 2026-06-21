package com.streamdesk.connectionschema;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.company.CompanyService;
import com.streamdesk.config.ApiException;
import com.streamdesk.connectionschema.dto.AiGenerateRequest;
import com.streamdesk.connectionschema.dto.ComponentRequest;
import com.streamdesk.connectionschema.dto.SchemaRequest;
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
 * REST-контроллер схем подключения — перенос /api/connection-schemas из backend/routes.ts.
 * Часть операций требует доступа к рабочему пространству (как hasWorkspaceAccess в Express).
 */
@RestController
@RequestMapping("/api/connection-schemas")
public class ConnectionSchemaController {

    private final ConnectionSchemaService schemaService;
    private final CompanyService companyService;

    public ConnectionSchemaController(ConnectionSchemaService schemaService, CompanyService companyService) {
        this.schemaService = schemaService;
        this.companyService = companyService;
    }

    @GetMapping
    public List<ConnectionSchema> list(@AuthenticationPrincipal AuthenticatedUser user) {
        // Без доступа к рабочему пространству — пустой список, как в Express.
        if (!companyService.hasWorkspaceAccess(user)) {
            return List.of();
        }
        return schemaService.list();
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable String id, @AuthenticationPrincipal AuthenticatedUser user) {
        requireWorkspace(user, "Нет доступа к схемам");
        return schemaService.getWithComponents(id);
    }

    @PostMapping
    public ConnectionSchema create(@RequestBody SchemaRequest req, @AuthenticationPrincipal AuthenticatedUser user) {
        requireWorkspace(user, "Сначала создайте компанию или вступите по приглашению");
        return schemaService.createSchema(req);
    }

    @PutMapping("/{id}")
    public ConnectionSchema update(@PathVariable String id, @RequestBody SchemaRequest req) {
        return schemaService.updateSchema(id, req);
    }

    @DeleteMapping("/{id}")
    public Map<String, Boolean> delete(@PathVariable String id, @AuthenticationPrincipal AuthenticatedUser user) {
        requireWorkspace(user, "Нет доступа к схемам");
        schemaService.deleteSchema(id);
        return Map.of("success", true);
    }

    @PostMapping("/{id}/ai-generate")
    public Map<String, Object> aiGenerate(@PathVariable String id, @RequestBody(required = false) AiGenerateRequest req,
                                          @AuthenticationPrincipal AuthenticatedUser user) {
        requireWorkspace(user, "Нет доступа к схемам");
        return schemaService.aiGenerate(id, req != null ? req.prompt() : null);
    }

    @PostMapping("/{schemaId}/components")
    public ConnectionSchemaComponent createComponent(@PathVariable String schemaId, @RequestBody ComponentRequest req) {
        return schemaService.createComponent(schemaId, req);
    }

    @PutMapping("/components/{id}")
    public ConnectionSchemaComponent updateComponent(@PathVariable String id, @RequestBody ComponentRequest req) {
        return schemaService.updateComponent(id, req);
    }

    @DeleteMapping("/components/{id}")
    public Map<String, Boolean> deleteComponent(@PathVariable String id) {
        schemaService.deleteComponent(id);
        return Map.of("success", true);
    }

    private void requireWorkspace(AuthenticatedUser user, String message) {
        if (!companyService.hasWorkspaceAccess(user)) {
            throw ApiException.forbidden(message);
        }
    }
}
