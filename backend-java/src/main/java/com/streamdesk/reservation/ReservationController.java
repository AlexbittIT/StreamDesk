package com.streamdesk.reservation;

import com.streamdesk.reservation.dto.ReservationRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * REST-контроллер резерваций оборудования — перенос /api/equipment-reservations из backend/routes.ts.
 */
@RestController
@RequestMapping("/api/equipment-reservations")
public class ReservationController {

    private final ReservationService reservationService;

    public ReservationController(ReservationService reservationService) {
        this.reservationService = reservationService;
    }

    @GetMapping
    public List<EquipmentReservation> list(@RequestParam(required = false) String equipmentId) {
        return reservationService.list(equipmentId);
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody ReservationRequest req) {
        // Конфликт по времени -> 409 с телом { message, conflicts }, как в Express.
        List<EquipmentReservation> conflicts = reservationService.findConflicts(req);
        if (!conflicts.isEmpty()) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("message", "Equipment is already reserved for this time period");
            body.put("conflicts", conflicts);
            return ResponseEntity.status(HttpStatus.CONFLICT).body(body);
        }
        return ResponseEntity.ok(reservationService.create(req));
    }
}
