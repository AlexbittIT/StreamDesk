package com.streamdesk.mediamtx.dto;

/**
 * Тело запроса на отключение соединения/читателя MediaMTX (POST /api/mediamtx/kick).
 * type — тип источника MediaMTX (srtConn, rtmpConn, rtspSession, webRTCSession), id — его идентификатор.
 */
public record KickRequest(
        String type,
        String id
) {
}
