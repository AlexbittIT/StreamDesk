package com.streamdesk.maps;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.config.ApiException;
import com.streamdesk.maps.dto.MapCreateRequest;
import com.streamdesk.maps.dto.MapResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

/**
 * CRUD карт (планов площадок). Изоляция компаний — через {@link MapsAccess}.
 * Загрузка подложки, комментарии и фото — отдельные задачи (VM-04/VM-16) и здесь не реализуются.
 */
@Service
public class MapService {

    private final MapRepository mapRepository;
    private final ZoneRepository zoneRepository;
    private final ZoneStatusHistoryRepository historyRepository;
    private final MapsAccess access;

    public MapService(MapRepository mapRepository,
                      ZoneRepository zoneRepository,
                      ZoneStatusHistoryRepository historyRepository,
                      MapsAccess access) {
        this.mapRepository = mapRepository;
        this.zoneRepository = zoneRepository;
        this.historyRepository = historyRepository;
        this.access = access;
    }

    /** Список карт компании пользователя (опц. по venueId). */
    public List<MapResponse> list(AuthenticatedUser user, String venueId) {
        List<String> companyIds = access.companyIds(user);
        return companyIds.stream()
                .flatMap(companyId -> (venueId != null && !venueId.isBlank()
                        ? mapRepository.findByCompanyIdAndVenueIdOrderByCreatedAtDesc(companyId, venueId)
                        : mapRepository.findByCompanyIdOrderByCreatedAtDesc(companyId)).stream())
                .map(map -> MapResponse.of(map, zoneRepository.countByMapId(map.getId())))
                .toList();
    }

    /** Одна карта с зонами (MapWithZones). */
    public MapResponse getWithZones(String mapId, AuthenticatedUser user) {
        SiteMap map = access.requireMap(mapId, user);
        return MapResponse.withZones(map, zoneRepository.findByMapIdOrderByCreatedAt(mapId));
    }

    @Transactional
    public MapResponse create(MapCreateRequest req, AuthenticatedUser user) {
        if (req == null || isBlank(req.name())) {
            throw ApiException.badRequest("Укажите название карты");
        }
        String companyId = access.resolveCompanyForCreate(user, req.companyId());

        SiteMap map = new SiteMap();
        map.setCompanyId(companyId);
        map.setName(req.name().trim());
        map.setVenueId(isBlank(req.venueId()) ? null : req.venueId());
        map.setCreatedBy(user != null ? user.id() : null);
        return MapResponse.of(mapRepository.save(map), 0);
    }

    @Transactional
    public MapResponse update(String mapId, MapCreateRequest req, AuthenticatedUser user) {
        SiteMap map = access.requireMap(mapId, user);
        if (req != null && !isBlank(req.name())) {
            map.setName(req.name().trim());
        }
        if (req != null && req.venueId() != null) {
            map.setVenueId(req.venueId().isBlank() ? null : req.venueId());
        }
        map.setUpdatedAt(Instant.now());
        return MapResponse.of(mapRepository.save(map), zoneRepository.countByMapId(mapId));
    }

    /** Удаление карты вместе с её зонами и историей их статусов. */
    @Transactional
    public void delete(String mapId, AuthenticatedUser user) {
        SiteMap map = access.requireMap(mapId, user);
        for (Zone zone : zoneRepository.findByMapIdOrderByCreatedAt(mapId)) {
            historyRepository.deleteByZoneId(zone.getId());
        }
        zoneRepository.deleteByMapId(mapId);
        mapRepository.delete(map);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
