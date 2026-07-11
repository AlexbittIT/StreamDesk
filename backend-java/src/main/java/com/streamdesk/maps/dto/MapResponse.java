package com.streamdesk.maps.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.streamdesk.maps.SiteMap;
import com.streamdesk.maps.Zone;

import java.time.Instant;
import java.util.List;

/**
 * Ответ карты (docs/openapi-maps.yaml Map / MapWithZones). {@code zonesCount} денормализован
 * для списка; {@code zones} присутствует только в ответе одной карты (иначе опущено).
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
        String createdBy,
        Instant createdAt,
        Instant updatedAt,
        List<Zone> zones
) {

    /** Для списка карт: без вложенных зон, только счётчик. */
    public static MapResponse of(SiteMap map, long zonesCount) {
        return build(map, zonesCount, null);
    }

    /** Для одной карты: с полным списком зон (MapWithZones). */
    public static MapResponse withZones(SiteMap map, List<Zone> zones) {
        return build(map, zones.size(), zones);
    }

    private static MapResponse build(SiteMap map, long zonesCount, List<Zone> zones) {
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
                map.getCreatedBy(),
                map.getCreatedAt(),
                map.getUpdatedAt(),
                zones
        );
    }
}
