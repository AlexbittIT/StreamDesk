package com.streamdesk.task;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * Репозиторий задач — замена getTasks/getTasksByAssignee/Creator/Status/YougileBoardId.
 * Везде сортировка по createdAt DESC, как в Express.
 */
public interface TaskRepository extends JpaRepository<Task, String> {

    List<Task> findByOrderByCreatedAtDesc();

    // аналог getTaskByYougileTaskId — для синхронизации YouGile
    Optional<Task> findByYougileTaskId(String yougileTaskId);

    List<Task> findByAssigneeIdOrderByCreatedAtDesc(String assigneeId);

    List<Task> findByCreatorIdOrderByCreatedAtDesc(String creatorId);

    List<Task> findByStatusOrderByCreatedAtDesc(String status);

    List<Task> findByYougileBoardIdOrderByCreatedAtDesc(String yougileBoardId);

    // для статистики проекта (задачи без привязки к доске YouGile)
    List<Task> findByProjectId(String projectId);

    // отвязка задач при удалении проекта (как deleteProject в Express)
    @Modifying
    @Query("update Task t set t.projectId = null, t.projectColumnId = null where t.projectId = :projectId")
    void clearProjectReferences(@Param("projectId") String projectId);

    // отвязка задач при удалении столбца (как deleteProjectColumn в Express)
    @Modifying
    @Query("update Task t set t.projectColumnId = null where t.projectColumnId = :columnId")
    void clearColumnReferences(@Param("columnId") String columnId);
}
