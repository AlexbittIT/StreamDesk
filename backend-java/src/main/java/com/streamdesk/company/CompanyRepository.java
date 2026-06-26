package com.streamdesk.company;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Репозиторий компаний — замена getCompanyById/createCompany из IStorage.
 */
public interface CompanyRepository extends JpaRepository<Company, String> {
}