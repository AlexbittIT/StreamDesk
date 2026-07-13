package com.streamdesk.staff;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.staff.dto.AvailableStaffResponse;
import com.streamdesk.staff.dto.StaffReservationRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * REST-контроллер броней сотрудников — по образцу /api/equipment-reservations, но с
 * companyId-изоляцией, проверкой двойного бронирования людей и отчётом «кто свободен».
 */
@RestController
@RequestMapping("/api/staff-reservations")
public class StaffReservationController {

    private final StaffReservationService reservationService;
    private final StaffAvailabilityReportService reportService;

    public StaffReservationController(StaffReservationService reservationService,
                                      StaffAvailabilityReportService reportService) {
        this.reservationService = reservationService;
        this.reportService = reportService;
    }

    @GetMapping
    public List<StaffReservation> list(@RequestParam(required = false) String companyId,
                                       @RequestParam(required = false) String staffId,
                                       @AuthenticationPrincipal AuthenticatedUser user) {
        return reservationService.list(companyId, staffId, user);
    }

    /** Отчёт «кто свободен на даты» в пределах компании. */
    @GetMapping("/available")
    public AvailableStaffResponse available(@RequestParam(required = false) String companyId,
                                            @RequestParam String start,
                                            @RequestParam String end,
                                            @AuthenticationPrincipal AuthenticatedUser user) {
        return reportService.availableStaff(companyId, start, end, user);
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody StaffReservationRequest req,
                                    @AuthenticationPrincipal AuthenticatedUser user) {
        // Конфликт двойного бронирования -> 409 с телом { message, conflicts }, как у оборудования.
        List<StaffReservation> conflicts = reservationService.findConflicts(req, user);
        if (!conflicts.isEmpty()) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("message", "Сотрудник уже забронирован на этот период");
            body.put("conflicts", conflicts);
            return ResponseEntity.status(HttpStatus.CONFLICT).body(body);
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(reservationService.create(req, user));
    }

    @DeleteMapping("/{id}")
    public Map<String, Boolean> cancel(@PathVariable String id,
                                       @AuthenticationPrincipal AuthenticatedUser user) {
        reservationService.cancel(id, user);
        return Map.of("success", true);
    }
}
