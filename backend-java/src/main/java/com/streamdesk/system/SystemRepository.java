package com.streamdesk.system;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Репозиторий систем — замена getSystems/createSystem/updateSystem из IStorage.
 */
public interface SystemRepository extends JpaRepository<SystemEntity, String> {

    // аналог getSystems() — по имени
    List<SystemEntity> findAllByOrderByName();
}
