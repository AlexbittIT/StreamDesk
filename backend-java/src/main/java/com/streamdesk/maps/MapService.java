package com.streamdesk.maps;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.config.ApiException;
import com.streamdesk.maps.dto.MapCreateRequest;
import com.streamdesk.maps.dto.MapResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.Instant;
import java.util.List;

/**
 * CRUD карт (планов площадок). Изоляция компаний — через {@link MapsAccess}.
 * Загрузка подложки — через {@link MapPlanStorage} (VM-04); комментарии и фото — отдельные задачи (VM-16).
 */
@Service
public class MapService {

    private final MapRepository mapRepository;
    private final ZoneRepository zoneRepository;
    private final ZoneStatusHistoryRepository historyRepository;
    private final MapsAccess access;
    private final MapPlanStorage planStorage;

    public MapService(MapRepository mapRepository,
                      ZoneRepository zoneRepository,
                      ZoneStatusHistoryRepository historyRepository,
                      MapsAccess access,
                      MapPlanStorage planStorage) {
        this.mapRepository = mapRepository;
        this.zoneRepository = zoneRepository;
        this.historyRepository = historyRepository;
        this.access = access;
        this.planStorage = planStorage;
    }

    /** Список карт компании пользователя (опц. по venueId). */
    public List<MapResponse> list(AuthenticatedUser user, String venueId) {
        List<String> companyIds = access.companyIds(user);
        return companyIds.stream()
                .flatMap(companyId -> (venueId != null && !venueId.isBlank()
                        ? mapRepository.findByCompanyIdAndVenueIdOrderByCreatedAtDesc(companyId, venueId)
                        : mapRepository.findByCompanyIdOrderByCreatedAtDesc(companyId)).stream())
                .filter(map -> access.canViewMap(map, user))
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
        SiteMap map = access.requireEditableMap(mapId, user);
        if (req != null && !isBlank(req.name())) {
            map.setName(req.name().trim());
        }
        if (req != null && req.venueId() != null) {
            map.setVenueId(req.venueId().isBlank() ? null : req.venueId());
        }
        map.setUpdatedAt(Instant.now());
        return MapResponse.of(mapRepository.save(map), zoneRepository.countByMapId(mapId));
    }

    /**
     * Загрузка подложки (плана площадки): валидирует и надёжно сохраняет файл, затем пишет
     * {@code imageUrl/imageWidth/imageHeight} в карту (docs/maps-api.md §4, VM-04). Изоляция —
     * через {@link MapsAccess#requireMap} (чужая/несуществующая карта → 404).
     */
    @Transactional
    public MapResponse savePlan(String mapId, MultipartFile file, AuthenticatedUser user) {
        SiteMap map = access.requireMap(mapId, user);
        MapPlanStorage.StoredPlan plan = planStorage.store(mapId, file);
        map.setImageUrl(plan.url());
        map.setImageWidth(plan.width());
        map.setImageHeight(plan.height());
        map.setUpdatedAt(Instant.now());
        return MapResponse.of(mapRepository.save(map), zoneRepository.countByMapId(mapId));
    }

    /** Удаление карты вместе с её зонами и историей их статусов. */
    @Transactional
    public void delete(String mapId, AuthenticatedUser user) {
        SiteMap map = access.requireEditableMap(mapId, user);
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
