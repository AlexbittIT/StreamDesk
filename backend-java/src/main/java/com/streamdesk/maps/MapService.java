package com.streamdesk.maps;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.config.ApiException;
import com.streamdesk.maps.dto.MapAssignee;
import com.streamdesk.maps.dto.MapCreateRequest;
import com.streamdesk.maps.dto.MapResponse;
import com.streamdesk.maps.dto.PlanRectRequest;
import com.streamdesk.user.User;
import com.streamdesk.user.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

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
    private final UserRepository userRepository;

    public MapService(MapRepository mapRepository,
                      ZoneRepository zoneRepository,
                      ZoneStatusHistoryRepository historyRepository,
                      MapsAccess access,
                      MapPlanStorage planStorage,
                      UserRepository userRepository) {
        this.mapRepository = mapRepository;
        this.zoneRepository = zoneRepository;
        this.historyRepository = historyRepository;
        this.access = access;
        this.planStorage = planStorage;
        this.userRepository = userRepository;
    }

    /**
     * Список карт компании пользователя (опц. по venueId) со сводкой по зонам: разбивка по
     * статусам, число зон без ответственного, сами ответственные и названия зон (для поиска
     * по зоне в списке). Зоны всех карт читаются одним запросом-проекцией, пользователи —
     * одним {@code findAllById}, поэтому число запросов не зависит от числа карт.
     */
    public List<MapResponse> list(AuthenticatedUser user, String venueId) {
        List<String> companyIds = access.companyIds(user);
        List<SiteMap> maps = companyIds.stream()
                .flatMap(companyId -> (venueId != null && !venueId.isBlank()
                        ? mapRepository.findByCompanyIdAndVenueIdOrderByCreatedAtDesc(companyId, venueId)
                        : mapRepository.findByCompanyIdOrderByCreatedAtDesc(companyId)).stream())
                .filter(map -> access.canViewMap(map, user))
                .toList();
        if (maps.isEmpty()) {
            return List.of();
        }

        List<ZoneRepository.ZoneSummaryRow> rows = zoneRepository.findSummariesByMapIds(
                maps.stream().map(SiteMap::getId).toList());
        Map<String, List<ZoneRepository.ZoneSummaryRow>> rowsByMap = rows.stream()
                .collect(Collectors.groupingBy(ZoneRepository.ZoneSummaryRow::getMapId));
        Map<String, MapAssignee> assigneeById = loadAssignees(rows);

        return maps.stream()
                .map(map -> summarize(map, rowsByMap.getOrDefault(map.getId(), List.of()), assigneeById))
                .toList();
    }

    /** Имена ответственных одним запросом: id → карточка ответственного. */
    private Map<String, MapAssignee> loadAssignees(List<ZoneRepository.ZoneSummaryRow> rows) {
        Set<String> ids = rows.stream()
                .map(ZoneRepository.ZoneSummaryRow::getAssigneeId)
                .filter(id -> id != null && !id.isBlank())
                .collect(Collectors.toSet());
        if (ids.isEmpty()) {
            return Map.of();
        }
        return userRepository.findAllById(ids).stream()
                .collect(Collectors.toMap(User::getId, MapService::toAssignee, (a, b) -> a));
    }

    private static MapAssignee toAssignee(User user) {
        String name = user.getName() != null && !user.getName().isBlank() ? user.getName() : user.getUsername();
        return new MapAssignee(user.getId(), name, user.getAvatar());
    }

    /** Свести зоны одной карты в счётчики для карточки в списке. */
    private static MapResponse summarize(SiteMap map,
                                         List<ZoneRepository.ZoneSummaryRow> zoneRows,
                                         Map<String, MapAssignee> assigneeById) {
        // Все шесть статусов присутствуют всегда (в т.ч. с нулём), чтобы клиенту не нужен fallback.
        Map<String, Long> statusCounts = new LinkedHashMap<>();
        for (ZoneStatus status : ZoneStatus.values()) {
            statusCounts.put(status.apiValue(), 0L);
        }
        long unassigned = 0;
        List<String> zoneNames = new ArrayList<>(zoneRows.size());
        // LinkedHashMap: ответственные без дублей, в порядке появления зон.
        Map<String, MapAssignee> assignees = new LinkedHashMap<>();

        for (ZoneRepository.ZoneSummaryRow row : zoneRows) {
            statusCounts.merge(row.getStatus(), 1L, Long::sum);
            zoneNames.add(row.getName());
            String assigneeId = row.getAssigneeId();
            if (assigneeId == null || assigneeId.isBlank()) {
                unassigned++;
            } else {
                // Ответственный-не-пользователь (команда и т.п.) зону не «обезличивает»,
                // но и в стопку аватаров не попадает — показывать нечего.
                MapAssignee assignee = assigneeById.get(assigneeId);
                if (assignee != null) {
                    assignees.putIfAbsent(assignee.id(), assignee);
                }
            }
        }

        return MapResponse.withSummary(map, zoneRows.size(), statusCounts, unassigned,
                List.copyOf(assignees.values()), List.copyOf(zoneNames));
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
        // Новый план рисуется во весь кадр: сбрасываем прежний прямоугольник ресайза.
        map.setPlanX(null);
        map.setPlanY(null);
        map.setPlanWidth(null);
        map.setPlanHeight(null);
        map.setUpdatedAt(Instant.now());
        return MapResponse.of(mapRepository.save(map), zoneRepository.countByMapId(mapId));
    }

    /** Удалить подложку: очищает ссылку на файл, натуральные размеры и прямоугольник ресайза. */
    @Transactional
    public MapResponse removePlan(String mapId, AuthenticatedUser user) {
        SiteMap map = access.requireEditableMap(mapId, user);
        map.setImageUrl(null);
        map.setImageWidth(null);
        map.setImageHeight(null);
        map.setPlanX(null);
        map.setPlanY(null);
        map.setPlanWidth(null);
        map.setPlanHeight(null);
        map.setUpdatedAt(Instant.now());
        return MapResponse.of(mapRepository.save(map), zoneRepository.countByMapId(mapId));
    }

    /**
     * Сохранить прямоугольник отрисовки плана (ресайз за углы). Ширина/высота — не меньше 1;
     * значения округляются к целым пикселям сцены.
     */
    @Transactional
    public MapResponse savePlanRect(String mapId, PlanRectRequest req, AuthenticatedUser user) {
        SiteMap map = access.requireEditableMap(mapId, user);
        if (map.getImageUrl() == null) {
            throw ApiException.badRequest("У карты нет плана");
        }
        if (req == null || req.width() == null || req.height() == null || req.x() == null || req.y() == null) {
            throw ApiException.badRequest("Укажите x, y, width и height плана");
        }
        map.setPlanX(req.x());
        map.setPlanY(req.y());
        map.setPlanWidth(Math.max(1, req.width()));
        map.setPlanHeight(Math.max(1, req.height()));
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
