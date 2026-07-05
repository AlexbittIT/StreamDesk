package com.streamdesk.maps;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Репозиторий карт. Все выборки — по companyId (изоляция компаний, docs/maps-api.md §7).
 */
public interface MapRepository extends JpaRepository<SiteMap, String> {

    List<SiteMap> findByCompanyIdOrderByCreatedAtDesc(String companyId);

    List<SiteMap> findByCompanyIdAndVenueIdOrderByCreatedAtDesc(String companyId, String venueId);
}
