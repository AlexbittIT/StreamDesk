package com.streamdesk.equipmentports.dto;

import java.util.Map;

/**
 * Одобрение опознанного устройства человеком: создаёт запись оборудования и
 * подтверждённый кэш портов. {@code ports} — возможно отредактированные человеком.
 */
public record ApproveDeviceRequest(DiscoveredDevice device,
                                   Map<String, Object> ports,
                                   boolean configurablePorts) {
}
