package com.streamdesk.transcription.dto;

/**
 * Опции транскрипции — порт options из WhisperXClient.transcribe (whisper-x-client.ts).
 * Любое поле может быть null (тогда параметр не отправляется в API).
 */
public record TranscribeOptions(
        String language,
        String task,
        Boolean returnTimestamps,
        Integer numSpeakers,
        Boolean diarize
) {
    public static TranscribeOptions of(String language, Boolean returnTimestamps) {
        return new TranscribeOptions(language, null, returnTimestamps, null, null);
    }
}
