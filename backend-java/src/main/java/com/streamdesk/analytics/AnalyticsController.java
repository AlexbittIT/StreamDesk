package com.streamdesk.analytics;

import com.streamdesk.analytics.dto.AnalyticsRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * REST-контроллер аналитики — перенос /api/analytics из backend/routes.ts.
 */
@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {

    private final AnalyticsService analyticsService;

    public AnalyticsController(AnalyticsService analyticsService) {
        this.analyticsService = analyticsService;
    }

    @GetMapping
    public List<AnalyticsEvent> list(@RequestParam(required = false) String entityType,
                                     @RequestParam(required = false) String startDate,
                                     @RequestParam(required = false) String endDate) {
        return analyticsService.search(entityType, startDate, endDate);
    }

    @PostMapping
    public AnalyticsEvent create(@RequestBody AnalyticsRequest req) {
        return analyticsService.create(req);
    }
}
