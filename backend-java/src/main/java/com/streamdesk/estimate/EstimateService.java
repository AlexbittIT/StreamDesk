package com.streamdesk.estimate;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.company.CompanyService;
import com.streamdesk.config.ApiException;
import com.streamdesk.estimate.dto.EstimateRequest;
import com.streamdesk.estimate.dto.VersionRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Логика смет и их версий. Обеспечивает двустороннюю связь смета↔проект
 * (поле projectId) и историю версий в БД (раньше — localStorage фронта).
 */
@Service
public class EstimateService {

    private final EstimateRepository estimateRepository;
    private final EstimateVersionRepository versionRepository;
    private final CompanyService companyService;

    public EstimateService(EstimateRepository estimateRepository,
                           EstimateVersionRepository versionRepository,
                           CompanyService companyService) {
        this.estimateRepository = estimateRepository;
        this.versionRepository = versionRepository;
        this.companyService = companyService;
    }

    /** GET /api/estimates (опц. ?projectId=) — с фильтром по доступу пользователя. */
    public List<Estimate> listEstimates(AuthenticatedUser user, String projectId) {
        if (user == null || user.id() == null) {
            return List.of();
        }
        List<Estimate> estimates = isBlank(projectId)
                ? estimateRepository.findByOrderByCreatedAtDesc()
                : estimateRepository.findByProjectIdOrderByCreatedAtDesc(projectId);

        List<String> permissions = user.permissions() != null ? user.permissions() : List.of();
        if ("admin".equals(user.role()) && permissions.contains("platform:admin")) {
            return estimates;
        }
        Set<String> companyIds = new HashSet<>(companyService.getUserCompanyIds(user));
        String uid = user.id();
        return estimates.stream().filter(e -> {
            boolean inCompany = e.getCompanyId() != null && companyIds.contains(e.getCompanyId());
            boolean noCompany = e.getCompanyId() == null;
            return inCompany || noCompany || uid.equals(e.getOwnerId());
        }).toList();
    }

    public Estimate getEstimate(String id) {
        return estimateRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Смета не найдена"));
    }

    @Transactional
    public Estimate createEstimate(EstimateRequest req, AuthenticatedUser user) {
        Estimate estimate = new Estimate();
        estimate.setTitle(!isBlank(req.title()) ? req.title().trim() : defaultTitle());
        estimate.setProjectId(blankToNull(req.projectId()));
        estimate.setOwnerId(user != null ? user.id() : null);

        String companyId = blankToNull(req.companyId());
        if (companyId == null && user != null) {
            List<String> ids = companyService.getUserCompanyIds(user);
            if (!ids.isEmpty()) {
                companyId = ids.get(0);
            }
        }
        estimate.setCompanyId(companyId);

        if (!isBlank(req.status())) {
            estimate.setStatus(req.status());
        }
        if (req.data() != null) {
            estimate.setData(req.data());
        }
        return estimateRepository.save(estimate);
    }

    @Transactional
    public Estimate updateEstimate(String id, EstimateRequest req) {
        Estimate estimate = getEstimate(id);
        if (req.title() != null && !req.title().isBlank()) {
            estimate.setTitle(req.title().trim());
        }
        // projectId присылаем явно (в т.ч. пустую строку — для отвязки от проекта).
        if (req.projectId() != null) {
            estimate.setProjectId(blankToNull(req.projectId()));
        }
        if (req.companyId() != null) {
            estimate.setCompanyId(blankToNull(req.companyId()));
        }
        if (req.status() != null && !req.status().isBlank()) {
            estimate.setStatus(req.status());
        }
        if (req.data() != null) {
            estimate.setData(req.data());
        }
        estimate.setUpdatedAt(Instant.now());
        return estimateRepository.save(estimate);
    }

    @Transactional
    public void deleteEstimate(String id) {
        versionRepository.deleteByEstimateId(id);
        if (estimateRepository.existsById(id)) {
            estimateRepository.deleteById(id);
        }
    }

    /** Отвязать все сметы от проекта (вызывается при удалении проекта). */
    @Transactional
    public void clearProjectReferences(String projectId) {
        for (Estimate e : estimateRepository.findByProjectIdOrderByCreatedAtDesc(projectId)) {
            e.setProjectId(null);
            estimateRepository.save(e);
        }
    }

    // --- версии ---

    public List<EstimateVersion> listVersions(String estimateId) {
        getEstimate(estimateId); // 404, если сметы нет
        return versionRepository.findByEstimateIdOrderByVersionNoDesc(estimateId);
    }

    public EstimateVersion getVersion(String versionId) {
        return versionRepository.findById(versionId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Версия сметы не найдена"));
    }

    /** POST /api/estimates/{id}/versions — снимок текущего расчёта как новая версия. */
    @Transactional
    public EstimateVersion createVersion(String estimateId, VersionRequest req, AuthenticatedUser user) {
        Estimate estimate = getEstimate(estimateId);

        EstimateVersion version = new EstimateVersion();
        version.setEstimateId(estimateId);
        version.setVersionNo((int) versionRepository.countByEstimateId(estimateId) + 1);
        version.setTitle(!isBlank(req.title()) ? req.title().trim() : estimate.getTitle());
        Map<String, Object> data = req.data() != null ? req.data() : new LinkedHashMap<>();
        version.setData(data);
        version.setSubtotal(req.subtotal() != null ? req.subtotal() : subtotalFromData(data));
        version.setItemsCount(req.itemsCount() != null ? req.itemsCount() : itemsCountFromData(data));
        version.setCreatedBy(user != null ? user.id() : null);
        EstimateVersion saved = versionRepository.save(version);

        // Снимок становится актуальным состоянием сметы.
        estimate.setData(data);
        estimate.setUpdatedAt(Instant.now());
        if (!isBlank(req.title())) {
            estimate.setTitle(req.title().trim());
        }
        estimateRepository.save(estimate);
        return saved;
    }

    @Transactional
    public void deleteVersion(String versionId) {
        if (versionRepository.existsById(versionId)) {
            versionRepository.deleteById(versionId);
        }
    }

    // --- helpers ---

    @SuppressWarnings("unchecked")
    private double subtotalFromData(Map<String, Object> data) {
        Object totals = data.get("totals");
        if (totals instanceof Map<?, ?> map) {
            Object subtotal = ((Map<String, Object>) map).get("subtotal");
            if (subtotal instanceof Number n) {
                return n.doubleValue();
            }
        }
        return 0.0;
    }

    private int itemsCountFromData(Map<String, Object> data) {
        Object items = data.get("items");
        if (items instanceof List<?> list) {
            return list.size();
        }
        return 0;
    }

    private String defaultTitle() {
        return "Смета " + Instant.now().toString().substring(0, 10);
    }

    private static String blankToNull(String s) {
        return isBlank(s) ? null : s.trim();
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
