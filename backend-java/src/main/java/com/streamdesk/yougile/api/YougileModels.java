package com.streamdesk.yougile.api;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

/**
 * Модели ответов YouGile API v2 — порт интерфейсов из backend/yougile.ts.
 * YouGile отдаёт много лишних полей — все records игнорируют неизвестные (@JsonIgnoreProperties).
 */
public final class YougileModels {

    private YougileModels() {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record YgProject(String id, String title) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record YgBoard(String id, String title, String projectId) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record YgColumn(String id, String title, String boardId, Integer order, Integer color) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record YgUser(String id, String username, String email, String realName) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record YgTask(
            String id,
            String title,
            String description,
            String columnId,
            String boardId,
            String projectId,
            List<String> assigned,
            String status
    ) {
    }

    /** Стикер/фильтр доски (StringStickerState) — собирается нормализатором, не десериализуется напрямую. */
    public record YgStickerState(
            String id,
            String title,
            String boardId,
            Integer order,
            String type,
            List<YgStickerOption> options
    ) {
    }

    public record YgStickerOption(String id, String title) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record YgPerson(String id, String name, String username, String email) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record YgChatMessage(
            String id,
            String text,
            String content,
            String message,
            Object createdAt,
            String userId,
            String authorId,
            String creatorId,
            String senderId,
            YgPerson author,
            YgPerson user
    ) {
    }

    /** Тело создания задачи в YouGile. */
    public record CreateTaskDto(
            String title,
            String description,
            String columnId,
            String assigneeId,
            List<String> assigned,
            Long deadline
    ) {
    }
}
