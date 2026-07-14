package com.streamdesk.auth;

import com.streamdesk.auth.dto.LoginRequest;
import com.streamdesk.auth.dto.RegisterRequest;
import com.streamdesk.auth.dto.UserResponse;
import com.streamdesk.company.CompanyInvite;
import com.streamdesk.company.CompanyService;
import com.streamdesk.config.ApiException;
import com.streamdesk.notification.NotificationService;
import com.streamdesk.user.User;
import com.streamdesk.user.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Авторизация — перенос /api/auth/* из backend/routes.ts.
 * Сессия хранится в HttpSession (как express-session): в неё кладётся userId,
 * а SessionAuthenticationFilter на каждом запросе восстанавливает из неё пользователя.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);

    private final UserService userService;
    private final PasswordService passwordService;
    private final CompanyService companyService;
    private final NotificationService notificationService;

    private final boolean fallbackAdminEnabled;
    private final String fallbackAdminUsername;
    private final String fallbackAdminPassword;

    public AuthController(UserService userService,
                          PasswordService passwordService,
                          CompanyService companyService,
                          NotificationService notificationService,
                          @Value("${app.auth.fallback-admin-enabled:true}") boolean fallbackAdminEnabled,
                          @Value("${app.auth.admin-username:admin}") String fallbackAdminUsername,
                          @Value("${app.auth.admin-password:admin123}") String fallbackAdminPassword) {
        this.userService = userService;
        this.passwordService = passwordService;
        this.companyService = companyService;
        this.notificationService = notificationService;
        this.fallbackAdminEnabled = fallbackAdminEnabled;
        this.fallbackAdminUsername = fallbackAdminUsername;
        this.fallbackAdminPassword = fallbackAdminPassword;
    }

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody LoginRequest body, HttpServletRequest request) {
        String username = trim(body.username());
        String password = body.password();
        String inviteToken = trim(body.invite());

        if (isBlank(username) || isBlank(password)) {
            throw ApiException.badRequest("Укажите логин и пароль");
        }

        // Fallback-админ для теста (как ALLOW_FALLBACK_ADMIN/ADMIN_* в Express).
        if (fallbackAdminEnabled
                && username.equals(fallbackAdminUsername)
                && password.equals(fallbackAdminPassword)) {
            startSession(request, AuthConstants.FALLBACK_ADMIN_ID);
            return userPayload(UserResponse.fromPrincipal(AuthConstants.fallbackAdmin(fallbackAdminUsername)));
        }

        User user = userService.findByUsername(username).orElse(null);
        boolean adminJustCreated = false;

        // Пользователь не найден: на admin/admin123 при пустой БД создаём админа (как в routes.ts).
        if (user == null) {
            if (username.equals("admin") && password.equals("admin123")) {
                if (!userService.adminExists()) {
                    user = createDefaultAdmin();
                    adminJustCreated = true;
                    log.info("[Auth] Создан пользователь admin (БД без админа)");
                } else {
                    user = userService.findByUsername("admin").orElse(null);
                    if (user == null) {
                        throw ApiException.unauthorized("Неверный логин или пароль");
                    }
                }
            } else {
                throw ApiException.unauthorized("Неверный логин или пароль");
            }
        }

        if (!adminJustCreated) {
            PasswordService.VerifyResult check = passwordService.verifyPassword(password, user.getPassword());
            if (!check.ok()) {
                throw ApiException.unauthorized("Неверный логин или пароль");
            }
            if (check.updateHash() != null) {
                user.setPassword(check.updateHash());
                user = userService.save(user);
            }
        }

        // Перманентный бан: вход закрыт навсегда, никакой реактивации.
        if (Boolean.TRUE.equals(user.getBanned())) {
            throw ApiException.forbidden("Ваш аккаунт заблокирован администратором. Доступ закрыт.");
        }

        // Неактивный аккаунт: пробуем реактивировать по приглашению/членству, иначе 403.
        if (Boolean.FALSE.equals(user.getActive())) {
            user = companyService.reactivateInactiveUser(user, inviteToken)
                    .orElseThrow(() -> ApiException.forbidden(
                            "Ваш аккаунт ещё не подтверждён администратором. Если у вас есть приглашение в компанию, "
                                    + "откройте ссылку-приглашение и войдите ещё раз."));
        }

        userService.updateLastLogin(user.getId());
        startSession(request, user.getId());
        log.info("[Auth] Успешный вход: {} ({})", user.getUsername(), user.getRole());
        return userPayload(UserResponse.fromEntity(user));
    }

    @PostMapping("/logout")
    public Map<String, Object> logout(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("ok", true);
        return response;
    }

    @PostMapping("/register")
    public Map<String, Object> register(@RequestBody RegisterRequest body, HttpServletRequest request) {
        String username = trim(body.username());
        String password = body.password();
        String name = trim(body.name());
        String email = trim(body.email());
        String inviteToken = trim(body.invite());

        if (isBlank(username) || isBlank(password) || isBlank(name)) {
            throw ApiException.badRequest("Заполните логин, имя и пароль");
        }
        if (userService.findByUsername(username).isPresent()) {
            throw ApiException.badRequest("Пользователь с таким логином уже существует");
        }
        if (!isBlank(email) && userService.isEmailTaken(email)) {
            throw ApiException.badRequest("Пользователь с такой почтой уже существует. "
                    + "Однофамильцы допустимы, но логин и почта должны быть уникальными.");
        }

        CompanyInvite invite = null;
        if (!isBlank(inviteToken)) {
            invite = companyService.getValidInvite(inviteToken)
                    .orElseThrow(() -> ApiException.badRequest("Приглашение не активно или срок истёк"));
        }

        User user = new User();
        user.setUsername(username);
        user.setPassword(passwordService.hashPassword(password));
        user.setName(name);
        if (!isBlank(email)) {
            user.setEmail(email);
        }
        user.setRole("employee");
        user.setPermissions(new ArrayList<>());
        user.setActive(true);
        user.setOnboardingCompleted(invite != null);
        user.setWorkspaceMode(invite != null ? "company_member" : "pending");
        User saved = userService.save(user);

        if (invite != null) {
            companyService.acceptInvite(saved, invite);
        }

        // Уведомление всем администраторам о новой заявке (как в Express).
        String adminMessage = invite != null
                ? saved.getName() + " (" + saved.getUsername() + ") зарегистрировался по приглашению и добавлен в компанию."
                : saved.getName() + " (" + saved.getUsername() + ") хочет присоединиться. Подтвердите в админ-панели.";
        for (User admin : userService.getAllUsers()) {
            if ("admin".equals(admin.getRole())) {
                notificationService.notify(admin.getId(), "Новая заявка на регистрацию", adminMessage, "info");
            }
        }

        startSession(request, saved.getId());

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("message", invite != null
                ? "Аккаунт создан, вы добавлены в компанию."
                : "Аккаунт создан. Выберите личный режим, создайте компанию или вступите по приглашению.");
        response.put("user", UserResponse.fromEntity(saved));
        return response;
    }

    @GetMapping("/me")
    public Map<String, Object> me(@AuthenticationPrincipal AuthenticatedUser principal) {
        if (principal == null) {
            throw ApiException.unauthorized("Требуется авторизация");
        }
        return userPayload(UserResponse.fromPrincipal(principal));
    }

    @GetMapping("/onboarding-state")
    public Map<String, Object> onboardingState(@AuthenticationPrincipal AuthenticatedUser principal) {
        if (principal == null) {
            throw ApiException.unauthorized("Требуется авторизация");
        }
        return companyService.buildOnboardingState(principal);
    }

    // --- helpers ---

    private User createDefaultAdmin() {
        User admin = new User();
        admin.setUsername("admin");
        admin.setPassword(passwordService.hashPassword("admin123"));
        admin.setName("Администратор");
        admin.setEmail("admin@streamstudio.local");
        admin.setRole("admin");
        admin.setPermissions(new ArrayList<>(AuthConstants.FALLBACK_ADMIN_PERMISSIONS));
        admin.setActive(true);
        return userService.save(admin);
    }

    private void startSession(HttpServletRequest request, String userId) {
        request.getSession(true).setAttribute(AuthConstants.SESSION_USER_ID, userId);
    }

    private Map<String, Object> userPayload(UserResponse user) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("user", user);
        return response;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static String trim(String s) {
        return s == null ? null : s.trim();
    }
}