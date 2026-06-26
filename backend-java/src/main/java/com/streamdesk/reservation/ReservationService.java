package com.streamdesk.reservation;

import com.streamdesk.config.ApiException;
import com.streamdesk.config.TimeParse;
import com.streamdesk.reservation.dto.ReservationRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

/**
 * Логика резерваций оборудования — перенос /api/equipment-reservations из backend/routes.ts.
 */
@Service
public class ReservationService {

    private final EquipmentReservationRepository repository;

    public ReservationService(EquipmentReservationRepository repository) {
        this.repository = repository;
    }

    public List<EquipmentReservation> list(String equipmentId) {
        if (equipmentId != null && !equipmentId.isBlank()) {
            return repository.findByEquipmentIdOrderByStartTime(equipmentId);
        }
        return repository.findAllByOrderByStartTime();
    }

    /** Конфликты по времени для запроса (с валидацией обязательных полей). */
    public List<EquipmentReservation> findConflicts(ReservationRequest req) {
        if (isBlank(req.startTime()) || isBlank(req.endTime())) {
            throw ApiException.badRequest("Invalid reservation data");
        }
        if (isBlank(req.equipmentId())) {
            return List.of();
        }
        Instant start = requireInstant(req.startTime());
        Instant end = requireInstant(req.endTime());
        return repository.findConflicts(req.equipmentId(), start, end);
    }

    @Transactional
    public EquipmentReservation create(ReservationRequest req) {
        if (isBlank(req.startTime()) || isBlank(req.endTime())) {
            throw ApiException.badRequest("Invalid reservation data");
        }
        EquipmentReservation reservation = new EquipmentReservation();
        reservation.setEquipmentId(req.equipmentId());
        reservation.setUserId(req.userId());
        reservation.setEventId(req.eventId());
        reservation.setStartTime(requireInstant(req.startTime()));
        reservation.setEndTime(requireInstant(req.endTime()));
        if (!isBlank(req.status())) {
            reservation.setStatus(req.status());
        }
        return repository.save(reservation);
    }

    private Instant requireInstant(String value) {
        try {
            return TimeParse.toInstant(value);
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("Invalid reservation data");
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
