package com.streamdesk.staff;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.config.ApiException;
import com.streamdesk.config.TimeParse;
import com.streamdesk.staff.dto.StaffReservationRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

/**
 * Логика броней сотрудников — аналог {@code ReservationService} для оборудования, но с
 * изоляцией по компании и проверкой двойного бронирования человека (нельзя забронировать
 * сотрудника на пересекающиеся даты в пределах компании).
 */
@Service
public class StaffReservationService {

    private final StaffReservationRepository reservationRepository;
    private final StaffAccess staffAccess;

    public StaffReservationService(StaffReservationRepository reservationRepository,
                                   StaffAccess staffAccess) {
        this.reservationRepository = reservationRepository;
        this.staffAccess = staffAccess;
    }

    /** Список броней компании пользователя (опционально по сотруднику). */
    public List<StaffReservation> list(String companyId, String staffId, AuthenticatedUser user) {
        String company = staffAccess.resolveReadableCompanyId(companyId, user);
        if (staffId != null && !staffId.isBlank()) {
            return reservationRepository.findByCompanyIdAndStaffIdOrderByStartTime(company, staffId);
        }
        return reservationRepository.findByCompanyIdOrderByStartTime(company);
    }

    /**
     * Пересекающиеся активные брони того же сотрудника в компании — проверка двойного
     * бронирования. Требует staffId и корректные даты.
     */
    public List<StaffReservation> findConflicts(StaffReservationRequest req, AuthenticatedUser user) {
        String company = staffAccess.resolveWritableCompanyId(req.companyId(), user);
        if (isBlank(req.staffId())) {
            throw ApiException.badRequest("staffId is required");
        }
        Instant start = requireInstant(req.startTime());
        Instant end = requireInstant(req.endTime());
        requireValidRange(start, end);
        return reservationRepository.findConflicts(company, req.staffId(), start, end);
    }

    /**
     * Создать бронь. При пересечении с существующей активной бронью того же сотрудника —
     * явная ошибка 409 (двойное бронирование запрещено).
     */
    @Transactional
    public StaffReservation create(StaffReservationRequest req, AuthenticatedUser user) {
        String company = staffAccess.resolveWritableCompanyId(req.companyId(), user);
        if (isBlank(req.staffId())) {
            throw ApiException.badRequest("staffId is required");
        }
        Instant start = requireInstant(req.startTime());
        Instant end = requireInstant(req.endTime());
        requireValidRange(start, end);

        List<StaffReservation> conflicts = reservationRepository.findConflicts(company, req.staffId(), start, end);
        if (!conflicts.isEmpty()) {
            throw new ApiException(org.springframework.http.HttpStatus.CONFLICT,
                    "Сотрудник уже забронирован на этот период");
        }

        StaffReservation reservation = new StaffReservation();
        reservation.setStaffId(req.staffId());
        reservation.setCompanyId(company);
        reservation.setEventId(req.eventId());
        reservation.setStartTime(start);
        reservation.setEndTime(end);
        if (!isBlank(req.status())) {
            reservation.setStatus(req.status());
        }
        reservation.setCreatedBy(user != null ? user.id() : null);
        return reservationRepository.save(reservation);
    }

    /** Отменить бронь (в пределах своей компании). */
    @Transactional
    public void cancel(String id, AuthenticatedUser user) {
        StaffReservation reservation = reservationRepository.findById(id)
                .orElseThrow(() -> new ApiException(org.springframework.http.HttpStatus.NOT_FOUND, "Бронь не найдена"));
        staffAccess.assertMember(reservation.getCompanyId(), user);
        reservation.setStatus("cancelled");
        reservationRepository.save(reservation);
    }

    private Instant requireInstant(String value) {
        if (isBlank(value)) {
            throw ApiException.badRequest("Некорректные даты брони");
        }
        try {
            Instant instant = TimeParse.toInstant(value);
            if (instant == null) {
                throw ApiException.badRequest("Некорректные даты брони");
            }
            return instant;
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("Некорректные даты брони");
        }
    }

    private void requireValidRange(Instant start, Instant end) {
        if (!end.isAfter(start)) {
            throw ApiException.badRequest("Дата окончания должна быть позже начала");
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
