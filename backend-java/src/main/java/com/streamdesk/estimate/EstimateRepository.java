package com.streamdesk.estimate;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Репозиторий сохранённых смет.
 */
public interface EstimateRepository extends JpaRepository<Estimate, String> {

    // Список смет, новые сверху (как сортировалась история на фронте).
    List<Estimate> findByOrderByCreatedAtDesc();
}
