package com.streamdesk.e2e;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.company.CompanyMember;
import com.streamdesk.company.CompanyMemberRepository;
import com.streamdesk.event.Event;
import com.streamdesk.event.EventRepository;
import com.streamdesk.task.Task;
import com.streamdesk.task.TaskRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * E2E видимости данных по роли (трактовка data_scope) через HTTP-слой.
 *
 * Задачи (реальная логика по правам): пользователь без права «видеть всё» получает только
 * свои задачи (создатель/исполнитель), а обладатель tasks:view_all видит и чужие — в пределах
 * выдачи. Тест падает, если фильтрацию по правам сломать (например, показать всё всем).
 *
 * События: серверного построчного OWN/ALL-фильтра у /api/events нет — единственная граница
 * видимости — доступ к рабочему пространству (hasWorkspaceAccess). Поэтому здесь проверяем
 * именно её: без доступа к workspace список пуст, с доступом — события компании видны.
 */
@Transactional
class VisibilityE2ETest extends AbstractE2ETest {

    @Autowired
    private TaskRepository taskRepository;

    @Autowired
    private EventRepository eventRepository;

    @Autowired
    private CompanyMemberRepository companyMemberRepository;

    @Test
    void tasks_ownUserSeesOnlyOwn_viewAllUserSeesOthers() throws Exception {
        String ownId = "own-user-1";
        String companyId = "company-1";
        // Чужая задача (другой создатель/исполнитель) в компании company-1.
        Task stranger = task("Чужая задача", "stranger-1", "stranger-1");
        stranger.setCompanyId(companyId);
        taskRepository.save(stranger);
        // Своя задача владельца (без компании — видна по владению, на любом уровне).
        taskRepository.save(task("Моя задача", ownId, ownId));

        AuthenticatedUser own = user(ownId, "user", List.of());
        AuthenticatedUser viewAll = user("viewer-all", "user", List.of("tasks:view_all"));
        // viewAll — активный участник company-1: барьер компании (действует даже на уровне
        // ALL/view_all) пропускает чужую задачу этой компании.
        companyMemberRepository.save(member("viewer-all", companyId));

        // OWN: видит свою, НЕ видит чужую.
        mockMvc.perform(get("/api/tasks").with(as(own)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].title", hasItem("Моя задача")))
                .andExpect(jsonPath("$[*].title", not(hasItem("Чужая задача"))));

        // ALL (tasks:view_all): видит и чужую задачу.
        mockMvc.perform(get("/api/tasks").with(as(viewAll)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].title", hasItem("Чужая задача")));
    }

    @Test
    void events_noWorkspaceAccessSeesNothing_workspaceAccessSeesEvents() throws Exception {
        eventRepository.save(event("Событие E2E", "organizer-1"));

        // Нет членства в компании и не admin → нет доступа к workspace → пустой список.
        AuthenticatedUser outsider = user("outsider-1", "user", List.of());
        mockMvc.perform(get("/api/events").with(as(outsider)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));

        // Admin имеет доступ к workspace → видит событие.
        mockMvc.perform(get("/api/events").with(as(admin())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].title", hasItem("Событие E2E")));
    }

    private Task task(String title, String creatorId, String assigneeId) {
        Task t = new Task();
        t.setTitle(title);
        t.setCreatorId(creatorId);
        t.setAssigneeId(assigneeId);
        return t;
    }

    private CompanyMember member(String userId, String companyId) {
        CompanyMember m = new CompanyMember();
        m.setUserId(userId);
        m.setCompanyId(companyId);
        m.setStatus("active");
        return m;
    }

    private Event event(String title, String organizerId) {
        Event e = new Event();
        e.setTitle(title);
        e.setOrganizerId(organizerId);
        e.setLocation("Студия");
        e.setStartTime(Instant.now());
        e.setEndTime(Instant.now().plus(1, ChronoUnit.HOURS));
        return e;
    }
}
