package com.streamdesk.onboarding.dto;

import java.util.List;

/**
 * DTO потока онбординга/компаний.
 */
public final class OnboardingDtos {

    private OnboardingDtos() {
    }

    public record CompanyCreateRequest(String name, String description, List<Object> needs) {
    }

    public record JoinRequest(String token) {
    }

    public record InviteRequest(String companyId) {
    }

    public record ApproveRequest(String companyId) {
    }

    public record AddMemberRequest(String userId, String role) {
    }
}
