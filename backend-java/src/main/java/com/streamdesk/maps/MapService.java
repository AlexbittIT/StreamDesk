package com.streamdesk.maps;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.config.ApiException;
import com.streamdesk.maps.dto.MapCreateRequest;
import com.streamdesk.maps.dto.MapResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * CRUD карт (планов площадок). Изоляция компаний — через {@link MapsAccess}.
 * Загрузка подложки, комментарии и фото — отдельные задачи (VM-04/VM-16) и здесь не реализуются.
 */
@Service
public class MapService {

    private static final long MAX_PLAN_BYTES = 20L * 1024L * 1024L;

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

    @Transactional
    public MapResponse uploadPlan(String mapId, MultipartFile file, AuthenticatedUser user) {
        SiteMap map = access.requireEditableMap(mapId, user);
        validatePlanFile(file);

        try {
            BufferedImage image = ImageIO.read(file.getInputStream());
            if (image == null) {
                throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Файл плана должен быть PNG или JPG");
            }

            String extension = extensionFor(file.getContentType(), file.getOriginalFilename());
            Path uploadDir = Paths.get(System.getProperty("user.dir"), "uploads", "maps");
            Files.createDirectories(uploadDir);
            String filename = "map-" + map.getId() + "-" + UUID.randomUUID() + extension;
            file.transferTo(uploadDir.resolve(filename).toFile());

            map.setImageUrl("/uploads/maps/" + filename);
            map.setImageWidth(image.getWidth());
            map.setImageHeight(image.getHeight());
            map.setUpdatedAt(Instant.now());
            return MapResponse.of(mapRepository.save(map), zoneRepository.countByMapId(mapId));
        } catch (ApiException e) {
            throw e;
        } catch (IOException e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Не удалось загрузить план площадки");
        }
    }

    private static void validatePlanFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("Приложите файл плана");
        }
        if (file.getSize() > MAX_PLAN_BYTES) {
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "Файл плана должен быть не больше 20 МБ");
        }
        String contentType = file.getContentType() != null ? file.getContentType().toLowerCase() : "";
        if (!("image/png".equals(contentType) || "image/jpeg".equals(contentType) || "image/jpg".equals(contentType))) {
            throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Файл плана должен быть PNG или JPG");
        }
    }

    private static String extensionFor(String contentType, String originalFilename) {
        String normalized = contentType != null ? contentType.toLowerCase() : "";
        if ("image/png".equals(normalized)) {
            return ".png";
        }
        if ("image/jpeg".equals(normalized) || "image/jpg".equals(normalized)) {
            return ".jpg";
        }
        if (originalFilename != null && originalFilename.contains(".")) {
            String ext = originalFilename.substring(originalFilename.lastIndexOf('.')).toLowerCase();
            if (".png".equals(ext) || ".jpg".equals(ext) || ".jpeg".equals(ext)) {
                return ext;
            }
        }
        return ".jpg";
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
