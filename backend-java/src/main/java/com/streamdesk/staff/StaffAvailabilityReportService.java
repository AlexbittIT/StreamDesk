package com.streamdesk.staff;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.company.CompanyMember;
import com.streamdesk.company.CompanyService;
import com.streamdesk.config.ApiException;
import com.streamdesk.config.TimeParse;
import com.streamdesk.staff.dto.AvailableStaffResponse;
import com.streamdesk.user.User;
import com.streamdesk.user.UserService;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Отчёт «кто свободен на даты»: активные сотрудники компании за вычетом тех, у кого на период
 * есть активная бронь ИЛИ интервал недоступности. Всё в пределах компании (companyId-изоляция).
 */
@Service
public class StaffAvailabilityReportService {

    private final StaffReservationRepository reservationRepository;
    private final StaffUnavailabilityRepository unavailabilityRepository;
    private final CompanyService companyService;
    private final UserService userService;
    private final StaffAccess staffAccess;

    public StaffAvailabilityReportService(StaffReservationRepository reservationRepository,
                                          StaffUnavailabilityRepository unavailabilityRepository,
                                          CompanyService companyService,
                                          UserService userService,
                                          StaffAccess staffAccess) {
        this.reservationRepository = reservationRepository;
        this.unavailabilityRepository = unavailabilityRepository;
        this.companyService = companyService;
        this.userService = userService;
        this.staffAccess = staffAccess;
    }

    /** Свободные сотрудники компании на [start, end). */
    public AvailableStaffResponse availableStaff(String companyId, String startRaw, String endRaw,
                                                 AuthenticatedUser user) {
        String company = staffAccess.resolveReadableCompanyId(companyId, user);
        Instant start = requireInstant(startRaw);
        Instant end = requireInstant(endRaw);
        if (!end.isAfter(start)) {
            throw ApiException.badRequest("Дата окончания должна быть позже начала");
        }

        // Кандидаты — активные участники компании (сохраняем порядок для стабильного ответа).
        Set<String> candidateIds = new LinkedHashSet<>();
        for (CompanyMember member : companyService.getCompanyMembers(company)) {
            if ("active".equals(member.getStatus()) && member.getUserId() != null) {
                candidateIds.add(member.getUserId());
            }
        }
        if (candidateIds.isEmpty()) {
            return new AvailableStaffResponse(start.toString(), end.toString(), company, List.of());
        }

        // Исключаем занятых бронью и недоступных на этот период.
        Set<String> busy = new LinkedHashSet<>(
                reservationRepository.findBusyStaffIds(company, candidateIds, start, end));
        busy.addAll(unavailabilityRepository.findUnavailableStaffIds(company, candidateIds, start, end));

        List<AvailableStaffResponse.StaffMember> free = candidateIds.stream()
                .filter(id -> !busy.contains(id))
                .map(userService::findById)
                .flatMap(java.util.Optional::stream)
                .map(this::toCard)
                .toList();

        return new AvailableStaffResponse(start.toString(), end.toString(), company, free);
    }

    private AvailableStaffResponse.StaffMember toCard(User u) {
        return new AvailableStaffResponse.StaffMember(
                u.getId(), u.getName(), u.getUsername(), u.getPosition(), u.getDepartment());
    }

    private Instant requireInstant(String value) {
        if (value == null || value.isBlank()) {
            throw ApiException.badRequest("Укажите start и end");
        }
        try {
            Instant instant = TimeParse.toInstant(value);
            if (instant == null) {
                throw ApiException.badRequest("Некорректные даты периода");
            }
            return instant;
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("Некорректные даты периода");
        }
    }
}
