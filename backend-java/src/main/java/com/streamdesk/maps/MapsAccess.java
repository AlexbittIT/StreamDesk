package com.streamdesk.maps;

import com.streamdesk.access.DataScope;
import com.streamdesk.access.DataScopeService;
import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.company.CompanyMember;
import com.streamdesk.company.CompanyService;
import com.streamdesk.config.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Барьер изоляции компаний для модуля «Схема площадки» (docs/maps-api.md §7).
 *
 * <p>Любое обращение к карте/зоне проходит через этот компонент: если сущность принадлежит
 * другой компании (или не существует) — {@code 404}, чтобы не раскрывать факт её существования.
 * Один инвариант в одном месте — его проще тестировать и невозможно случайно обойти в сервисах.
 */
@Component
public class MapsAccess {

    private static final String MAP_NOT_FOUND = "Карта не найдена";
    private static final String ZONE_NOT_FOUND = "Зона не найдена";

    private final MapRepository mapRepository;
    private final ZoneRepository zoneRepository;
    private final CompanyService companyService;
    private final DataScopeService dataScopeService;

    public MapsAccess(MapRepository mapRepository,
                      ZoneRepository zoneRepository,
                      CompanyService companyService,
                      DataScopeService dataScopeService) {
        this.mapRepository = mapRepository;
        this.zoneRepository = zoneRepository;
        this.companyService = companyService;
        this.dataScopeService = dataScopeService;
    }

    /** Компании пользователя (admin — все). */
    public List<String> companyIds(AuthenticatedUser user) {
        return companyService.getUserCompanyIds(user);
    }

    /**
     * Компания для создаваемой карты: явная из запроса (если пользователь в ней состоит),
     * иначе первая компания пользователя. Нет доступной компании → {@code 403}.
     */
    public String resolveCompanyForCreate(AuthenticatedUser user, String requestedCompanyId) {
        List<String> ids = companyIds(user);
        if (requestedCompanyId != null && !requestedCompanyId.isBlank()) {
            if (!ids.contains(requestedCompanyId)) {
                throw ApiException.forbidden("Нет доступа к указанной компании");
            }
            requireCanManageMaps(user, requestedCompanyId);
            return requestedCompanyId;
        }
        if (ids.isEmpty()) {
            throw ApiException.forbidden("Нет доступа к рабочему пространству");
        }
        String companyId = ids.get(0);
        requireCanManageMaps(user, companyId);
        return companyId;
    }

    /** Видна ли карта пользователю с учётом компании и data_scope роли. */
    public boolean canViewMap(SiteMap map, AuthenticatedUser user) {
        if (map == null || user == null || !companyIds(user).contains(map.getCompanyId())) {
            return false;
        }
        DataScope scope = dataScopeService.resolveScope(user);
        if (scope == DataScope.ALL) {
            return true;
        }
        String ownerId = map.getCreatedBy();
        if (ownerId == null || ownerId.isBlank()) {
            return false;
        }
        Set<String> visibleOwners = scope == DataScope.DEPARTMENT
                ? dataScopeService.departmentPeerUserIds(user)
                : ownUserSet(user);
        return dataScopeService.isVisible(user, visibleOwners, ownerId);
    }

    /** Карта, доступная пользователю, иначе 404 (в т.ч. для чужой компании). */
    public SiteMap requireMap(String mapId, AuthenticatedUser user) {
        SiteMap map = mapRepository.findById(mapId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, MAP_NOT_FOUND));
        if (!canViewMap(map, user)) {
            throw new ApiException(HttpStatus.NOT_FOUND, MAP_NOT_FOUND);
        }
        return map;
    }

    /** Карта, которую пользователь может администрировать/редактировать. */
    public SiteMap requireEditableMap(String mapId, AuthenticatedUser user) {
        SiteMap map = requireMap(mapId, user);
        requireCanManageMaps(user, map.getCompanyId());
        return map;
    }

    /** Зона указанной карты, доступная пользователю, иначе 404. */
    public Zone requireZone(String mapId, String zoneId, AuthenticatedUser user) {
        SiteMap map = requireMap(mapId, user);
        Zone zone = zoneRepository.findById(zoneId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, ZONE_NOT_FOUND));
        // Зона обязана принадлежать этой карте и, как следствие, той же компании.
        if (!map.getId().equals(zone.getMapId()) || !map.getCompanyId().equals(zone.getCompanyId())) {
            throw new ApiException(HttpStatus.NOT_FOUND, ZONE_NOT_FOUND);
        }
        return zone;
    }

    /** Является ли пользователь активным сотрудником компании (для проверки ответственного). */
    public boolean isActiveCompanyMember(String companyId, String userId) {
        if (companyId == null || userId == null) {
            return false;
        }
        return companyService.getCompanyMembers(companyId).stream()
                .anyMatch(m -> userId.equals(m.getUserId()) && "active".equals(m.getStatus()));
    }

    /** Менеджерские операции с картами и геометрией зон. */
    public void requireCanManageMaps(AuthenticatedUser user, String companyId) {
        if (!canManageMaps(user, companyId)) {
            throw ApiException.forbidden("Нет прав на редактирование площадок");
        }
    }

    public boolean canManageMaps(AuthenticatedUser user, String companyId) {
        if (user == null || user.id() == null) {
            return false;
        }
        String role = user.role();
        if ("admin".equals(role) || "manager".equals(role)) {
            return companyIds(user).contains(companyId);
        }
        if ("company_owner".equals(user.workspaceMode())) {
            return companyIds(user).contains(companyId);
        }
        return companyService.canManageCompany(user, companyId);
    }

    private static Set<String> ownUserSet(AuthenticatedUser user) {
        Set<String> ids = new HashSet<>();
        if (user != null && user.id() != null) {
            ids.add(user.id());
        }
        return ids;
    }
}
