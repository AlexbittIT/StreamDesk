package com.streamdesk.yougile;

import com.streamdesk.task.Task;
import com.streamdesk.task.TaskRepository;
import com.streamdesk.yougile.api.YougileClient;
import com.streamdesk.yougile.api.YougileModels.CreateTaskDto;
import com.streamdesk.yougile.sync.YougileSyncService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Интеграция YouGile в CRUD задач — перенос блоков синхронизации из /api/tasks (backend/routes.ts):
 * при создании задача ставится в очередь на создание в YouGile, при изменении/удалении — соответственно.
 * Всё best-effort: ошибки логируются, но не ломают операцию с задачей.
 */
@Component
public class YougileTaskIntegration {

    private static final Logger log = LoggerFactory.getLogger(YougileTaskIntegration.class);

    private final YougileClient client;
    private final YougileColumnRepository columnRepository;
    private final YougileSyncService syncService;
    private final TaskRepository taskRepository;

    public YougileTaskIntegration(YougileClient client, YougileColumnRepository columnRepository,
                                  YougileSyncService syncService, TaskRepository taskRepository) {
        this.client = client;
        this.columnRepository = columnRepository;
        this.syncService = syncService;
        this.taskRepository = taskRepository;
    }

    /** Создание задачи в YouGile (в выбранной пользователем колонке доски, иначе по column-map/дефолту). */
    public void onCreate(Task task) {
        if (!client.isConfigured()) {
            return;
        }
        try {
            String boardId = task.getYougileBoardId();
            String columnId = null;

            if (boardId != null && !boardId.isBlank()) {
                List<YougileColumn> cols = columnRepository.findByBoardIdOrderByOrder(boardId);
                if (cols.isEmpty()) {
                    syncService.refreshColumnsCache(boardId);
                    cols = columnRepository.findByBoardIdOrderByOrder(boardId);
                }
                String status = task.getStatus();
                if (status != null && !status.isEmpty()) {
                    boolean exists = cols.stream().anyMatch(c -> status.equals(c.getId()));
                    columnId = exists ? status : (cols.isEmpty() ? null : cols.get(0).getId());
                }
                if (columnId == null && !cols.isEmpty()) {
                    columnId = cols.get(0).getId();
                }
            }
            if (columnId == null) {
                String status = task.getStatus();
                Map<String, String> map = client.getColumnMap();
                columnId = status != null ? map.get(status) : null;
            }
            if (columnId == null) {
                columnId = client.getDefaultColumnId();
            }
            if (columnId == null) {
                return;
            }

            String fBoardId = boardId != null ? boardId : "";
            String taskId = task.getId();
            CreateTaskDto dto = new CreateTaskDto(task.getTitle(), task.getDescription(), columnId, null, null,
                    task.getDueDate() != null ? task.getDueDate().toEpochMilli() : null);
            client.enqueueCreate(dto, ygTask -> taskRepository.findById(taskId).ifPresent(t -> {
                t.setYougileTaskId(ygTask.id());
                t.setYougileBoardId(!fBoardId.isEmpty() ? fBoardId : ygTask.boardId());
                taskRepository.save(t);
            }));
        } catch (Exception e) {
            log.warn("[Tasks] YouGile sync on create failed: {}", e.getMessage());
        }
    }

    /** Обновление задачи в YouGile (ставится в очередь; при смене колонки учитывается column-map). */
    public void onUpdate(String oldYougileTaskId, String oldYougileBoardId, Task saved, boolean statusProvided) {
        if (oldYougileTaskId == null) {
            return;
        }
        if (!client.isConfigured()) {
            return;
        }
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("title", saved.getTitle());
            if (saved.getDescription() != null) {
                payload.put("description", saved.getDescription());
            }
            if (saved.getDueDate() != null) {
                payload.put("deadline", saved.getDueDate().toEpochMilli());
            }
            if (statusProvided && saved.getStatus() != null) {
                String columnId = (oldYougileBoardId != null && !oldYougileBoardId.isBlank())
                        ? saved.getStatus()
                        : client.getColumnMap().get(saved.getStatus());
                if (columnId != null) {
                    payload.put("columnId", columnId);
                }
            }
            client.enqueueUpdate(oldYougileTaskId, payload);
        } catch (Exception e) {
            log.warn("[Tasks] YouGile sync on update failed: {}", e.getMessage());
        }
    }

    /** Удаление задачи в YouGile (ставится в очередь). */
    public void onDelete(String yougileTaskId) {
        if (yougileTaskId == null) {
            return;
        }
        try {
            if (client.isConfigured()) {
                client.enqueueDelete(yougileTaskId);
            }
        } catch (Exception e) {
            log.warn("[Tasks] YouGile sync on delete failed: {}", e.getMessage());
        }
    }
}
