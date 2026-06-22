package com.streamdesk.company;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.user.User;
import com.streamdesk.user.UserService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Логика компаний, членства и приглашений — перенос соответствующих веток backend/routes.ts.
 */
@Service
public class CompanyService {

    private final CompanyRepository companyRepository;
    private final CompanyMemberRepository memberRepository;
    private final CompanyInviteRepository inviteRepository;
    private final UserService userService;

    public CompanyService(CompanyRepository companyRepository,
                          CompanyMemberRepository memberRepository,
                          CompanyInviteRepository inviteRepository,
                          UserService userService) {
        this.companyRepository = companyRepository;
        this.memberRepository = memberRepository;
        this.inviteRepository = inviteRepository;
        this.userService = userService;
    }

    public List<CompanyMember> getUserMemberships(String userId) {
        return memberRepository.findByUserId(userId);
    }

    public List<Company> getAllCompanies() {
        return companyRepository.findAll();
    }

    public List<CompanyMember> getCompanyMembers(String companyId) {
        return memberRepository.findByCompanyId(companyId);
    }

    /** Пометить все членства пользователя как removed (при удалении пользователя платформой). */
    public void removeUserMemberships(String userId) {
        for (CompanyMember member : memberRepository.findByUserId(userId)) {
            member.setStatus("removed");
            member.setUpdatedAt(java.time.Instant.now());
            memberRepository.save(member);
        }
    }

    public Optional<Company> getCompanyById(String id) {
        return companyRepository.findById(id);
    }

    /** Приглашение по токену, если оно активно и не просрочено (как проверки в routes.ts). */
    public Optional<CompanyInvite> getValidInvite(String token) {
        if (token == null || token.isBlank()) {
            return Optional.empty();
        }
        return inviteRepository.findByToken(token.trim())
                .filter(invite -> "active".equals(invite.getStatus()))
                .filter(invite -> invite.getExpiresAt() == null || invite.getExpiresAt().isAfter(Instant.now()));
    }

    public boolean hasActiveMembership(String userId) {
        return getUserMemberships(userId).stream().anyMatch(m -> "active".equals(m.getStatus()));
    }

    /** workspaceKey компании из settings.monitoring.workspaceKey (или null). */
    @SuppressWarnings("unchecked")
    public String getWorkspaceKey(String companyId) {
        if (companyId == null || companyId.isBlank()) {
            return null;
        }
        Company company = companyRepository.findById(companyId).orElse(null);
        if (company == null || company.getSettings() == null) {
            return null;
        }
        Object monitoring = company.getSettings().get("monitoring");
        if (!(monitoring instanceof Map<?, ?> map)) {
            return null;
        }
        Object key = ((Map<String, Object>) map).get("workspaceKey");
        return key != null && !String.valueOf(key).isBlank() ? String.valueOf(key) : null;
    }

    /** Может ли пользователь управлять компанией — порт canManageCompany. Админ всегда да. */
    public boolean canManageCompany(AuthenticatedUser user, String companyId) {
        if (user == null || user.id() == null || companyId == null || companyId.isBlank()) {
            return false;
        }
        if ("admin".equals(user.role())) {
            return true;
        }
        return memberRepository.findByCompanyIdAndUserId(companyId, user.id())
                .map(m -> "active".equals(m.getStatus()) && ("owner".equals(m.getRole()) || "admin".equals(m.getRole())))
                .orElse(false);
    }

    /** Гарантирует workspaceKey в settings.monitoring (создаёт при отсутствии). Порт ensureCompanyWorkspaceKey. */
    @Transactional
    @SuppressWarnings("unchecked")
    public String ensureWorkspaceKey(String companyId) {
        Company company = companyRepository.findById(companyId).orElse(null);
        if (company == null) {
            return "";
        }
        Map<String, Object> settings = company.getSettings() != null ? company.getSettings() : new java.util.HashMap<>();
        Map<String, Object> monitoring = settings.get("monitoring") instanceof Map
                ? (Map<String, Object>) settings.get("monitoring") : new java.util.HashMap<>();
        String current = monitoring.get("workspaceKey") != null ? String.valueOf(monitoring.get("workspaceKey")).trim() : "";
        if (!current.isEmpty()) {
            return current;
        }
        byte[] buf = new byte[18];
        new java.security.SecureRandom().nextBytes(buf);
        StringBuilder hex = new StringBuilder();
        for (byte b : buf) {
            hex.append(String.format("%02x", b));
        }
        String workspaceKey = "sd_" + hex;
        monitoring.put("enabled", true);
        monitoring.put("workspaceKey", workspaceKey);
        settings.put("monitoring", monitoring);
        company.setSettings(settings);
        companyRepository.save(company);
        return workspaceKey;
    }

    /** Доступ к рабочему пространству — порт hasWorkspaceAccess из routes.ts. Админ всегда да. */
    public boolean hasWorkspaceAccess(AuthenticatedUser user) {
        if (user == null) {
            return false;
        }
        if ("admin".equals(user.role())) {
            return true;
        }
        return hasActiveMembership(user.id());
    }

    /** Id компаний пользователя — порт getUserCompanyIds. Админ видит все компании. */
    public List<String> getUserCompanyIds(AuthenticatedUser user) {
        if (user == null || user.id() == null) {
            return List.of();
        }
        if ("admin".equals(user.role())) {
            return companyRepository.findAll().stream().map(Company::getId).toList();
        }
        return getUserMemberships(user.id()).stream()
                .filter(m -> "active".equals(m.getStatus()))
                .map(CompanyMember::getCompanyId)
                .toList();
    }

    /**
     * Реактивация неактивного пользователя при логине — порт ветки `user.active === false` из login.
     * Возвращает обновлённого пользователя, либо empty, если входить ещё нельзя (ответ 403).
     */
    public Optional<User> reactivateInactiveUser(User user, String inviteToken) {
        List<CompanyMember> memberships = getUserMemberships(user.getId());
        boolean hasCompanyPath = memberships.stream()
                .anyMatch(m -> "active".equals(m.getStatus()) || "pending".equals(m.getStatus()));

        CompanyInvite invite = getValidInvite(inviteToken).orElse(null);
        CompanyMember inviteMembership = null;

        if (invite != null) {
            Optional<CompanyMember> existing = memberRepository.findByCompanyIdAndUserId(invite.getCompanyId(), user.getId());
            if (existing.isPresent()) {
                CompanyMember m = existing.get();
                if (!"active".equals(m.getStatus())) {
                    m.setStatus("active");
                    m.setApprovedBy(invite.getCreatedBy());
                    m.setJoinedAt(Instant.now());
                    m = memberRepository.save(m);
                }
                inviteMembership = m;
            } else {
                CompanyMember m = new CompanyMember();
                m.setCompanyId(invite.getCompanyId());
                m.setUserId(user.getId());
                m.setRole(invite.getRole() != null ? invite.getRole() : "member");
                m.setStatus("active");
                m.setInvitedBy(invite.getCreatedBy());
                m.setApprovedBy(invite.getCreatedBy());
                m.setJoinedAt(Instant.now());
                inviteMembership = memberRepository.save(m);
            }
            invite.setUsedBy(user.getId());
            invite.setUsedAt(Instant.now());
            inviteRepository.save(invite);
        }

        if (invite == null && !hasCompanyPath) {
            return Optional.empty();
        }

        CompanyMember activeMembership = (inviteMembership != null && "active".equals(inviteMembership.getStatus()))
                ? inviteMembership
                : memberships.stream().filter(m -> "active".equals(m.getStatus())).findFirst().orElse(null);

        user.setActive(true);
        user.setOnboardingCompleted(activeMembership != null);
        user.setWorkspaceMode(activeMembership != null ? "company_member" : "pending");
        return Optional.of(userService.save(user));
    }

    /** Принять приглашение при регистрации: создать участника и пометить инвайт использованным. */
    public void acceptInvite(User user, CompanyInvite invite) {
        CompanyMember m = new CompanyMember();
        m.setCompanyId(invite.getCompanyId());
        m.setUserId(user.getId());
        m.setRole(invite.getRole() != null ? invite.getRole() : "member");
        m.setStatus("active");
        m.setInvitedBy(invite.getCreatedBy());
        m.setApprovedBy(invite.getCreatedBy());
        m.setJoinedAt(Instant.now());
        memberRepository.save(m);

        invite.setUsedBy(user.getId());
        invite.setUsedAt(Instant.now());
        inviteRepository.save(invite);
    }

    /** Данные для GET /api/auth/onboarding-state. */
    public Map<String, Object> buildOnboardingState(AuthenticatedUser user) {
        List<Map<String, Object>> active = new ArrayList<>();
        List<Map<String, Object>> pending = new ArrayList<>();

        for (CompanyMember membership : getUserMemberships(user.id())) {
            Company company = getCompanyById(membership.getCompanyId()).orElse(null);
            if (company == null) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("membership", membership);
            row.put("company", company);
            if ("active".equals(membership.getStatus())) {
                active.add(row);
            } else {
                pending.add(row);
            }
        }

        List<String> permissions = user.permissions() != null ? user.permissions() : new ArrayList<>();

        Map<String, Object> userBlock = new LinkedHashMap<>();
        userBlock.put("id", user.id());
        userBlock.put("name", user.name());
        userBlock.put("onboardingCompleted", user.onboardingCompleted());
        userBlock.put("workspaceMode", user.workspaceMode() != null ? user.workspaceMode() : "pending");
        userBlock.put("permissions", permissions);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("user", userBlock);
        response.put("isPlatformAdmin", "admin".equals(user.role()) && permissions.contains("platform:admin"));
        response.put("activeCompanies", active);
        response.put("pendingCompanies", pending);
        return response;
    }
}