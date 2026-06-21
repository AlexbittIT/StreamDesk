package com.streamdesk.connectionschema.dto;

/**
 * Тело создания связи (кабеля) между выходным портом одного устройства и входным
 * портом другого. Соответствует схеме ConnectionCreate из docs/openapi.yaml.
 */
public record ConnectionRequest(
        String fromDeviceId,
        String fromPortId,
        String toDeviceId,
        String toPortId,
        String cableType,
        String protocol
) {
}
