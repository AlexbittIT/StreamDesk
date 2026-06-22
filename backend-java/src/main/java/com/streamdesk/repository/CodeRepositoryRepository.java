package com.streamdesk.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Spring Data репозиторий для сущности CodeRepository — замена getRepositories/createRepository и т.п.
 */
public interface CodeRepositoryRepository extends JpaRepository<CodeRepository, String> {

    // аналог getRepositories() — по имени
    List<CodeRepository> findAllByOrderByName();
}
