package com.streamdesk.yougile;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Репозиторий кэша пользователей YouGile — замена upsertYougileUsers из database.ts.
 */
public interface YougileUserRepository extends JpaRepository<YougileUser, String> {
}
