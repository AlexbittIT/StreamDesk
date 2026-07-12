package com.streamdesk.staff;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.company.CompanyService;
import com.streamdesk.config.ApiException;
import com.streamdesk.staff.dto.StaffReservationRequest;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.time.Instant;
import java.util.List;

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
 * Двойное бронирование сотрудников и companyId-изоляция. Репозиторий мокается, {@link StaffAccess}
 * реальный (поверх мокнутого {@link CompanyService}) — чтобы проверять именно барьер компании.
 */
class StaffReservationServiceTest {

    private final StaffReservationRepository reservationRepository = mock(StaffReservationRepository.class);
    private final CompanyService companyService = mock(CompanyService.class);
    private final StaffAccess staffAccess = new StaffAccess(companyService);
    private final StaffReservationService service = new StaffReservationService(reservationRepository, staffAccess);

    private static AuthenticatedUser user(String id, String role) {
        return new AuthenticatedUser(id, id, id, null, null, role, null,
                List.of(), true, true, "company_member", false);
    }

    private static StaffReservationRequest req(String staffId, String companyId, String start, String end) {
        return new StaffReservationRequest(staffId, companyId, null, start, end, null);
    }

    private static StaffReservation reservation(String staffId, String companyId) {
        StaffReservation r = new StaffReservation();
        r.setStaffId(staffId);
        r.setCompanyId(companyId);
        r.setStartTime(Instant.parse("2026-08-01T10:00:00Z"));
        r.setEndTime(Instant.parse("2026-08-01T12:00:00Z"));
        return r;
    }

    // --- двойное бронирование ---

    @Test
    void create_withOverlappingReservation_throwsConflict() {
        AuthenticatedUser u = user("u1", "member");
        when(companyService.getUserCompanyIds(u)).thenReturn(List.of("company-a"));
        when(reservationRepository.findConflicts(eq("company-a"), eq("staff-1"), any(), any()))
                .thenReturn(List.of(reservation("staff-1", "company-a")));

        ApiException ex = assertThrows(ApiException.class, () -> service.create(
                req("staff-1", "company-a", "2026-08-01T11:00:00Z", "2026-08-01T13:00:00Z"), u));

        assertEquals(HttpStatus.CONFLICT, ex.getStatus());
        verify(reservationRepository, never()).save(any());
    }

    @Test
    void create_withoutConflict_saves() {
        AuthenticatedUser u = user("u1", "member");
        when(companyService.getUserCompanyIds(u)).thenReturn(List.of("company-a"));
        when(reservationRepository.findConflicts(eq("company-a"), eq("staff-1"), any(), any()))
                .thenReturn(List.of());
        when(reservationRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        StaffReservation saved = service.create(
                req("staff-1", "company-a", "2026-08-01T10:00:00Z", "2026-08-01T12:00:00Z"), u);

        assertEquals("staff-1", saved.getStaffId());
        assertEquals("company-a", saved.getCompanyId());
        assertEquals("active", saved.getStatus());
        verify(reservationRepository).save(any());
    }

    // --- свободен / занят на даты (через findConflicts) ---

    @Test
    void findConflicts_busy_returnsNonEmpty() {
        AuthenticatedUser u = user("u1", "member");
        when(companyService.getUserCompanyIds(u)).thenReturn(List.of("company-a"));
        when(reservationRepository.findConflicts(eq("company-a"), eq("staff-1"), any(), any()))
                .thenReturn(List.of(reservation("staff-1", "company-a")));

        List<StaffReservation> conflicts = service.findConflicts(
                req("staff-1", "company-a", "2026-08-01T11:00:00Z", "2026-08-01T13:00:00Z"), u);

        assertEquals(1, conflicts.size());
    }

    @Test
    void findConflicts_free_returnsEmpty() {
        AuthenticatedUser u = user("u1", "member");
        when(companyService.getUserCompanyIds(u)).thenReturn(List.of("company-a"));
        when(reservationRepository.findConflicts(eq("company-a"), eq("staff-1"), any(), any()))
                .thenReturn(List.of());

        List<StaffReservation> conflicts = service.findConflicts(
                req("staff-1", "company-a", "2026-08-01T11:00:00Z", "2026-08-01T13:00:00Z"), u);

        assertTrue(conflicts.isEmpty());
    }

    // --- companyId-изоляция ---

    @Test
    void create_forCompanyUserIsNotMemberOf_forbidden() {
        AuthenticatedUser u = user("u1", "member");
        when(companyService.getUserCompanyIds(u)).thenReturn(List.of("company-b"));

        ApiException ex = assertThrows(ApiException.class, () -> service.create(
                req("staff-1", "company-a", "2026-08-01T10:00:00Z", "2026-08-01T12:00:00Z"), u));

        assertEquals(HttpStatus.FORBIDDEN, ex.getStatus());
        verify(reservationRepository, never()).findConflicts(anyString(), anyString(), any(), any());
        verify(reservationRepository, never()).save(any());
    }

    @Test
    void create_withoutAnyCompany_badRequest() {
        AuthenticatedUser u = user("u1", "member");
        when(companyService.getUserCompanyIds(u)).thenReturn(List.of());

        ApiException ex = assertThrows(ApiException.class, () -> service.create(
                req("staff-1", null, "2026-08-01T10:00:00Z", "2026-08-01T12:00:00Z"), u));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatus());
    }

    @Test
    void create_defaultsToFirstCompany_whenNotSpecified() {
        AuthenticatedUser u = user("u1", "member");
        when(companyService.getUserCompanyIds(u)).thenReturn(List.of("company-a"));
        when(reservationRepository.findConflicts(eq("company-a"), eq("staff-1"), any(), any()))
                .thenReturn(List.of());
        when(reservationRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        StaffReservation saved = service.create(
                req("staff-1", null, "2026-08-01T10:00:00Z", "2026-08-01T12:00:00Z"), u);

        assertEquals("company-a", saved.getCompanyId());
    }

    // --- валидация ---

    @Test
    void create_blankStaffId_badRequest() {
        AuthenticatedUser u = user("u1", "member");
        when(companyService.getUserCompanyIds(u)).thenReturn(List.of("company-a"));

        ApiException ex = assertThrows(ApiException.class, () -> service.create(
                req("", "company-a", "2026-08-01T10:00:00Z", "2026-08-01T12:00:00Z"), u));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatus());
    }

    @Test
    void create_endBeforeStart_badRequest() {
        AuthenticatedUser u = user("u1", "member");
        when(companyService.getUserCompanyIds(u)).thenReturn(List.of("company-a"));

        ApiException ex = assertThrows(ApiException.class, () -> service.create(
                req("staff-1", "company-a", "2026-08-01T12:00:00Z", "2026-08-01T10:00:00Z"), u));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatus());
    }
}
