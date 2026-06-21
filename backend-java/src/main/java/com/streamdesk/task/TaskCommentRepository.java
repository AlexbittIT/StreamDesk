package com.streamdesk.task;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Репозиторий комментариев к задачам — замена getTaskComments/deleteTaskComment.
 */
public interface TaskCommentRepository extends JpaRepository<TaskComment, String> {

    // аналог getTaskComments(taskId) — по времени создания (ASC)
    List<TaskComment> findByTaskIdOrderByCreatedAt(String taskId);

    void deleteByTaskId(String taskId);
}
