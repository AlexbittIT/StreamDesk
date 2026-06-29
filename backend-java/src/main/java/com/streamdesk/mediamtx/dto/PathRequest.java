package com.streamdesk.mediamtx.dto;

/**
 * Тело создания/настройки пути MediaMTX (POST /api/mediamtx/paths).
 * name — имя пути (например, otis-air). source/sourceOnDemand — опционально:
 * если задан source (srt://, rtsp://, rtmp://...), MediaMTX забирает поток сам,
 * иначе путь принимает публикацию (publisher) от vMix/энкодера.
 */
public record PathRequest(
        String name,
        String source,
        Boolean sourceOnDemand
) {
}
