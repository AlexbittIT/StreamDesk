package com.streamdesk.estimate;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Репозиторий смет — список по времени создания и фильтр по проекту
 * (для показа смет из карточки проекта).
 */
public interface EstimateRepository extends JpaRepository<Estimate, String> {

    List<Estimate> findByOrderByCreatedAtDesc();

    List<Estimate> findByProjectIdOrderByCreatedAtDesc(String projectId);
}
