package com.streamdesk.equipmentports;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/**
 * Репозиторий очереди неизвестных справочнику разъёмов.
 */
public interface UnmappedTermRepository extends JpaRepository<UnmappedTerm, String> {

    List<UnmappedTerm> findByStatusOrderByCreatedAtDesc(String status);

    List<UnmappedTerm> findAllByOrderByCreatedAtDesc();

    // Не плодим дубли одного и того же неизвестного обозначения в статусе pending.
    Optional<UnmappedTerm> findFirstByTermIgnoreCaseAndStatus(String term, String status);
}
