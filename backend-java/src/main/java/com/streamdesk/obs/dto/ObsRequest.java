package com.streamdesk.obs.dto;

/**
 * Тело создания/обновления подключения OBS.
 */
public record ObsRequest(
        String name,
        String host,
        Integer port,
        String password,
        String status,
        String streamStatus
) {
}
