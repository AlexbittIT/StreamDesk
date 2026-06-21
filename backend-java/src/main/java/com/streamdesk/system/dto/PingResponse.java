package com.streamdesk.system.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Ответ POST /api/systems/ping. responseTime/error отдаём только когда они есть
 * (как undefined-поля в Express).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record PingResponse(
        String ip,
        boolean isOnline,
        Long responseTime,
        String error
) {

    public static PingResponse online(String ip, long responseTime) {
        return new PingResponse(ip, true, responseTime, null);
    }

    public static PingResponse offline(String ip, String error) {
        return new PingResponse(ip, false, null, error);
    }
}
