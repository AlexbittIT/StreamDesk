package com.streamdesk.equipmentports.dto;

import java.util.Map;

/**
 * Устройство, опознанное ИИ по свободному запросу (когда его нет на складе).
 * Идёт человеку на одобрение перед созданием записи оборудования.
 */
public record DiscoveredDevice(String name,
                               String manufacturer,
                               String model,
                               String deviceType,
                               Map<String, Object> specifications) {
}
