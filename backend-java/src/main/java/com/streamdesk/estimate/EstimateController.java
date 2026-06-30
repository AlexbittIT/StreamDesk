package com.streamdesk.estimate;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.company.CompanyService;
import com.streamdesk.config.ApiException;
import com.streamdesk.equipment.Equipment;
import com.streamdesk.equipment.EquipmentRepository;
import com.streamdesk.estimate.dto.EstimateAnalyzeRequest;
import com.streamdesk.estimate.dto.EstimateResult;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/**
 * REST-контроллер сборки смет — перенос /api/estimates/analyze из backend/routes.ts.
 *
 * Принимает multipart/form-data: title, text, requireAi, eventType, параметры
 * смен и файл ТЗ (file). Требует доступ к рабочему пространству (hasWorkspaceAccess).
 */
@RestController
@RequestMapping("/api/estimates")
public class EstimateController {

    private final EstimateService estimateService;
    private final EquipmentRepository equipmentRepository;
    private final CompanyService companyService;

    public EstimateController(EstimateService estimateService,
                              EquipmentRepository equipmentRepository,
                              CompanyService companyService) {
        this.estimateService = estimateService;
        this.equipmentRepository = equipmentRepository;
        this.companyService = companyService;
    }

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
        return estimateService.analyze(request, file, equipment);
    }
}
