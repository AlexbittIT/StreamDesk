package com.streamdesk.task;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Репозиторий истории задач — замена getTaskHistory/createTaskHistory.
 */
public interface TaskHistoryRepository extends JpaRepository<TaskHistory, String> {

    // аналог getTaskHistory(taskId) — по времени создания (DESC)
    List<TaskHistory> findByTaskIdOrderByCreatedAtDesc(String taskId);

    void deleteByTaskId(String taskId);
}
