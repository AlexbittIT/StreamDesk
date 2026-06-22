package com.streamdesk.task.dto;

import java.util.List;

/**
 * Тело создания/обновления задачи (/api/tasks).
 * Даты (dueDate/startDate/completedAt) — строкой; userId — актёр для записи истории при обновлении.
 */
public record TaskRequest(
        String title,
        String description,
        String status,
        String priority,
        String creatorId,
        String assigneeId,
        String companyId,
        String dueDate,
        String startDate,
        String completedAt,
        String category,
        String projectId,
        String projectColumnId,
        List<Object> tags,
        List<Object> subtasks,
        List<Object> attachments,
        String parentTaskId,
        Integer estimatedHours,
        Integer actualHours,
        String repository,
        List<Object> links,
        String yougileTaskId,
        String yougileBoardId,
        String userId
) {
}
