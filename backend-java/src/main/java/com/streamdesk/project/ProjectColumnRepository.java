package com.streamdesk.project;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/**
 * Репозиторий столбцов проекта — замена getProjectColumns/createProjectColumn и т.п.
 */
public interface ProjectColumnRepository extends JpaRepository<ProjectColumn, String> {

    // аналог getProjectColumns(projectId) — по полю order (ASC)
    List<ProjectColumn> findByProjectIdOrderByOrderAsc(String projectId);

    Optional<ProjectColumn> findByIdAndProjectId(String id, String projectId);

    void deleteByProjectId(String projectId);
}
