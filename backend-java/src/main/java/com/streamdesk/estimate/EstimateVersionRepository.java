package com.streamdesk.estimate;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Репозиторий версий смет — список версий сметы (новые сверху) и подсчёт
 * для нумерации следующей версии.
 */
public interface EstimateVersionRepository extends JpaRepository<EstimateVersion, String> {

    List<EstimateVersion> findByEstimateIdOrderByVersionNoDesc(String estimateId);

    long countByEstimateId(String estimateId);

    void deleteByEstimateId(String estimateId);
}
