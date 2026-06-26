package com.streamdesk.analytics;

import com.streamdesk.analytics.dto.AnalyticsRequest;
import com.streamdesk.config.ApiException;
import com.streamdesk.config.TimeParse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;

/**
 * Логика аналитики — перенос /api/analytics из backend/routes.ts.
 */
@Service
public class AnalyticsService {

    private final AnalyticsEventRepository repository;

    public AnalyticsService(AnalyticsEventRepository repository) {
        this.repository = repository;
    }

    public List<AnalyticsEvent> search(String entityType, String startDate, String endDate) {
        Instant start = parseOrNull(startDate);
        Instant end = parseOrNull(endDate);

        List<AnalyticsEvent> events = (entityType != null && !entityType.isBlank())
                ? repository.findByEntityTypeOrderByTimestampDesc(entityType)
                : repository.findAllByOrderByTimestampDesc();

        return events.stream()
                .filter(e -> start == null || e.getTimestamp() == null || !e.getTimestamp().isBefore(start))
                .filter(e -> end == null || e.getTimestamp() == null || !e.getTimestamp().isAfter(end))
                .toList();
    }

    @Transactional
    public AnalyticsEvent create(AnalyticsRequest req) {
        if (isBlank(req.eventType()) || isBlank(req.entityType()) || req.data() == null) {
            throw ApiException.badRequest("Invalid analytics data");
        }
        AnalyticsEvent event = new AnalyticsEvent();
        event.setEventType(req.eventType());
        event.setEntityId(req.entityId());
        event.setEntityType(req.entityType());
        event.setData(req.data() != null ? req.data() : new HashMap<>());
        return repository.save(event);
    }

    private Instant parseOrNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return TimeParse.toInstant(value);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
