package com.streamdesk.maps;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Репозиторий истории смен статуса зоны.
 */
public interface ZoneStatusHistoryRepository extends JpaRepository<ZoneStatusHistory, String> {

    List<ZoneStatusHistory> findByZoneIdOrderByChangedAtAsc(String zoneId);

    void deleteByZoneId(String zoneId);
}
