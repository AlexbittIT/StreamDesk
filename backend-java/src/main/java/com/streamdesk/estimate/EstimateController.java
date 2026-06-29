package com.streamdesk.estimate;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.estimate.dto.CalculateRequest;
import com.streamdesk.estimate.dto.EstimateRequest;
import com.streamdesk.estimate.dto.VersionRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * REST-контроллер смет и их версий. Обеспечивает двустороннюю связь смета↔проект:
 * GET /api/estimates?projectId= отдаёт сметы конкретного проекта, а поле projectId
 * в смете ведёт обратно к проекту.
 */
@RestController
@RequestMapping("/api/estimates")
public class EstimateController {

    private final EstimateService estimateService;
    private final ShiftCalculationService shiftCalculationService;

    public EstimateController(EstimateService estimateService,
                             ShiftCalculationService shiftCalculationService) {
        this.estimateService = estimateService;
        this.shiftCalculationService = shiftCalculationService;
    }

    // POST /api/estimates/calculate — серверный расчёт смен и итогов (источник истины)
    @PostMapping("/calculate")
    public Map<String, Object> calculate(@RequestBody CalculateRequest req) {
        return shiftCalculationService.calculate(req);
    }

    // GET /api/estimates  (опц. ?projectId=)
    @GetMapping
    public List<Estimate> list(@AuthenticationPrincipal AuthenticatedUser user,
                               @RequestParam(required = false) String projectId) {
        return estimateService.listEstimates(user, projectId);
    }

    // GET /api/estimates/{id}
    @GetMapping("/{id}")
    public Estimate get(@PathVariable String id) {
        return estimateService.getEstimate(id);
    }

    // POST /api/estimates
    @PostMapping
    public ResponseEntity<Estimate> create(@RequestBody EstimateRequest req,
                                           @AuthenticationPrincipal AuthenticatedUser user) {
        return ResponseEntity.status(HttpStatus.CREATED).body(estimateService.createEstimate(req, user));
    }

    // PUT /api/estimates/{id}
    @PutMapping("/{id}")
    public Estimate update(@PathVariable String id, @RequestBody EstimateRequest req) {
        return estimateService.updateEstimate(id, req);
    }

    // DELETE /api/estimates/{id}
    @DeleteMapping("/{id}")
    public Map<String, Boolean> delete(@PathVariable String id) {
        estimateService.deleteEstimate(id);
        return Map.of("success", true);
    }

    // GET /api/estimates/{id}/versions
    @GetMapping("/{id}/versions")
    public List<EstimateVersion> versions(@PathVariable String id) {
        return estimateService.listVersions(id);
    }

    // POST /api/estimates/{id}/versions
    @PostMapping("/{id}/versions")
    public ResponseEntity<EstimateVersion> createVersion(@PathVariable String id,
                                                         @RequestBody VersionRequest req,
                                                         @AuthenticationPrincipal AuthenticatedUser user) {
        return ResponseEntity.status(HttpStatus.CREATED).body(estimateService.createVersion(id, req, user));
    }

    // GET /api/estimates/versions/{versionId}
    @GetMapping("/versions/{versionId}")
    public EstimateVersion version(@PathVariable String versionId) {
        return estimateService.getVersion(versionId);
    }

    // DELETE /api/estimates/versions/{versionId}
    @DeleteMapping("/versions/{versionId}")
    public Map<String, Boolean> deleteVersion(@PathVariable String versionId) {
        estimateService.deleteVersion(versionId);
        return Map.of("success", true);
    }
}
