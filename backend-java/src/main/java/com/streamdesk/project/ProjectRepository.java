package com.streamdesk.project;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Репозиторий проектов — замена getProjects/getProjectById/createProject и т.п.
 */
public interface ProjectRepository extends JpaRepository<Project, String> {

    // аналог getProjects() — по времени создания (DESC)
    List<Project> findByOrderByCreatedAtDesc();
}
