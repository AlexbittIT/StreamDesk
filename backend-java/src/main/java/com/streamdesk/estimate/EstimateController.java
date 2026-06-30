package com.streamdesk.estimate;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.company.CompanyService;
import com.streamdesk.config.ApiException;
import com.streamdesk.equipment.Equipment;
import com.streamdesk.equipment.EquipmentRepository;
import com.streamdesk.estimate.dto.CalculateRequest;
import com.streamdesk.estimate.dto.EstimateAnalyzeRequest;
import com.streamdesk.estimate.dto.EstimateRequest;
import com.streamdesk.estimate.dto.EstimateResult;
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
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

/**
 * REST-контроллер смет. Объединяет три слоя фичи «Смета»:
 * <ul>
 *   <li>сборка по ТЗ — POST /analyze (SD-152/157), через {@link EstimateAnalysisService};</li>
 *   <li>серверный расчёт смен/итогов — POST /calculate (SD-161, источник истины),
 *       через {@link ShiftCalculationService};</li>
 *   <li>хранение смет и версий + связь смета↔проект — CRUD и /versions (SD-165),
 *       через {@link EstimateService}.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/estimates")
public class EstimateController {

    private final EstimateAnalysisService analysisService;
    private final EstimateService estimateService;
    private final ShiftCalculationService shiftCalculationService;
    private final EquipmentRepository equipmentRepository;
    private final CompanyService companyService;

    public EstimateController(EstimateAnalysisService analysisService,
                              EstimateService estimateService,
                              ShiftCalculationService shiftCalculationService,
                              EquipmentRepository equipmentRepository,
                              CompanyService companyService) {
        this.analysisService = analysisService;
        this.estimateService = estimateService;
        this.shiftCalculationService = shiftCalculationService;
        this.equipmentRepository = equipmentRepository;
        this.companyService = companyService;
    }

    // ─── Сборка по ТЗ (SD-152/157) ───

    // POST /api/estimates/analyze — собрать смету по ТЗ (текст + файл + параметры смен)
    @PostMapping("/analyze")
    public EstimateResult analyze(@AuthenticationPrincipal AuthenticatedUser user,
                                  @RequestParam(required = false) String title,
                                  @RequestParam(required = false) String text,
                                  @RequestParam(required = false, defaultValue = "false") boolean requireAi,
                                  @RequestParam(required = false) String eventType,
                                  @RequestParam(required = false) String startAt,
                                  @RequestParam(required = false) String endAt,
                                  @RequestParam(required = false) String manualShiftCount,
                                  @RequestParam(required = false) String shiftHours,
                                  @RequestParam(required = false) String roundingStep,
                                  @RequestParam(required = false) String dayStartHour,
                                  @RequestParam(required = false) String nightStartHour,
                                  @RequestParam(required = false) String weekdayDayCoefficient,
                                  @RequestParam(required = false) String weekdayNightCoefficient,
                                  @RequestParam(required = false) String weekendDayCoefficient,
                                  @RequestParam(required = false) String weekendNightCoefficient,
                                  @RequestParam(required = false) String holidayDates,
                                  @RequestParam(required = false) String workdayDates,
                                  @RequestParam(value = "file", required = false) MultipartFile file) {
        if (!companyService.hasWorkspaceAccess(user)) {
            throw ApiException.forbidden("Сначала создайте компанию или вступите по приглашению");
        }
        EstimateAnalyzeRequest request = new EstimateAnalyzeRequest(
                title, text, requireAi, eventType,
                startAt, endAt, manualShiftCount, shiftHours, roundingStep,
                dayStartHour, nightStartHour,
                weekdayDayCoefficient, weekdayNightCoefficient,
                weekendDayCoefficient, weekendNightCoefficient,
                holidayDates, workdayDates);
        List<Equipment> equipment = equipmentRepository.findAllByOrderByName();
        return analysisService.analyze(request, file, equipment);
    }

    // ─── Серверный расчёт смен (SD-161) ───

    // POST /api/estimates/calculate — серверный расчёт смен и итогов (источник истины)
    @PostMapping("/calculate")
    public Map<String, Object> calculate(@RequestBody CalculateRequest req) {
        return shiftCalculationService.calculate(req);
    }

    // ─── Хранение смет и версий, связь смета↔проект (SD-165) ───

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
