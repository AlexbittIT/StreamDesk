package com.streamdesk.task.dto;

import java.util.List;

/**
 * Тело создания комментария (/api/tasks/{taskId}/comments).
 */
public record CommentRequest(
        String userId,
        String content,
        List<Object> attachments
) {
}
