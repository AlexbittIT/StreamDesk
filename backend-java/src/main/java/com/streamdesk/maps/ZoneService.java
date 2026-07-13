package com.streamdesk.maps;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.config.ApiException;
import com.streamdesk.maps.dto.ZoneAssigneeRequest;
import com.streamdesk.maps.dto.ZoneCommentRequest;
import com.streamdesk.maps.dto.ZoneCreateRequest;
import com.streamdesk.maps.dto.ZonePhotoRequest;
import com.streamdesk.maps.dto.ZoneStatusRequest;
import com.streamdesk.maps.dto.ZoneUpdateRequest;
import com.streamdesk.maps.event.ZoneAssigneeChangedEvent;
import com.streamdesk.maps.event.ZoneCreatedEvent;
import com.streamdesk.maps.event.ZoneDeletedEvent;
import com.streamdesk.maps.event.ZoneStatusChangedEvent;
import com.streamdesk.maps.event.ZoneUpdatedEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Логика зон: геометрия, конечный автомат статусов с историей и назначение ответственного.
 * Реализует ключевые правила контракта (docs/maps-api.md §3, §7):
 *
 * <ul>
 *   <li>зона всегда в одном из 6 статусов, по умолчанию «Не начато»;</li>
 *   <li>смена статуса валидируется по таблице переходов и пишет запись истории (кто/когда/из→в);</li>
 *   <li>недопустимый переход и рассинхрон version отклоняются с {@code 409} и понятной причиной;</li>
 *   <li>ответственного можно назначить только из активных сотрудников той же компании;</li>
 *   <li>смена статуса и назначение публикуют доменное событие (realtime + алерты).</li>
 * </ul>
 */
@Service
public class ZoneService {

    private final ZoneRepository zoneRepository;
    private final ZoneStatusHistoryRepository historyRepository;
    private final MapRepository mapRepository;
    private final MapsAccess access;
    private final ApplicationEventPublisher events;

    public ZoneService(ZoneRepository zoneRepository,
                       ZoneStatusHistoryRepository historyRepository,
                       MapRepository mapRepository,
                       MapsAccess access,
                       ApplicationEventPublisher events) {
        this.zoneRepository = zoneRepository;
        this.historyRepository = historyRepository;
        this.mapRepository = mapRepository;
        this.access = access;
        this.events = events;
    }

    public List<Zone> list(String mapId, AuthenticatedUser user) {
        access.requireMap(mapId, user);
        return zoneRepository.findByMapIdOrderByCreatedAt(mapId);
    }

    public Zone get(String mapId, String zoneId, AuthenticatedUser user) {
        return access.requireZone(mapId, zoneId, user);
    }

    @Transactional
    public Zone create(String mapId, ZoneCreateRequest req, AuthenticatedUser user) {
        SiteMap map = access.requireEditableMap(mapId, user);
        if (req == null || isBlank(req.name())) {
            throw ApiException.badRequest("Укажите название зоны");
        }
        validatePoints(req.points());

        Zone zone = new Zone();
        zone.setMapId(map.getId());
        zone.setCompanyId(map.getCompanyId());
        zone.setName(req.name().trim());
        zone.setPoints(req.points());
        // Начальный статус можно задать сразу; иначе — «Не начато». Значение валидируется fromApi.
        ZoneStatus initial = isBlank(req.status()) ? ZoneStatus.defaultStatus() : ZoneStatus.fromApi(req.status());
        zone.setStatus(initial.apiValue());
        zone.setVersion(1);
        zone.setCreatedBy(user != null ? user.id() : null);

        Zone saved = zoneRepository.save(zone);
        events.publishEvent(new ZoneCreatedEvent(saved));
        return saved;
    }

    @Transactional
    public Zone update(String mapId, String zoneId, ZoneUpdateRequest req, AuthenticatedUser user) {
        Zone zone = access.requireZone(mapId, zoneId, user);
        access.requireCanManageMaps(user, zone.getCompanyId());
        requireVersionMatch(zone, req != null ? req.version() : null);

        if (req != null && req.name() != null && !req.name().isBlank()) {
            zone.setName(req.name().trim());
        }
        if (req != null && req.points() != null) {
            validatePoints(req.points());
            zone.setPoints(req.points());
        }
        zone.setVersion(zone.getVersion() + 1);
        zone.setUpdatedAt(Instant.now());

        Zone saved = zoneRepository.save(zone);
        events.publishEvent(new ZoneUpdatedEvent(saved));
        return saved;
    }

    @Transactional
    public void delete(String mapId, String zoneId, AuthenticatedUser user) {
        Zone zone = access.requireZone(mapId, zoneId, user);
        access.requireCanManageMaps(user, zone.getCompanyId());
        historyRepository.deleteByZoneId(zone.getId());
        zoneRepository.delete(zone);
        events.publishEvent(new ZoneDeletedEvent(zone.getMapId(), zone.getCompanyId(), zone.getId()));
    }

    /**
     * Смена статуса зоны: проверка version → проверка допустимости перехода → запись истории →
     * публикация события. Любой недопустимый шаг завершается {@code 409} с понятной причиной.
     */
    @Transactional
    public Zone changeStatus(String mapId, String zoneId, ZoneStatusRequest req, AuthenticatedUser user) {
        Zone zone = access.requireZone(mapId, zoneId, user);
        if (req == null || isBlank(req.status())) {
            throw ApiException.badRequest("Не указан статус зоны");
        }
        requireVersionMatch(zone, req.version());

        ZoneStatus from = zone.statusEnum();
        ZoneStatus to = ZoneStatus.fromApi(req.status());
        if (!from.canTransitionTo(to)) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "Недопустимый переход статуса: «" + from.label() + "» → «" + to.label() + "»");
        }

        zone.setStatus(to.apiValue());
        zone.setVersion(zone.getVersion() + 1);
        zone.setUpdatedAt(Instant.now());
        Zone saved = zoneRepository.save(zone);

        ZoneStatusHistory entry = new ZoneStatusHistory();
        entry.setZoneId(saved.getId());
        entry.setFromStatus(from.apiValue());
        entry.setToStatus(to.apiValue());
        entry.setChangedBy(user != null ? user.id() : null);
        historyRepository.save(entry);

        String mapName = mapRepository.findById(saved.getMapId()).map(SiteMap::getName).orElse("");
        events.publishEvent(new ZoneStatusChangedEvent(
                saved, mapName, from.apiValue(), to.apiValue(), user != null ? user.id() : null));
        return saved;
    }

    public List<ZoneStatusHistory> history(String mapId, String zoneId, AuthenticatedUser user) {
        access.requireZone(mapId, zoneId, user);
        return historyRepository.findByZoneIdOrderByChangedAtAsc(zoneId);
    }

    /**
     * Назначить/снять ответственного. {@code assigneeId == null} снимает; иначе ответственный
     * обязан быть активным сотрудником компании этой зоны (иначе {@code 400}).
     * Пока поддерживается только тип {@code user} — команд в модели ещё нет.
     */
    @Transactional
    public Zone assign(String mapId, String zoneId, ZoneAssigneeRequest req, AuthenticatedUser user) {
        Zone zone = access.requireZone(mapId, zoneId, user);
        access.requireCanManageMaps(user, zone.getCompanyId());
        String assigneeId = req != null ? req.assigneeId() : null;

        if (assigneeId == null || assigneeId.isBlank()) {
            zone.setAssigneeId(null);
            zone.setAssigneeType(null);
        } else {
            String type = (req.assigneeType() == null || req.assigneeType().isBlank())
                    ? "user" : req.assigneeType().trim();
            if (!"user".equals(type)) {
                throw ApiException.badRequest("Назначение на команду пока не поддерживается");
            }
            if (!access.isActiveCompanyMember(zone.getCompanyId(), assigneeId)) {
                throw ApiException.badRequest("Ответственный должен быть сотрудником вашей компании");
            }
            zone.setAssigneeId(assigneeId);
            zone.setAssigneeType(type);
        }
        zone.setVersion(zone.getVersion() + 1);
        zone.setUpdatedAt(Instant.now());
        Zone saved = zoneRepository.save(zone);

        events.publishEvent(new ZoneAssigneeChangedEvent(
                saved, saved.getAssigneeId(), saved.getAssigneeType(), user != null ? user.id() : null));
        return saved;
    }

    /**
     * Добавить комментарий к зоне. Доступно любому, кто видит зону (в т.ч. ответственному-работнику).
     * Автор и время фиксируются на сервере.
     */
    @Transactional
    public Zone addComment(String mapId, String zoneId, ZoneCommentRequest req, AuthenticatedUser user) {
        Zone zone = access.requireZone(mapId, zoneId, user);
        String text = req != null ? req.text() : null;
        if (isBlank(text)) {
            throw ApiException.badRequest("Комментарий не может быть пустым");
        }
        String authorName = user != null ? (user.name() != null ? user.name() : user.username()) : null;
        ZoneComment comment = new ZoneComment(user != null ? user.id() : null, authorName, text.trim());
        List<ZoneComment> comments = zone.getComments() != null ? zone.getComments() : new ArrayList<>();
        comments.add(comment);
        zone.setComments(comments);
        zone.setCommentsCount(comments.size());
        zone.setUpdatedAt(Instant.now());
        return zoneRepository.save(zone);
    }

    /** Удалить комментарий: может автор или менеджер площадок. */
    @Transactional
    public Zone deleteComment(String mapId, String zoneId, String commentId, AuthenticatedUser user) {
        Zone zone = access.requireZone(mapId, zoneId, user);
        List<ZoneComment> comments = zone.getComments() != null ? zone.getComments() : new ArrayList<>();
        ZoneComment target = comments.stream()
                .filter(c -> c.getId() != null && c.getId().equals(commentId))
                .findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Комментарий не найден"));
        boolean isAuthor = user != null && user.id() != null && user.id().equals(target.getAuthorId());
        if (!isAuthor && !access.canManageMaps(user, zone.getCompanyId())) {
            throw ApiException.forbidden("Можно удалить только свой комментарий");
        }
        comments.remove(target);
        zone.setComments(comments);
        zone.setCommentsCount(comments.size());
        zone.setUpdatedAt(Instant.now());
        return zoneRepository.save(zone);
    }

    /** Прикрепить фото (URL уже загруженного файла) к зоне. Доступно любому, кто видит зону. */
    @Transactional
    public Zone addPhoto(String mapId, String zoneId, ZonePhotoRequest req, AuthenticatedUser user) {
        Zone zone = access.requireZone(mapId, zoneId, user);
        String url = req != null ? req.url() : null;
        if (isBlank(url)) {
            throw ApiException.badRequest("Не указан URL фото");
        }
        List<String> photos = zone.getPhotos() != null ? zone.getPhotos() : new ArrayList<>();
        if (!photos.contains(url.trim())) {
            photos.add(url.trim());
        }
        zone.setPhotos(photos);
        zone.setPhotosCount(photos.size());
        zone.setUpdatedAt(Instant.now());
        return zoneRepository.save(zone);
    }

    /** Открепить фото по URL: только менеджер площадок. */
    @Transactional
    public Zone deletePhoto(String mapId, String zoneId, String url, AuthenticatedUser user) {
        Zone zone = access.requireZone(mapId, zoneId, user);
        access.requireCanManageMaps(user, zone.getCompanyId());
        if (isBlank(url)) {
            throw ApiException.badRequest("Не указан URL фото");
        }
        List<String> photos = zone.getPhotos() != null ? zone.getPhotos() : new ArrayList<>();
        photos.remove(url.trim());
        zone.setPhotos(photos);
        zone.setPhotosCount(photos.size());
        zone.setUpdatedAt(Instant.now());
        return zoneRepository.save(zone);
    }

    // --- helpers ---

    private void validatePoints(List<ZonePoint> points) {
        if (points == null || points.size() < 3) {
            throw ApiException.badRequest("Полигон зоны должен содержать не менее 3 точек");
        }
    }

    /** Оптимистичная блокировка: version обязателен и должен совпасть с текущим, иначе 409. */
    private void requireVersionMatch(Zone zone, Integer version) {
        if (version == null) {
            throw ApiException.badRequest("Укажите version зоны");
        }
        if (version != zone.getVersion()) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "Зона была изменена другим пользователем (актуальная version: " + zone.getVersion() + ")");
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
