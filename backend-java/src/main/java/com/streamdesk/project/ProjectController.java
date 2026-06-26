package com.streamdesk.project;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.project.dto.ColumnRequest;
import com.streamdesk.project.dto.ProjectRequest;
import com.streamdesk.project.dto.ReorderRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * REST-контроллер проектов и столбцов — перенос /api/projects из backend/routes.ts. Пути сохранены.
 */
@RestController
@RequestMapping("/api/projects")
public class ProjectController {

    private final ProjectService projectService;

    public ProjectController(ProjectService projectService) {
        this.projectService = projectService;
    }

    // GET /api/projects
    @GetMapping
    public List<Project> list(@AuthenticationPrincipal AuthenticatedUser user) {
        return projectService.listProjects(user);
    }

    // POST /api/projects
    @PostMapping
    public ResponseEntity<Project> create(@RequestBody ProjectRequest req,
                                          @AuthenticationPrincipal AuthenticatedUser user) {
        return ResponseEntity.status(HttpStatus.CREATED).body(projectService.createProject(req, user));
    }

    // PUT /api/projects/{id}
    @PutMapping("/{id}")
    public Project update(@PathVariable String id, @RequestBody ProjectRequest req) {
        return projectService.updateProject(id, req);
    }

    // DELETE /api/projects/{id}
    @DeleteMapping("/{id}")
    public Map<String, Boolean> delete(@PathVariable String id) {
        projectService.deleteProject(id);
        return Map.of("success", true);
    }

    // GET /api/projects/{id}/task-stats
    @GetMapping("/{id}/task-stats")
    public Map<String, Object> taskStats(@PathVariable String id) {
        return projectService.taskStats(id);
    }

    // GET /api/projects/{projectId}/columns
    @GetMapping("/{projectId}/columns")
    public List<ProjectColumn> columns(@PathVariable String projectId) {
        return projectService.listColumns(projectId);
    }

    // POST /api/projects/{projectId}/columns
    @PostMapping("/{projectId}/columns")
    public ResponseEntity<ProjectColumn> createColumn(@PathVariable String projectId,
                                                      @RequestBody ColumnRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(projectService.createColumn(projectId, req));
    }

    // PUT /api/projects/{projectId}/columns/{id}
    @PutMapping("/{projectId}/columns/{id}")
    public ProjectColumn updateColumn(@PathVariable String projectId, @PathVariable String id,
                                      @RequestBody ColumnRequest req) {
        return projectService.updateColumn(id, req);
    }

    // DELETE /api/projects/{projectId}/columns/{id}
    @DeleteMapping("/{projectId}/columns/{id}")
    public Map<String, Boolean> deleteColumn(@PathVariable String projectId, @PathVariable String id) {
        projectService.deleteColumn(id);
        return Map.of("success", true);
    }

    // POST /api/projects/{projectId}/columns/reorder
    @PostMapping("/{projectId}/columns/reorder")
    public Map<String, Boolean> reorder(@PathVariable String projectId, @RequestBody ReorderRequest req) {
        projectService.reorderColumns(projectId, req != null ? req.columnIds() : null);
        return Map.of("success", true);
    }
}
