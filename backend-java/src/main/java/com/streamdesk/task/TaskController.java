package com.streamdesk.task;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.task.dto.CommentRequest;
import com.streamdesk.task.dto.TaskRequest;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * REST-контроллер задач — перенос /api/tasks из backend/routes.ts. Пути сохранены.
 */
@RestController
@RequestMapping("/api/tasks")
public class TaskController {

    private final TaskService taskService;

    public TaskController(TaskService taskService) {
        this.taskService = taskService;
    }

    // GET /api/tasks (?assigneeId= &creatorId= &status= &yougileBoardId=)
    @GetMapping
    public List<Task> list(@AuthenticationPrincipal AuthenticatedUser user,
                           @RequestParam(required = false) String assigneeId,
                           @RequestParam(required = false) String creatorId,
                           @RequestParam(required = false) String status,
                           @RequestParam(required = false) String yougileBoardId) {
        return taskService.listTasks(user, assigneeId, creatorId, status, yougileBoardId);
    }

    // GET /api/tasks/{id}
    @GetMapping("/{id}")
    public Task get(@PathVariable String id, @AuthenticationPrincipal AuthenticatedUser user) {
        return taskService.getTask(id, user);
    }

    // POST /api/tasks
    @PostMapping
    public Task create(@RequestBody TaskRequest req, @AuthenticationPrincipal AuthenticatedUser user) {
        return taskService.createTask(req, user);
    }

    // PUT /api/tasks/{id}
    @PutMapping("/{id}")
    public Task update(@PathVariable String id, @RequestBody TaskRequest req,
                       @AuthenticationPrincipal AuthenticatedUser user) {
        taskService.requireAccess(taskService.getTask(id), user);
        return taskService.updateTask(id, req);
    }

    // DELETE /api/tasks/{id}
    @DeleteMapping("/{id}")
    public Map<String, Boolean> delete(@PathVariable String id, @AuthenticationPrincipal AuthenticatedUser user) {
        taskService.requireAccess(taskService.getTask(id), user);
        taskService.deleteTask(id);
        return Map.of("success", true);
    }

    // GET /api/tasks/{taskId}/comments
    @GetMapping("/{taskId}/comments")
    public List<TaskComment> comments(@PathVariable String taskId, @AuthenticationPrincipal AuthenticatedUser user) {
        taskService.requireAccess(taskService.getTask(taskId), user);
        return taskService.getComments(taskId);
    }

    // POST /api/tasks/{taskId}/comments
    @PostMapping("/{taskId}/comments")
    public TaskComment addComment(@PathVariable String taskId, @RequestBody CommentRequest req,
                                  @AuthenticationPrincipal AuthenticatedUser user) {
        taskService.requireAccess(taskService.getTask(taskId), user);
        return taskService.createComment(taskId, req);
    }

    // DELETE /api/tasks/{taskId}/comments/{commentId}
    @DeleteMapping("/{taskId}/comments/{commentId}")
    public Map<String, Boolean> deleteComment(@PathVariable String taskId, @PathVariable String commentId,
                                              @AuthenticationPrincipal AuthenticatedUser user) {
        taskService.requireAccess(taskService.getTask(taskId), user);
        taskService.deleteComment(commentId);
        return Map.of("success", true);
    }

    // GET /api/tasks/{taskId}/history
    @GetMapping("/{taskId}/history")
    public List<TaskHistory> history(@PathVariable String taskId, @AuthenticationPrincipal AuthenticatedUser user) {
        taskService.requireAccess(taskService.getTask(taskId), user);
        return taskService.getHistory(taskId);
    }
}
