package com.streamdesk.show.dto;

/**
 * Тело PUT /api/otis.
 */
public record OtisRequest(
        String name,
        String streamUrl,
        String streamUrlBackup,
        Boolean showTimecode,
        Boolean withSound,
        String timecodeSource,
        String vmixHost,
        Integer vmixPort
) {
}
