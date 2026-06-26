package com.streamdesk.equipmentports.dto;

import java.util.Map;

/**
 * Ручная правка портов человеком: {@code ports = {portsIn:[...], portsOut:[...]}}.
 * {@code status} опционален (например, сразу confirmed после ручной правки).
 */
public record PortsUpdateRequest(Map<String, Object> ports, String status) {
}
