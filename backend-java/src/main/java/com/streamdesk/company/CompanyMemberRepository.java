package com.streamdesk.company;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/**
 * Репозиторий участников компаний — замена getUserCompanyMemberships/getCompanyMembershipByUser.
 */
public interface CompanyMemberRepository extends JpaRepository<CompanyMember, String> {

    // аналог getUserCompanyMemberships
    List<CompanyMember> findByUserId(String userId);

    // аналог getCompanyMembershipByUser
    Optional<CompanyMember> findByCompanyIdAndUserId(String companyId, String userId);

    List<CompanyMember> findByCompanyId(String companyId);
}