package com.streamdesk.company;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.config.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

/**
 * REST-контроллер компаний (/api/companies).
 * Пока минимально: получить компанию и сохранить «брендинг» (логотип/телефон/сайт/название)
 * в settings.branding — реквизиты для шапки PDF-сметы. Видны всем сотрудникам компании.
 */
@RestController
@RequestMapping("/api/companies")
public class CompanyController {

    private final CompanyService companyService;
    private final CompanyRepository companyRepository;

    public CompanyController(CompanyService companyService, CompanyRepository companyRepository) {
        this.companyService = companyService;
        this.companyRepository = companyRepository;
    }

    /** GET /api/companies/{id} — компания (с settings). Только для участников этой компании. */
    @GetMapping("/{id}")
    public Company get(@PathVariable String id, @AuthenticationPrincipal AuthenticatedUser user) {
        if (!companyService.getUserCompanyIds(user).contains(id)) {
            throw ApiException.forbidden("Нет доступа к компании");
        }
        return companyRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Компания не найдена"));
    }

    /** PUT /api/companies/{id}/branding — сохранить реквизиты для PDF. Нужны права управления компанией. */
    @PutMapping("/{id}/branding")
    @Transactional
    public Company updateBranding(@PathVariable String id,
                                  @RequestBody(required = false) Map<String, Object> branding,
                                  @AuthenticationPrincipal AuthenticatedUser user) {
        if (!companyService.canManageCompany(user, id)) {
            throw ApiException.forbidden("Недостаточно прав для изменения компании");
        }
        Company company = companyRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Компания не найдена"));
        // Новый map-объект, чтобы Hibernate точно увидел изменение jsonb-поля.
        Map<String, Object> settings = new HashMap<>(company.getSettings() != null ? company.getSettings() : Map.of());
        settings.put("branding", branding != null ? branding : new HashMap<>());
        company.setSettings(settings);
        company.setUpdatedAt(Instant.now());
        return companyRepository.save(company);
    }
}
