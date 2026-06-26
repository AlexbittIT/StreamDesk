package com.streamdesk.onboarding;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.company.Company;
import com.streamdesk.company.CompanyInvite;
import com.streamdesk.company.CompanyInviteRepository;
import com.streamdesk.company.CompanyMember;
import com.streamdesk.company.CompanyMemberRepository;
import com.streamdesk.company.CompanyRepository;
import com.streamdesk.company.CompanyService;
import com.streamdesk.config.ApiException;
import com.streamdesk.onboarding.dto.OnboardingDtos.AddMemberRequest;
import com.streamdesk.onboarding.dto.OnboardingDtos.CompanyCreateRequest;
import com.streamdesk.user.User;
import com.streamdesk.user.UserService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Поток онбординга и управления компаниями — перенос /api/onboarding/*, /api/company-invites,
 * /api/companies/me, /api/company-members/*, /api/companies/{id}/members из backend/routes.ts.
 */
@Service
public class OnboardingService {

    private final CompanyRepository companyRepository;
    private final CompanyMemberRepository memberRepository;
    private final CompanyInviteRepository inviteRepository;
    private final UserService userService;
    private final CompanyService companyService;
    private final ObjectMapper objectMapper;
    private final SecureRandom secureRandom = new SecureRandom();

    public OnboardingService(CompanyRepository companyRepository,
                             CompanyMemberRepository memberRepository,
                             CompanyInviteRepository inviteRepository,
                             UserService userService,
                             CompanyService companyService,
                             ObjectMapper objectMapper) {
        this.companyRepository = companyRepository;
        this.memberRepository = memberRepository;
        this.inviteRepository = inviteRepository;
        this.userService = userService;
        this.companyService = companyService;
        this.objectMapper = objectMapper;
    }

    /** GET /api/companies/me — компании пользователя с участниками, заявками и активным приглашением. */
    public Map<String, Object> companiesMe(AuthenticatedUser user, String origin) {
        List<Map<String, Object>> companies = new ArrayList<>();
        Instant now = Instant.now();

        for (CompanyMember membership : memberRepository.findByUserId(user.id())) {
            Company company = companyRepository.findById(membership.getCompanyId()).orElse(null);
            if (company == null) {
                continue;
            }
            List<CompanyMember> members = memberRepository.findByCompanyId(company.getId());
            boolean canManage = companyService.canManageCompany(user, company.getId());

            CompanyInvite activeInvite = null;
            if (canManage) {
                activeInvite = inviteRepository.findByCompanyId(company.getId()).stream()
                        .filter(i -> "active".equals(i.getStatus())
                                && (i.getExpiresAt() == null || i.getExpiresAt().isAfter(now)))
                        .max(Comparator.comparing(i -> i.getCreatedAt() != null ? i.getCreatedAt() : Instant.EPOCH))
                        .orElse(null);
            }

            List<Map<String, Object>> pendingApprovals = new ArrayList<>();
            if (canManage) {
                for (CompanyMember member : members) {
                    if ("pending".equals(member.getStatus())) {
                        Map<String, Object> m = toMap(member);
                        m.put("company", company);
                        pendingApprovals.add(m);
                    }
                }
            }

            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("company", company);
            entry.put("membership", membership);
            entry.put("members", members);
            entry.put("pendingApprovals", pendingApprovals);
            entry.put("activeInvite", activeInvite != null ? inviteWithUrl(activeInvite, origin) : null);
            companies.add(entry);
        }

        Map<String, Map<String, Object>> userById = new HashMap<>();
        for (User u : userService.getAllUsers()) {
            Map<String, Object> info = new LinkedHashMap<>();
            info.put("id", u.getId());
            info.put("name", u.getName());
            info.put("email", u.getEmail());
            info.put("username", u.getUsername());
            userById.put(u.getId(), info);
        }

        List<Map<String, Object>> topPending = new ArrayList<>();
        for (Map<String, Object> entry : companies) {
            for (Map<String, Object> member : asMapList(entry.get("pendingApprovals"))) {
                Map<String, Object> withUser = new LinkedHashMap<>(member);
                withUser.put("user", userById.get(String.valueOf(member.get("userId"))));
                topPending.add(withUser);
            }
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("companies", companies);
        response.put("pendingApprovals", topPending);
        return response;
    }

    /** POST /api/company-invites — создать приглашение (старые активные отзываются). */
    @Transactional
    public Map<String, Object> createInvite(AuthenticatedUser user, String companyId, String origin) {
        if (companyId == null || companyId.isBlank()) {
            throw ApiException.badRequest("companyId обязателен");
        }
        if (!companyService.canManageCompany(user, companyId)) {
            throw ApiException.forbidden("Недостаточно прав для приглашений");
        }
        for (CompanyInvite old : inviteRepository.findByCompanyId(companyId)) {
            if ("active".equals(old.getStatus())) {
                old.setStatus("revoked");
                inviteRepository.save(old);
            }
        }
        CompanyInvite invite = new CompanyInvite();
        invite.setCompanyId(companyId);
        invite.setToken(randomHex(24));
        invite.setCreatedBy(user.id());
        invite.setRole("member");
        invite.setStatus("active");
        invite.setExpiresAt(Instant.now().plus(24, ChronoUnit.HOURS));
        invite = inviteRepository.save(invite);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("invite", invite);
        response.put("url", origin + "/login?invite=" + invite.getToken());
        return response;
    }

    /** GET /api/company-invites/resolve/{token}. */
    public Map<String, Object> resolveInvite(String token) {
        CompanyInvite invite = inviteRepository.findByToken(token != null ? token : "")
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Приглашение не найдено"));
        Company company = companyRepository.findById(invite.getCompanyId()).orElse(null);
        boolean expired = invite.getExpiresAt() != null && !invite.getExpiresAt().isAfter(Instant.now());
        boolean valid = "active".equals(invite.getStatus()) && !expired && company != null;

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("invite", invite);
        response.put("company", company);
        response.put("valid", valid);
        response.put("expired", expired);
        return response;
    }

    /** POST /api/onboarding/personal. */
    @Transactional
    public Map<String, Object> personal(AuthenticatedUser user) {
        User updated = updateUserState(user.id(), "personal");
        return Map.of("user", stripUser(updated));
    }

    /** POST /api/onboarding/company — создать компанию и стать владельцем. */
    @Transactional
    public Map<String, Object> createCompany(AuthenticatedUser user, CompanyCreateRequest req) {
        String name = req != null && req.name() != null ? req.name().trim() : "";
        if (name.isEmpty()) {
            throw ApiException.badRequest("Укажите название компании");
        }
        Company company = new Company();
        company.setName(name);
        company.setDescription(req.description() != null && !req.description().isBlank() ? req.description().trim() : null);
        company.setOwnerId(user.id());
        company.setStatus("active");
        Map<String, Object> settings = new HashMap<>();
        settings.put("needs", req.needs() != null ? req.needs() : new ArrayList<>());
        company.setSettings(settings);
        company = companyRepository.save(company);

        CompanyMember owner = new CompanyMember();
        owner.setCompanyId(company.getId());
        owner.setUserId(user.id());
        owner.setRole("owner");
        owner.setStatus("active");
        owner.setJoinedAt(Instant.now());
        memberRepository.save(owner);

        User updated = updateUserState(user.id(), "company_owner");
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("company", company);
        response.put("user", stripUser(updated));
        return response;
    }

    /** POST /api/onboarding/join — вступить по токену приглашения. */
    @Transactional
    public Map<String, Object> join(AuthenticatedUser user, String token) {
        CompanyInvite invite = inviteRepository.findByToken(token != null ? token.trim() : "")
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Приглашение не найдено"));
        boolean expired = invite.getExpiresAt() != null && !invite.getExpiresAt().isAfter(Instant.now());
        if (!"active".equals(invite.getStatus()) || expired) {
            throw ApiException.badRequest("Приглашение не активно или срок истёк");
        }

        CompanyMember existing = memberRepository.findByCompanyIdAndUserId(invite.getCompanyId(), user.id()).orElse(null);
        if (existing != null) {
            if (!"active".equals(existing.getStatus())) {
                existing.setStatus("active");
                existing.setApprovedBy(invite.getCreatedBy());
                existing.setJoinedAt(Instant.now());
                existing = memberRepository.save(existing);
            }
            User updatedUser = updateUserState(user.id(), "company_member");
            return joinResponse(existing, updatedUser, "Вы в компании");
        }

        CompanyMember membership = new CompanyMember();
        membership.setCompanyId(invite.getCompanyId());
        membership.setUserId(user.id());
        membership.setRole(invite.getRole() != null ? invite.getRole() : "member");
        membership.setStatus("active");
        membership.setInvitedBy(invite.getCreatedBy());
        membership.setApprovedBy(invite.getCreatedBy());
        membership.setJoinedAt(Instant.now());
        membership = memberRepository.save(membership);

        invite.setUsedBy(user.id());
        invite.setUsedAt(Instant.now());
        inviteRepository.save(invite);

        User updatedUser = updateUserState(user.id(), "company_member");
        return joinResponse(membership, updatedUser, "Вы добавлены в компанию");
    }

    /** POST /api/company-members/{memberId}/approve. */
    @Transactional
    public CompanyMember approve(AuthenticatedUser user, String memberId, String companyId) {
        if (!companyService.canManageCompany(user, companyId)) {
            throw ApiException.forbidden("Нет прав на подтверждение");
        }
        CompanyMember member = memberRepository.findById(memberId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Заявка не найдена"));
        member.setStatus("active");
        member.setApprovedBy(user.id());
        member.setJoinedAt(Instant.now());
        member = memberRepository.save(member);
        updateUserState(member.getUserId(), "company_member");
        return member;
    }

    /** POST /api/companies/{companyId}/members — добавить пользователя в компанию. */
    @Transactional
    public CompanyMember addMember(AuthenticatedUser user, String companyId, AddMemberRequest req) {
        String userId = req != null && req.userId() != null ? req.userId().trim() : "";
        String role = req != null && req.role() != null && !req.role().isBlank() ? req.role().trim() : "member";
        if (userId.isEmpty()) {
            throw ApiException.badRequest("Укажите пользователя");
        }
        if (!companyService.canManageCompany(user, companyId)) {
            throw ApiException.forbidden("Нет прав на управление компанией");
        }
        if (userService.findById(userId).isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Пользователь не найден");
        }

        CompanyMember existing = memberRepository.findByCompanyIdAndUserId(companyId, userId).orElse(null);
        CompanyMember member;
        if (existing != null) {
            existing.setRole(role);
            existing.setStatus("active");
            existing.setApprovedBy(user.id());
            existing.setJoinedAt(Instant.now());
            member = memberRepository.save(existing);
        } else {
            member = new CompanyMember();
            member.setCompanyId(companyId);
            member.setUserId(userId);
            member.setRole(role);
            member.setStatus("active");
            member.setInvitedBy(user.id());
            member.setApprovedBy(user.id());
            member.setJoinedAt(Instant.now());
            member = memberRepository.save(member);
        }
        updateUserState(userId, "company_member");
        return member;
    }

    // --- helpers ---

    private Map<String, Object> joinResponse(CompanyMember membership, User user, String message) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("membership", membership);
        response.put("user", stripUser(user));
        response.put("message", message);
        return response;
    }

    private User updateUserState(String userId, String workspaceMode) {
        return userService.findById(userId).map(u -> {
            u.setActive(true);
            u.setOnboardingCompleted(true);
            u.setWorkspaceMode(workspaceMode);
            return userService.save(u);
        }).orElse(null);
    }

    private Map<String, Object> inviteWithUrl(CompanyInvite invite, String origin) {
        Map<String, Object> m = toMap(invite);
        m.put("url", origin + "/login?invite=" + invite.getToken());
        return m;
    }

    private Map<String, Object> stripUser(User user) {
        if (user == null) {
            return null;
        }
        Map<String, Object> map = toMap(user);
        map.remove("password");
        return map;
    }

    private Map<String, Object> toMap(Object entity) {
        return objectMapper.convertValue(entity, new TypeReference<Map<String, Object>>() {
        });
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> asMapList(Object o) {
        return o instanceof List ? (List<Map<String, Object>>) o : new ArrayList<>();
    }

    private String randomHex(int bytes) {
        byte[] buf = new byte[bytes];
        secureRandom.nextBytes(buf);
        StringBuilder sb = new StringBuilder();
        for (byte b : buf) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}
