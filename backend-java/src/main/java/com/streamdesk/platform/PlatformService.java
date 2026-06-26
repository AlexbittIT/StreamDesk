package com.streamdesk.platform;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.streamdesk.auth.PasswordService;
import com.streamdesk.company.Company;
import com.streamdesk.company.CompanyMember;
import com.streamdesk.company.CompanyService;
import com.streamdesk.config.ApiException;
import com.streamdesk.user.User;
import com.streamdesk.user.UserService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Логика платформы — управление пользователями владельцем платформы.
 * Перенос /api/platform/users из backend/routes.ts.
 */
@Service
public class PlatformService {

    private final UserService userService;
    private final CompanyService companyService;
    private final PasswordService passwordService;
    private final ObjectMapper objectMapper;

    public PlatformService(UserService userService,
                           CompanyService companyService,
                           PasswordService passwordService,
                           ObjectMapper objectMapper) {
        this.userService = userService;
        this.companyService = companyService;
        this.passwordService = passwordService;
        this.objectMapper = objectMapper;
    }

    /** GET /api/platform/users — все пользователи с их членством в компаниях (без паролей). */
    public List<Map<String, Object>> listUsers() {
        List<Company> companies = companyService.getAllCompanies();
        Map<String, Company> companyById = companies.stream()
                .collect(Collectors.toMap(Company::getId, Function.identity(), (a, b) -> a));

        Map<String, List<Map<String, Object>>> byUser = new LinkedHashMap<>();
        for (Company company : companies) {
            for (CompanyMember member : companyService.getCompanyMembers(company.getId())) {
                Map<String, Object> membership = toMap(member);
                membership.put("company", companyById.get(member.getCompanyId()));
                byUser.computeIfAbsent(member.getUserId(), k -> new ArrayList<>()).add(membership);
            }
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (User user : userService.getAllUsers()) {
            Map<String, Object> userMap = toMap(user);
            userMap.remove("password");
            userMap.put("memberships", byUser.getOrDefault(user.getId(), new ArrayList<>()));
            result.add(userMap);
        }
        return result;
    }

    @Transactional
    public Map<String, Object> resetPassword(String id, String passwordInput) {
        String password = passwordInput != null ? passwordInput.trim() : "";
        if (password.length() < 6) {
            throw ApiException.badRequest("Пароль должен быть минимум 6 символов");
        }
        User user = userService.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Пользователь не найден"));
        user.setPassword(passwordService.hashPassword(password));
        User saved = userService.save(user);

        Map<String, Object> userMap = toMap(saved);
        userMap.remove("password");
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("user", userMap);
        return response;
    }

    @Transactional
    public void deleteUser(String currentUserId, String id) {
        if (id.equals(currentUserId)) {
            throw ApiException.badRequest("Нельзя удалить свой аккаунт владельца");
        }
        User target = userService.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Пользователь не найден"));

        // Нельзя удалить последнего владельца платформы.
        if ("admin".equals(target.getRole()) && permissions(target).contains("platform:admin")) {
            long activePlatformAdmins = userService.getAllUsers().stream()
                    .filter(u -> !Boolean.FALSE.equals(u.getActive()))
                    .filter(u -> "admin".equals(u.getRole()))
                    .filter(u -> permissions(u).contains("platform:admin"))
                    .count();
            if (activePlatformAdmins <= 1) {
                throw ApiException.badRequest("Нельзя удалить последнего владельца платформы");
            }
        }

        companyService.removeUserMemberships(id);
        userService.deleteById(id);
    }

    private List<String> permissions(User user) {
        return user.getPermissions() != null ? user.getPermissions() : List.of();
    }

    private Map<String, Object> toMap(Object entity) {
        return objectMapper.convertValue(entity, new TypeReference<Map<String, Object>>() {
        });
    }
}
