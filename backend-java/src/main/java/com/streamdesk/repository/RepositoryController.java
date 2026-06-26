package com.streamdesk.repository;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.config.ApiException;
import com.streamdesk.repository.dto.RepositoryRequest;
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
 * REST-контроллер репозиториев — перенос /api/repositories из backend/routes.ts.
 * Чтение доступно авторизованным; создание/изменение/удаление — только администратору.
 */
@RestController
@RequestMapping("/api/repositories")
public class RepositoryController {

    private final RepositoryService repositoryService;

    public RepositoryController(RepositoryService repositoryService) {
        this.repositoryService = repositoryService;
    }

    @GetMapping
    public List<CodeRepository> list() {
        return repositoryService.list();
    }

    @PostMapping
    public ResponseEntity<CodeRepository> create(@RequestBody RepositoryRequest req,
                                                 @AuthenticationPrincipal AuthenticatedUser user) {
        requireAdmin(user, "создавать");
        return ResponseEntity.status(HttpStatus.CREATED).body(repositoryService.create(req));
    }

    @PutMapping("/{id}")
    public CodeRepository update(@PathVariable String id, @RequestBody RepositoryRequest req,
                                 @AuthenticationPrincipal AuthenticatedUser user) {
        requireAdmin(user, "редактировать");
        return repositoryService.update(id, req);
    }

    @DeleteMapping("/{id}")
    public Map<String, Boolean> delete(@PathVariable String id,
                                       @AuthenticationPrincipal AuthenticatedUser user) {
        requireAdmin(user, "удалять");
        repositoryService.delete(id);
        return Map.of("success", true);
    }

    private void requireAdmin(AuthenticatedUser user, String action) {
        if (user == null) {
            throw ApiException.unauthorized("Требуется авторизация");
        }
        if (!"admin".equals(user.role())) {
            throw ApiException.forbidden("Только администратор может " + action + " репозитории");
        }
    }
}
