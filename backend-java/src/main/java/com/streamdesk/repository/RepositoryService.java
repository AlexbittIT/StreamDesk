package com.streamdesk.repository;

import com.streamdesk.config.ApiException;
import com.streamdesk.repository.dto.RepositoryRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

/**
 * Логика репозиториев кода — перенос /api/repositories из backend/routes.ts.
 * Проверка прав (только admin на запись) выполняется в контроллере.
 */
@Service
public class RepositoryService {

    private final CodeRepositoryRepository repository;

    public RepositoryService(CodeRepositoryRepository repository) {
        this.repository = repository;
    }

    public List<CodeRepository> list() {
        return repository.findAllByOrderByName();
    }

    @Transactional
    public CodeRepository create(RepositoryRequest req) {
        if (isBlank(req.name()) || isBlank(req.url())) {
            throw ApiException.badRequest("Укажите название и URL репозитория");
        }
        CodeRepository repo = new CodeRepository();
        repo.setName(req.name());
        repo.setUrl(req.url());
        if (!isBlank(req.type())) {
            repo.setType(req.type());
        }
        repo.setDescription(req.description());
        return repository.save(repo);
    }

    @Transactional
    public CodeRepository update(String id, RepositoryRequest req) {
        CodeRepository repo = repository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Repository not found"));
        if (req.name() != null) {
            repo.setName(req.name());
        }
        if (req.url() != null) {
            repo.setUrl(req.url());
        }
        if (req.type() != null) {
            repo.setType(req.type());
        }
        if (req.description() != null) {
            repo.setDescription(req.description());
        }
        repo.setUpdatedAt(Instant.now());
        return repository.save(repo);
    }

    @Transactional
    public void delete(String id) {
        // Как deleteRepository в Express — без 404.
        if (repository.existsById(id)) {
            repository.deleteById(id);
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
