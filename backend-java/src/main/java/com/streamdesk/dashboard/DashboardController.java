package com.streamdesk.dashboard;

import com.streamdesk.auth.AuthenticatedUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * REST-контроллер дашбордов — перенос /api/dashboard/stats и /api/manager/stats из backend/routes.ts.
 */
@RestController
public class DashboardController {

    private final DashboardService dashboardService;

    public DashboardController(DashboardService dashboardService) {
        this.dashboardService = dashboardService;
    }

    @GetMapping("/api/dashboard/stats")
    public Map<String, Object> dashboardStats(@AuthenticationPrincipal AuthenticatedUser user) {
        return dashboardService.dashboardStats(user);
    }

    @GetMapping("/api/manager/stats")
    public Map<String, Object> managerStats() {
        return dashboardService.managerStats();
    }
}
