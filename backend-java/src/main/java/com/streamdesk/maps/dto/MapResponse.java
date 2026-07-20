package com.streamdesk.maps.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.streamdesk.maps.SiteMap;
import com.streamdesk.maps.Zone;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Ответ карты (docs/openapi-maps.yaml Map / MapWithZones). {@code zonesCount} денормализован
 * для списка; {@code zones} присутствует только в ответе одной карты (иначе опущено).
 *
 * Сводка ({@code statusCounts}, {@code unassignedCount}, {@code assignees}, {@code zoneNames})
 * заполняется только в списке карт: карточка площадки показывает готовность зон, проблемы и
 * ответственных до перехода в редактор. В ответе одной карты эти поля опущены — там есть
 * полный {@code zones}, из которого то же самое считается на клиенте.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record MapResponse(
        String id,
        String companyId,
        String venueId,
        String name,
        String imageUrl,
        Integer imageWidth,
        Integer imageHeight,
        Integer planX,
        Integer planY,
        Integer planWidth,
        Integer planHeight,
        long zonesCount,
        Map<String, Long> statusCounts,
        Long unassignedCount,
        List<MapAssignee> assignees,
        List<String> zoneNames,
        String createdBy,
        Instant createdAt,
        Instant updatedAt,
        List<Zone> zones
) {

    /** Для одиночных ответов (create/update/plan): без зон и без сводки, только счётчик. */
    public static MapResponse of(SiteMap map, long zonesCount) {
        return build(map, zonesCount, null, null, null, null, null);
    }

    /** Для списка карт: со сводкой по зонам, но без самих зон. */
    public static MapResponse withSummary(SiteMap map,
                                          long zonesCount,
                                          Map<String, Long> statusCounts,
                                          long unassignedCount,
                                          List<MapAssignee> assignees,
                                          List<String> zoneNames) {
        return build(map, zonesCount, statusCounts, unassignedCount, assignees, zoneNames, null);
    }

    /** Для одной карты: с полным списком зон (MapWithZones). */
    public static MapResponse withZones(SiteMap map, List<Zone> zones) {
        return build(map, zones.size(), null, null, null, null, zones);
    }

    private static MapResponse build(SiteMap map,
                                     long zonesCount,
                                     Map<String, Long> statusCounts,
                                     Long unassignedCount,
                                     List<MapAssignee> assignees,
                                     List<String> zoneNames,
                                     List<Zone> zones) {
        return new MapResponse(
                map.getId(),
                map.getCompanyId(),
                map.getVenueId(),
                map.getName(),
                map.getImageUrl(),
                map.getImageWidth(),
                map.getImageHeight(),
                map.getPlanX(),
                map.getPlanY(),
                map.getPlanWidth(),
                map.getPlanHeight(),
                zonesCount,
                statusCounts,
                unassignedCount,
                assignees,
                zoneNames,
                map.getCreatedBy(),
                map.getCreatedAt(),
                map.getUpdatedAt(),
                zones
        );
    }
}
