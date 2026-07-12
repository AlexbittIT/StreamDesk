package com.streamdesk.staff;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.staff.dto.StaffUnavailabilityRequest;
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

import java.util.List;
import java.util.Map;

/**
 * REST-контроллер интервалов недоступности сотрудников (отпуск/выходной/блок). companyId-изоляция.
 */
@RestController
@RequestMapping("/api/staff-availability")
public class StaffUnavailabilityController {

    private final StaffUnavailabilityService service;

    public StaffUnavailabilityController(StaffUnavailabilityService service) {
        this.service = service;
    }

    @GetMapping
    public List<StaffUnavailability> list(@RequestParam(required = false) String companyId,
                                          @RequestParam(required = false) String staffId,
                                          @AuthenticationPrincipal AuthenticatedUser user) {
        return service.list(companyId, staffId, user);
    }

    @PostMapping
    public ResponseEntity<StaffUnavailability> create(@RequestBody StaffUnavailabilityRequest req,
                                                      @AuthenticationPrincipal AuthenticatedUser user) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(req, user));
    }

    @DeleteMapping("/{id}")
    public Map<String, Boolean> delete(@PathVariable String id,
                                       @AuthenticationPrincipal AuthenticatedUser user) {
        service.delete(id, user);
        return Map.of("success", true);
    }
}
