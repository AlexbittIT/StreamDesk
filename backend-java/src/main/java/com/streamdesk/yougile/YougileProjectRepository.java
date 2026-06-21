package com.streamdesk.yougile;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Репозиторий кэша проектов YouGile — замена getYougileProjects/upsertYougileProjects из database.ts.
 */
public interface YougileProjectRepository extends JpaRepository<YougileProject, String> {
}
