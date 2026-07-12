package com.streamdesk.staff;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.company.CompanyService;
import com.streamdesk.config.ApiException;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Общая логика мультитенантности для модуля staff: разрешение целевой компании запроса
 * и проверка, что пользователь имеет к ней доступ. Барьер компании применяется ко всем
 * операциям бронирования/доступности (по образцу проектов/задач).
 */
@Component
public class StaffAccess {

    private final CompanyService companyService;

    public StaffAccess(CompanyService companyService) {
        this.companyService = companyService;
    }

    /**
     * Разрешить companyId для операции: явный из запроса либо первая компания пользователя.
     * Гарантирует, что итоговая компания входит в компании пользователя (иначе 403).
     */
    public String resolveWritableCompanyId(String requestedCompanyId, AuthenticatedUser user) {
        List<String> companies = companyService.getUserCompanyIds(user);
        String companyId = requestedCompanyId;
        if (isBlank(companyId)) {
            if (companies.isEmpty()) {
                throw ApiException.badRequest("У пользователя нет компании для бронирования");
            }
            companyId = companies.get(0);
        }
        assertMember(companyId, user);
        return companyId;
    }

    /** Компания, в контексте которой пользователь читает данные (по умолчанию первая). */
    public String resolveReadableCompanyId(String requestedCompanyId, AuthenticatedUser user) {
        return resolveWritableCompanyId(requestedCompanyId, user);
    }

    /** Пользователь должен быть участником компании (или админом). Иначе 403 — существование не важно. */
    public void assertMember(String companyId, AuthenticatedUser user) {
        if (companyId == null || companyId.isBlank()) {
            throw ApiException.badRequest("companyId is required");
        }
        if (!companyService.getUserCompanyIds(user).contains(companyId)) {
            throw ApiException.forbidden("Нет доступа к компании");
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
