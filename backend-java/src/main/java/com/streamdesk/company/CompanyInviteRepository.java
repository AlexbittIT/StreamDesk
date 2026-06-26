package com.streamdesk.company;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/**
 * Репозиторий приглашений — замена getCompanyInviteByToken/getCompanyInvites/updateCompanyInvite.
 */
public interface CompanyInviteRepository extends JpaRepository<CompanyInvite, String> {

    // аналог getCompanyInviteByToken
    Optional<CompanyInvite> findByToken(String token);

    // аналог getCompanyInvites(companyId)
    List<CompanyInvite> findByCompanyId(String companyId);
}