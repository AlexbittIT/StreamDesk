package com.streamdesk.user;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.auth.PasswordService;
import com.streamdesk.company.CompanyMember;
import com.streamdesk.company.CompanyService;
import com.streamdesk.config.ApiException;
import com.streamdesk.user.dto.PermissionsRequest;
import com.streamdesk.user.dto.UserWriteRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;

/**
 * CRUD пользователей — перенос /api/users из backend/routes.ts.
 * Выделен из UserService, т.к. зависит от CompanyService (а тот — от UserService; иначе был бы цикл).
 */
@Service
public class UserCrudService {

    private final UserService userService;
    private final CompanyService companyService;
    private final PasswordService passwordService;
    private final ObjectMapper objectMapper;

    public UserCrudService(UserService userService,
                           CompanyService companyService,
                           PasswordService passwordService,
                           ObjectMapper objectMapper) {
        this.userService = userService;
        this.companyService = companyService;
        this.passwordService = passwordService;
        this.objectMapper = objectMapper;
    }

    /** GET /api/users — видимость: владелец платформы видит всех, остальные — себя и активных коллег по компаниям. */
    public List<Map<String, Object>> listForViewer(AuthenticatedUser user) {
        if (user == null || user.id() == null) {
            throw ApiException.unauthorized("Требуется авторизация");
        }
        List<User> allUsers = userService.getActiveUsers();
        List<String> permissions = user.permissions() != null ? user.permissions() : List.of();
        if ("admin".equals(user.role()) && permissions.contains("platform:admin")) {
            return allUsers.stream().map(this::strip).toList();
        }

        Set<String> visibleIds = new HashSet<>();
        visibleIds.add(user.id());
        for (String companyId : companyService.getUserCompanyIds(user)) {
            for (CompanyMember member : companyService.getCompanyMembers(companyId)) {
                if ("active".equals(member.getStatus()) && member.getUserId() != null) {
                    visibleIds.add(member.getUserId());
                }
            }
        }
        return allUsers.stream()
                .filter(u -> visibleIds.contains(u.getId()))
                .map(this::strip)
                .toList();
    }

    public Map<String, Object> getById(String id) {
        return strip(userService.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found")));
    }

    @Transactional
    public Map<String, Object> create(UserWriteRequest req) {
        if (isBlank(req.username()) || isBlank(req.password()) || isBlank(req.name())) {
            throw ApiException.badRequest("Invalid user data");
        }
        User user = new User();
        user.setUsername(req.username());
        user.setPassword(passwordService.hashPassword(req.password()));
        user.setName(req.name());
        user.setEmail(req.email());
        user.setPhone(req.phone());
        user.setPosition(req.position());
        user.setDepartment(req.department());
        if (!isBlank(req.role())) {
            user.setRole(req.role());
        }
        if (req.permissions() != null) {
            user.setPermissions(req.permissions());
        }
        user.setTelegramId(req.telegramId());
        user.setAvatar(req.avatar());
        if (req.active() != null) {
            user.setActive(req.active());
        }
        if (req.onboardingCompleted() != null) {
            user.setOnboardingCompleted(req.onboardingCompleted());
        }
        if (!isBlank(req.workspaceMode())) {
            user.setWorkspaceMode(req.workspaceMode());
        }
        return strip(userService.save(user));
    }

    @Transactional
    public Map<String, Object> update(String id, UserWriteRequest req) {
        User user = userService.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found"));
        if (req.username() != null) {
            user.setUsername(req.username());
        }
        if (req.name() != null) {
            user.setName(req.name());
        }
        if (req.email() != null) {
            user.setEmail(req.email());
        }
        if (req.phone() != null) {
            user.setPhone(req.phone());
        }
        if (req.position() != null) {
            user.setPosition(req.position());
        }
        if (req.department() != null) {
            user.setDepartment(req.department());
        }
        if (req.role() != null) {
            user.setRole(req.role());
        }
        if (req.permissions() != null) {
            user.setPermissions(req.permissions());
        }
        if (req.telegramId() != null) {
            user.setTelegramId(req.telegramId());
        }
        if (req.avatar() != null) {
            user.setAvatar(req.avatar());
        }
        if (req.active() != null) {
            user.setActive(req.active());
        }
        if (req.onboardingCompleted() != null) {
            user.setOnboardingCompleted(req.onboardingCompleted());
        }
        if (req.workspaceMode() != null) {
            user.setWorkspaceMode(req.workspaceMode());
        }
        if (req.emailNotificationsEnabled() != null) {
            user.setEmailNotificationsEnabled(req.emailNotificationsEnabled());
        }
        if (req.password() != null && !req.password().isEmpty()) {
            user.setPassword(passwordService.hashPassword(req.password()));
        }
        return strip(userService.save(user));
    }

    @Transactional
    public Map<String, Object> updatePermissions(String id, PermissionsRequest req) {
        User user = userService.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found"));
        if (req.role() != null) {
            user.setRole(req.role());
        }
        if (req.permissions() != null) {
            user.setPermissions(req.permissions());
        }
        return strip(userService.save(user));
    }

    @Transactional
    public Map<String, Object> setAvatar(String id, MultipartFile file, String currentUserId) {
        if (!id.equals(currentUserId)) {
            throw ApiException.forbidden("Можно изменить только свой аватар");
        }
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("Файл не выбран");
        }
        User user = userService.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found"));
        try {
            Path uploadDir = Paths.get(System.getProperty("user.dir"), "uploads", "avatars");
            Files.createDirectories(uploadDir);
            String original = file.getOriginalFilename() != null ? file.getOriginalFilename() : "avatar";
            String ext = original.contains(".") ? original.substring(original.lastIndexOf('.')) : "";
            String filename = "avatar-" + System.currentTimeMillis() + "-"
                    + ThreadLocalRandom.current().nextInt(1_000_000_000) + ext;
            file.transferTo(uploadDir.resolve(filename).toFile());

            user.setAvatar("/uploads/avatars/" + filename);
            return strip(userService.save(user));
        } catch (IOException e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Не удалось загрузить аватар: " + e.getMessage());
        }
    }

    // --- helpers ---

    private Map<String, Object> strip(User user) {
        Map<String, Object> map = objectMapper.convertValue(user, new TypeReference<Map<String, Object>>() {
        });
        map.remove("password");
        return map;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
