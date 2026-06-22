package com.streamdesk.transcription.dto;

/**
 * DTO эндпоинтов транскрипций.
 */
public final class TranscriptionDtos {

    private TranscriptionDtos() {
    }

    public record PodcastRequest(String name) {
    }

    public record FolderRequest(String parentPath, String name) {
    }
}
