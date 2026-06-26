package com.streamdesk.equipmentports.dto;

import com.streamdesk.equipmentports.EquipmentModelPorts;

import java.util.List;

/**
 * Результат поиска портов.
 *
 * @param source        "cache" — мгновенно из подтверждённого кэша; "ai" — свежий ответ ИИ (status=pending_review)
 * @param result        строка кэша с портами и provenance
 * @param unmappedTerms разъёмы, не найденные в справочнике в этом запросе (попали в очередь)
 */
public record PortLookupResponse(String source, EquipmentModelPorts result, List<String> unmappedTerms) {

    public static final String SOURCE_CACHE = "cache";
    public static final String SOURCE_AI = "ai";
}
