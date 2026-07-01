package com.streamdesk.equipmentports.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * Ответ опознания: предложенное устройство + предложенные порты. Всё на одобрение
 * человеком; реальной записи в БД ещё нет (создаётся при approve).
 *
 * @param configurablePorts модульное оборудование — порты слотов НЕ угаданы, нужны вручную
 */
public record DeviceDiscoveryResponse(DiscoveredDevice device,
                                      Map<String, Object> ports,
                                      boolean configurablePorts,
                                      BigDecimal confidence,
                                      List<String> unmappedTerms) {
}
