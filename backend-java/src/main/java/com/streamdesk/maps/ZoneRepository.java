package com.streamdesk.maps;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

/**
 * Репозиторий зон. Зоны всегда читаются в контексте карты (mapId), а изоляция компаний
 * обеспечивается проверкой companyId карты в сервисе.
 */
public interface ZoneRepository extends JpaRepository<Zone, String> {

    List<Zone> findByMapIdOrderByCreatedAt(String mapId);

    long countByMapId(String mapId);

    void deleteByMapId(String mapId);

    /**
     * Лёгкая проекция зоны для сводки в списке карт: без {@code points}, {@code comments} и
     * {@code photos} (jsonb-колонки, которые в списке не нужны).
     */
    interface ZoneSummaryRow {
        String getMapId();

        String getName();

        String getStatus();

        String getAssigneeId();
    }

    /**
     * Зоны сразу всех переданных карт одним запросом — чтобы список карт не делал по запросу
     * на карту. Вызывать только с непустым {@code mapIds}.
     */
    @Query("""
            select z.mapId as mapId, z.name as name, z.status as status, z.assigneeId as assigneeId
            from Zone z
            where z.mapId in :mapIds
            order by z.createdAt
            """)
    List<ZoneSummaryRow> findSummariesByMapIds(@Param("mapIds") Collection<String> mapIds);
}
