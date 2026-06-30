package com.streamdesk.estimate;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.config.ApiException;
import com.streamdesk.estimate.dto.EstimateRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Логика сохранённых смет: список / сохранение / удаление.
 * Ответ собираем в форме, которую ждёт фронт (id, title, savedAt, estimate, deliveryDistanceKm).
 */
@Service
public class EstimateService {

    private final EstimateRepository repository;

    public EstimateService(EstimateRepository repository) {
        this.repository = repository;
    }

    public List<Map<String, Object>> list() {
        return repository.findByOrderByCreatedAtDesc().stream().map(this::toResponse).toList();
    }

    @Transactional
    public Map<String, Object> create(EstimateRequest req, AuthenticatedUser user, String companyId) {
        if (req == null || req.estimate() == null || req.estimate().isEmpty()) {
            throw ApiException.badRequest("Данные сметы обязательны");
        }

        Estimate estimate = new Estimate();
        estimate.setTitle(resolveTitle(req));
        estimate.setData(req.estimate());
        estimate.setDeliveryDistanceKm(req.deliveryDistanceKm() != null ? req.deliveryDistanceKm() : "0");
        estimate.setVisibility(isBlank(req.visibility()) ? "company" : req.visibility());
        estimate.setCompanyId(companyId);
        if (user != null) {
            estimate.setCreatedBy(user.id());
            estimate.setCreatedByName(user.name());
        }
        return toResponse(repository.save(estimate));
    }

    @Transactional
    public void delete(String id) {
        if (!repository.existsById(id)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Смета не найдена");
        }
        repository.deleteById(id);
    }

    private String resolveTitle(EstimateRequest req) {
        if (!isBlank(req.title())) {
            return req.title();
        }
        Object titleFromData = req.estimate().get("title");
        return titleFromData != null && !String.valueOf(titleFromData).isBlank()
                ? String.valueOf(titleFromData)
                : "Смета";
    }

    private Map<String, Object> toResponse(Estimate e) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", e.getId());
        map.put("title", e.getTitle());
        map.put("savedAt", e.getCreatedAt());
        map.put("estimate", e.getData());
        map.put("deliveryDistanceKm", e.getDeliveryDistanceKm());
        map.put("visibility", e.getVisibility());
        map.put("createdBy", e.getCreatedBy());
        map.put("createdByName", e.getCreatedByName());
        return map;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
