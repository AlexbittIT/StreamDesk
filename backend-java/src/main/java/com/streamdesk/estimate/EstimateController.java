package com.streamdesk.estimate;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.company.CompanyService;
import com.streamdesk.config.ApiException;
import com.streamdesk.estimate.dto.EstimateRequest;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
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
 * REST-контроллер сохранённых смет (/api/estimates).
 * Доступ — как у схем подключения: только при наличии доступа к рабочему пространству.
 * Так смета, сохранённая одним сотрудником, видна всем в компании.
 *
 * Примечание: POST /api/estimates/analyze (сборка сметы по ТЗ) — отдельная история,
 * к этому контроллеру не относится: здесь только хранение готовых смет.
 */
@RestController
@RequestMapping("/api/estimates")
public class EstimateController {

    private final EstimateService estimateService;
    private final CompanyService companyService;

    public EstimateController(EstimateService estimateService, CompanyService companyService) {
        this.estimateService = estimateService;
        this.companyService = companyService;
    }

    @GetMapping
    public List<Map<String, Object>> list(@AuthenticationPrincipal AuthenticatedUser user) {
        // Без доступа к рабочему пространству — пустой список (как у схем подключения).
        if (!companyService.hasWorkspaceAccess(user)) {
            return List.of();
        }
        return estimateService.list();
    }

    @PostMapping
    public Map<String, Object> create(@RequestBody EstimateRequest req, @AuthenticationPrincipal AuthenticatedUser user) {
        requireWorkspace(user, "Сначала создайте компанию или вступите по приглашению");
        List<String> companyIds = companyService.getUserCompanyIds(user);
        String companyId = companyIds.isEmpty() ? null : companyIds.get(0);
        return estimateService.create(req, user, companyId);
    }

    @DeleteMapping("/{id}")
    public Map<String, Boolean> delete(@PathVariable String id, @AuthenticationPrincipal AuthenticatedUser user) {
        requireWorkspace(user, "Нет доступа к сметам");
        estimateService.delete(id);
        return Map.of("success", true);
    }

    private void requireWorkspace(AuthenticatedUser user, String message) {
        if (!companyService.hasWorkspaceAccess(user)) {
            throw ApiException.forbidden(message);
        }
    }
}
