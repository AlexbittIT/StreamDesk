package com.streamdesk.staff;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.company.CompanyMember;
import com.streamdesk.company.CompanyService;
import com.streamdesk.config.ApiException;
import com.streamdesk.staff.dto.AvailableStaffResponse;
import com.streamdesk.user.User;
import com.streamdesk.user.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Отчёт «кто свободен на даты»: исключение занятых бронью и недоступных, companyId-изоляция.
 */
class StaffAvailabilityReportServiceTest {

    private final StaffReservationRepository reservationRepository = mock(StaffReservationRepository.class);
    private final StaffUnavailabilityRepository unavailabilityRepository = mock(StaffUnavailabilityRepository.class);
    private final CompanyService companyService = mock(CompanyService.class);
    private final UserService userService = mock(UserService.class);
    private final StaffAccess staffAccess = new StaffAccess(companyService);

    private final StaffAvailabilityReportService service = new StaffAvailabilityReportService(
            reservationRepository, unavailabilityRepository, companyService, userService, staffAccess);

    private static AuthenticatedUser user(String id) {
        return new AuthenticatedUser(id, id, id, null, null, "member", null,
                List.of(), true, true, "company_member", false);
    }

    private static CompanyMember member(String userId, String companyId, String status) {
        CompanyMember m = new CompanyMember();
        m.setUserId(userId);
        m.setCompanyId(companyId);
        m.setStatus(status);
        return m;
    }

    private static User staff(String id) {
        User u = new User();
        u.setId(id);
        u.setName("Имя " + id);
        u.setUsername(id);
        u.setPosition("Инженер");
        u.setDepartment("Продакшн");
        return u;
    }

    private static final String START = "2026-08-01T10:00:00Z";
    private static final String END = "2026-08-01T18:00:00Z";

    @Test
    void availableStaff_excludesBusyAndUnavailable_returnsFree() {
        AuthenticatedUser u = user("viewer");
        when(companyService.getUserCompanyIds(u)).thenReturn(List.of("company-a"));
        when(companyService.getCompanyMembers("company-a")).thenReturn(List.of(
                member("staff-busy", "company-a", "active"),
                member("staff-unavail", "company-a", "active"),
                member("staff-free", "company-a", "active"),
                member("staff-removed", "company-a", "removed")));

        when(reservationRepository.findBusyStaffIds(eq("company-a"), any(), any(), any()))
                .thenReturn(List.of("staff-busy"));
        when(unavailabilityRepository.findUnavailableStaffIds(eq("company-a"), any(), any(), any()))
                .thenReturn(List.of("staff-unavail"));
        when(userService.findById("staff-free")).thenReturn(Optional.of(staff("staff-free")));

        AvailableStaffResponse res = service.availableStaff("company-a", START, END, u);

        assertEquals("company-a", res.companyId());
        assertEquals(1, res.available().size());
        assertEquals("staff-free", res.available().get(0).id());
        assertEquals("Инженер", res.available().get(0).position());
    }

    @Test
    void availableStaff_removedMembersAreNotCandidates() {
        AuthenticatedUser u = user("viewer");
        when(companyService.getUserCompanyIds(u)).thenReturn(List.of("company-a"));
        when(companyService.getCompanyMembers("company-a")).thenReturn(List.of(
                member("staff-removed", "company-a", "removed")));

        AvailableStaffResponse res = service.availableStaff("company-a", START, END, u);

        assertTrue(res.available().isEmpty());
        // Нет активных кандидатов — репозитории занятости даже не опрашиваются.
        verify(reservationRepository, never()).findBusyStaffIds(anyString(), any(), any(), any());
    }

    @Test
    void availableStaff_forForeignCompany_forbidden() {
        AuthenticatedUser u = user("viewer");
        when(companyService.getUserCompanyIds(u)).thenReturn(List.of("company-b"));

        ApiException ex = assertThrows(ApiException.class,
                () -> service.availableStaff("company-a", START, END, u));

        assertEquals(HttpStatus.FORBIDDEN, ex.getStatus());
        verify(companyService, never()).getCompanyMembers("company-a");
    }

    @Test
    void availableStaff_endBeforeStart_badRequest() {
        AuthenticatedUser u = user("viewer");
        when(companyService.getUserCompanyIds(u)).thenReturn(List.of("company-a"));

        ApiException ex = assertThrows(ApiException.class,
                () -> service.availableStaff("company-a", END, START, u));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatus());
    }
}
