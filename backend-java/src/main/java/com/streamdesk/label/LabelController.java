package com.streamdesk.label;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.company.CompanyService;
import com.streamdesk.config.ApiException;
import com.streamdesk.label.dto.BitmapsRequest;
import com.streamdesk.label.dto.PrintRequest;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * REST-контроллер печати этикеток — перенос /api/equipment/labels/* из backend/routes.ts.
 * Требует доступ к складу (рабочему пространству).
 */
@RestController
@RequestMapping("/api/equipment/labels")
public class LabelController {

    private final LabelPrinterService labelService;
    private final CompanyService companyService;

    public LabelController(LabelPrinterService labelService, CompanyService companyService) {
        this.labelService = labelService;
        this.companyService = companyService;
    }

    @PostMapping("/print")
    public Map<String, Object> print(@RequestBody PrintRequest req, @AuthenticationPrincipal AuthenticatedUser user) {
        requireWorkspace(user);
        return labelService.printLabels(req != null ? req.equipmentIds() : null);
    }

    @PostMapping("/print-bitmaps")
    public Map<String, Object> printBitmaps(@RequestBody BitmapsRequest req,
                                            @AuthenticationPrincipal AuthenticatedUser user) {
        requireWorkspace(user);
        return labelService.printBitmaps(req != null ? req.labels() : null);
    }

    @PostMapping("/calibrate")
    public Map<String, Object> calibrate(@AuthenticationPrincipal AuthenticatedUser user) {
        requireWorkspace(user);
        return labelService.calibrate();
    }

    private void requireWorkspace(AuthenticatedUser user) {
        if (!companyService.hasWorkspaceAccess(user)) {
            throw ApiException.forbidden("Нет доступа к складу");
        }
    }
}
