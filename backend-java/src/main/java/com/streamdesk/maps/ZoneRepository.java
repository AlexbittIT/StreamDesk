package com.streamdesk.maps;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Репозиторий зон. Зоны всегда читаются в контексте карты (mapId), а изоляция компаний
 * обеспечивается проверкой companyId карты в сервисе.
 */
public interface ZoneRepository extends JpaRepository<Zone, String> {

    List<Zone> findByMapIdOrderByCreatedAt(String mapId);

    long countByMapId(String mapId);

    void deleteByMapId(String mapId);
}
