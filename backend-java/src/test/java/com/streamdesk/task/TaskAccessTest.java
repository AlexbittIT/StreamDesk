package com.streamdesk.task;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.streamdesk.access.DataScope;
import com.streamdesk.access.DataScopeService;
import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.company.CompanyService;
import com.streamdesk.config.ApiException;
import com.streamdesk.notification.NotificationService;
import com.streamdesk.project.ProjectService;
import com.streamdesk.yougile.YougileTaskIntegration;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Доступ к задачам по уровням видимости (свои/отдел/все) + закрытие обхода по прямой ссылке
 * GET /api/tasks/{id}. Барьер компании действует на всех уровнях.
 */
class TaskAccessTest {

    private final TaskRepository taskRepository = mock(TaskRepository.class);
    private final CompanyService companyService = mock(CompanyService.class);
    private final DataScopeService dataScopeService = mock(DataScopeService.class);

    private final TaskService service = new TaskService(
            taskRepository,
            mock(TaskCommentRepository.class),
            mock(TaskHistoryRepository.class),
            companyService,
            mock(NotificationService.class),
            mock(ProjectService.class),
            dataScopeService,
            new ObjectMapper(),
            mock(YougileTaskIntegration.class));

    private static AuthenticatedUser user(String id, String role) {
        return new AuthenticatedUser(id, id, id, null, null, role, null,
                List.of(), true, true, "company_member", false);
    }

    private static Task task(String id, String creator, String assignee, String companyId) {
        Task t = new Task();
        t.setId(id);
        t.setCreatorId(creator);
        t.setAssigneeId(assignee);
        t.setCompanyId(companyId);
        return t;
    }

    private void scope(AuthenticatedUser u, DataScope s, List<String> companies, Set<String> deptPeers) {
        when(dataScopeService.resolveScope(u)).thenReturn(s);
        when(companyService.getUserCompanyIds(u)).thenReturn(companies);
        when(dataScopeService.departmentPeerUserIds(u)).thenReturn(deptPeers);
    }

    private void assertForbidden(String taskId, AuthenticatedUser u) {
        ApiException ex = assertThrows(ApiException.class, () -> service.getTask(taskId, u));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatus());
    }

    // --- OWN ---

    @Test
    void ownScopeSeesOnlyOwnTasks() {
        AuthenticatedUser u = user("u1", "mine");
        scope(u, DataScope.OWN, List.of("c1"), Set.of("u1"));

        Task own = task("t1", "u1", null, "c1");
        Task assigned = task("t2", "other", "u1", "c1");
        Task foreign = task("t3", "other", "other", "c1");
        when(taskRepository.findById("t1")).thenReturn(Optional.of(own));
        when(taskRepository.findById("t2")).thenReturn(Optional.of(assigned));
        when(taskRepository.findById("t3")).thenReturn(Optional.of(foreign));

        assertSame(own, service.getTask("t1", u));
        assertSame(assigned, service.getTask("t2", u));
        assertForbidden("t3", u); // обход по прямой ссылке закрыт
    }

    // --- DEPARTMENT ---

    @Test
    void departmentScopeSeesDepartmentButNotOthers() {
        AuthenticatedUser u = user("u1", "dept");
        scope(u, DataScope.DEPARTMENT, List.of("c1"), Set.of("u1", "u2"));

        Task sameDept = task("t1", "u2", null, "c1");
        Task otherDept = task("t2", "u9", "u8", "c1");
        when(taskRepository.findById("t1")).thenReturn(Optional.of(sameDept));
        when(taskRepository.findById("t2")).thenReturn(Optional.of(otherDept));

        assertSame(sameDept, service.getTask("t1", u));
        assertForbidden("t2", u);
    }

    // --- ALL ---

    @Test
    void allScopeSeesWholeCompanyButNotOtherCompanies() {
        AuthenticatedUser u = user("u1", "all");
        scope(u, DataScope.ALL, List.of("c1"), Set.of());

        Task inCompany = task("t1", "someone", "else", "c1");
        Task otherCompany = task("t2", "someone", "else", "c2");
        when(taskRepository.findById("t1")).thenReturn(Optional.of(inCompany));
        when(taskRepository.findById("t2")).thenReturn(Optional.of(otherCompany));

        assertSame(inCompany, service.getTask("t1", u));
        assertForbidden("t2", u); // разделение между компаниями сохраняется
    }

    // --- company isolation independent of level ---

    @Test
    void ownTaskInForeignCompanyStillVisibleToOwner() {
        // «свои» записи видны всегда, но это не нарушает изоляцию: задача всё равно создана пользователем.
        AuthenticatedUser u = user("u1", "all");
        scope(u, DataScope.ALL, List.of("c1"), Set.of());
        Task ownElsewhere = task("t1", "u1", null, "c2");
        when(taskRepository.findById("t1")).thenReturn(Optional.of(ownElsewhere));
        assertSame(ownElsewhere, service.getTask("t1", u));
    }

    @Test
    void adminSeesEverythingIncludingNullCompany() {
        AuthenticatedUser admin = user("a", "admin");
        when(dataScopeService.resolveScope(admin)).thenReturn(DataScope.ALL);
        when(companyService.getUserCompanyIds(admin)).thenReturn(List.of());
        Task orphan = task("t1", "x", "y", null);
        when(taskRepository.findById("t1")).thenReturn(Optional.of(orphan));
        assertSame(orphan, service.getTask("t1", admin));
    }
}
