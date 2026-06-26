package com.streamdesk.event;

import com.streamdesk.access.DataScope;
import com.streamdesk.access.DataScopeService;
import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.config.ApiException;
import com.streamdesk.notification.NotificationService;
import com.streamdesk.user.UserService;
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
 * Доступ к событиям по уровням видимости. У событий нет company_id — барьер компании выражается
 * через организатора/участников. Прямое обращение к чужому событию закрыто (403).
 */
class EventAccessTest {

    private final EventRepository eventRepository = mock(EventRepository.class);
    private final EventParticipantRepository participantRepository = mock(EventParticipantRepository.class);
    private final DataScopeService dataScopeService = mock(DataScopeService.class);

    private final EventService service = new EventService(
            eventRepository,
            participantRepository,
            mock(UserService.class),
            mock(NotificationService.class),
            dataScopeService);

    private static AuthenticatedUser user(String id, String role) {
        return new AuthenticatedUser(id, id, id, null, null, role, null,
                List.of(), true, true, "company_member", false);
    }

    private static Event event(String id, String organizer) {
        Event e = new Event();
        e.setId(id);
        e.setOrganizerId(organizer);
        return e;
    }

    private void participants(String eventId, String... userIds) {
        List<EventParticipant> list = java.util.Arrays.stream(userIds).map(uid -> {
            EventParticipant p = new EventParticipant();
            p.setEventId(eventId);
            p.setUserId(uid);
            return p;
        }).toList();
        when(participantRepository.findByEventId(eventId)).thenReturn(list);
    }

    private void scope(AuthenticatedUser u, DataScope s, Set<String> companyPeers, Set<String> deptPeers) {
        when(dataScopeService.resolveScope(u)).thenReturn(s);
        when(dataScopeService.companyPeerUserIds(u)).thenReturn(companyPeers);
        when(dataScopeService.departmentPeerUserIds(u)).thenReturn(deptPeers);
    }

    private void assertForbidden(String eventId, AuthenticatedUser u) {
        ApiException ex = assertThrows(ApiException.class, () -> service.getAccessibleEvent(eventId, u));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatus());
    }

    @Test
    void ownScopeSeesOrganizedAndAssignedEventsOnly() {
        AuthenticatedUser u = user("u1", "mine");
        scope(u, DataScope.OWN, Set.of("u1"), Set.of("u1"));

        Event organized = event("e1", "u1");
        participants("e1");
        Event invited = event("e2", "boss");
        participants("e2", "u1");
        Event foreign = event("e3", "boss");
        participants("e3", "x", "y");

        when(eventRepository.findById("e1")).thenReturn(Optional.of(organized));
        when(eventRepository.findById("e2")).thenReturn(Optional.of(invited));
        when(eventRepository.findById("e3")).thenReturn(Optional.of(foreign));

        assertSame(organized, service.getAccessibleEvent("e1", u));
        assertSame(invited, service.getAccessibleEvent("e2", u));
        assertForbidden("e3", u);
    }

    @Test
    void departmentScopeSeesDepartmentEvents() {
        AuthenticatedUser u = user("u1", "dept");
        scope(u, DataScope.DEPARTMENT, Set.of("u1", "u2", "u9"), Set.of("u1", "u2"));

        Event sameDept = event("e1", "u2");
        participants("e1");
        Event otherDept = event("e2", "u9");
        participants("e2", "u9");

        when(eventRepository.findById("e1")).thenReturn(Optional.of(sameDept));
        when(eventRepository.findById("e2")).thenReturn(Optional.of(otherDept));

        assertSame(sameDept, service.getAccessibleEvent("e1", u));
        assertForbidden("e2", u);
    }

    @Test
    void allScopeSeesCompanyEventsButNotOtherCompanies() {
        AuthenticatedUser u = user("u1", "all");
        scope(u, DataScope.ALL, Set.of("u1", "u2"), Set.of());

        Event company = event("e1", "u2");
        participants("e1");
        Event otherCompany = event("e2", "stranger");
        participants("e2", "alien");

        when(eventRepository.findById("e1")).thenReturn(Optional.of(company));
        when(eventRepository.findById("e2")).thenReturn(Optional.of(otherCompany));

        assertSame(company, service.getAccessibleEvent("e1", u));
        assertForbidden("e2", u);
    }

    @Test
    void adminSeesEverything() {
        AuthenticatedUser admin = user("a", "admin");
        when(dataScopeService.resolveScope(admin)).thenReturn(DataScope.ALL);
        when(dataScopeService.companyPeerUserIds(admin)).thenReturn(Set.of("a"));
        Event foreign = event("e1", "stranger");
        participants("e1", "alien");
        when(eventRepository.findById("e1")).thenReturn(Optional.of(foreign));
        assertSame(foreign, service.getAccessibleEvent("e1", admin));
    }
}
