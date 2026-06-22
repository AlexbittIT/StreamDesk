package com.streamdesk.onboarding;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.company.CompanyMember;
import com.streamdesk.config.ApiException;
import com.streamdesk.onboarding.dto.OnboardingDtos.AddMemberRequest;
import com.streamdesk.onboarding.dto.OnboardingDtos.ApproveRequest;
import com.streamdesk.onboarding.dto.OnboardingDtos.CompanyCreateRequest;
import com.streamdesk.onboarding.dto.OnboardingDtos.InviteRequest;
import com.streamdesk.onboarding.dto.OnboardingDtos.JoinRequest;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * REST-контроллер онбординга/компаний — перенос соответствующих маршрутов из backend/routes.ts.
 */
@RestController
public class OnboardingController {

    private final OnboardingService onboardingService;

    public OnboardingController(OnboardingService onboardingService) {
        this.onboardingService = onboardingService;
    }

    @GetMapping("/api/companies/me")
    public Map<String, Object> companiesMe(@AuthenticationPrincipal AuthenticatedUser user, HttpServletRequest request) {
        requireAuth(user);
        return onboardingService.companiesMe(user, origin(request));
    }

    @PostMapping("/api/company-invites")
    public Map<String, Object> createInvite(@RequestBody InviteRequest req,
                                            @AuthenticationPrincipal AuthenticatedUser user,
                                            HttpServletRequest request) {
        requireAuth(user);
        return onboardingService.createInvite(user, req != null ? req.companyId() : null, origin(request));
    }

    @GetMapping("/api/company-invites/resolve/{token}")
    public Map<String, Object> resolveInvite(@PathVariable String token) {
        return onboardingService.resolveInvite(token);
    }

    @PostMapping("/api/onboarding/personal")
    public Map<String, Object> personal(@AuthenticationPrincipal AuthenticatedUser user) {
        requireAuth(user);
        return onboardingService.personal(user);
    }

    @PostMapping("/api/onboarding/company")
    public Map<String, Object> createCompany(@RequestBody CompanyCreateRequest req,
                                             @AuthenticationPrincipal AuthenticatedUser user) {
        requireAuth(user);
        return onboardingService.createCompany(user, req);
    }

    @PostMapping("/api/onboarding/join")
    public Map<String, Object> join(@RequestBody JoinRequest req, @AuthenticationPrincipal AuthenticatedUser user) {
        requireAuth(user);
        return onboardingService.join(user, req != null ? req.token() : null);
    }

    @PostMapping("/api/company-members/{memberId}/approve")
    public CompanyMember approve(@PathVariable String memberId, @RequestBody(required = false) ApproveRequest req,
                                 @AuthenticationPrincipal AuthenticatedUser user) {
        requireAuth(user);
        return onboardingService.approve(user, memberId, req != null ? req.companyId() : null);
    }

    @PostMapping("/api/companies/{companyId}/members")
    public CompanyMember addMember(@PathVariable String companyId, @RequestBody AddMemberRequest req,
                                   @AuthenticationPrincipal AuthenticatedUser user) {
        requireAuth(user);
        return onboardingService.addMember(user, companyId, req);
    }

    private void requireAuth(AuthenticatedUser user) {
        if (user == null || user.id() == null) {
            throw ApiException.unauthorized("Требуется авторизация");
        }
    }

    private String origin(HttpServletRequest request) {
        String forwardedProto = request.getHeader("X-Forwarded-Proto");
        String protocol = forwardedProto != null && !forwardedProto.isBlank()
                ? forwardedProto.split(",")[0].trim()
                : request.getScheme();
        String host = request.getHeader("Host");
        if (host == null || host.isBlank()) {
            host = request.getServerName() + ":" + request.getServerPort();
        }
        return protocol + "://" + host;
    }
}
