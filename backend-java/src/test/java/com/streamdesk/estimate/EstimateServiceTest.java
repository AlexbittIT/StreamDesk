package com.streamdesk.estimate;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.company.CompanyService;
import com.streamdesk.config.ApiException;
import com.streamdesk.estimate.dto.EstimateRequest;
import com.streamdesk.estimate.dto.VersionRequest;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Хранение смет и версий (SD-165): двусторонняя связь смета↔проект, фильтрация по
 * доступу, нумерация версий и отвязка смет при удалении проекта. Репозитории мокаются —
 * проверяется именно логика сервиса.
 */
class EstimateServiceTest {

    private final EstimateRepository estimateRepository = mock(EstimateRepository.class);
    private final EstimateVersionRepository versionRepository = mock(EstimateVersionRepository.class);
    private final CompanyService companyService = mock(CompanyService.class);

    private final EstimateService service =
            new EstimateService(estimateRepository, versionRepository, companyService);

    private static AuthenticatedUser user(String id, String role, List<String> perms) {
        return new AuthenticatedUser(id, id, id, null, null, role, null,
                perms, true, true, "company_member", false);
    }

    private static Estimate estimate(String id, String ownerId, String companyId) {
        Estimate e = new Estimate();
        e.setId(id);
        e.setTitle("Смета " + id);
        e.setOwnerId(ownerId);
        e.setCompanyId(companyId);
        return e;
    }

    @Test
    void createEstimate_setsOwnerAndFirstCompanyAndDefaults() {
        AuthenticatedUser u = user("u1", "user", List.of());
        when(companyService.getUserCompanyIds(u)).thenReturn(List.of("c1", "c2"));
        when(estimateRepository.save(any(Estimate.class))).thenAnswer(inv -> inv.getArgument(0));

        Estimate saved = service.createEstimate(new EstimateRequest(null, null, null, null, null), u);

        assertEquals("u1", saved.getOwnerId());
        assertEquals("c1", saved.getCompanyId(), "компания берётся первой из членств пользователя");
        assertEquals("draft", saved.getStatus());
        assertTrue(saved.getTitle() != null && !saved.getTitle().isBlank());
        assertNull(saved.getProjectId());
    }

    @Test
    void updateEstimate_emptyProjectId_unlinksFromProject() {
        Estimate existing = estimate("e1", "u1", "c1");
        existing.setProjectId("p1");
        when(estimateRepository.findById("e1")).thenReturn(Optional.of(existing));
        when(estimateRepository.save(any(Estimate.class))).thenAnswer(inv -> inv.getArgument(0));

        // projectId="" — явная отвязка от проекта.
        Estimate updated = service.updateEstimate("e1", new EstimateRequest(null, "", null, null, null));

        assertNull(updated.getProjectId(), "пустой projectId должен отвязать смету от проекта");
    }

    @Test
    void getEstimate_missing_throwsNotFound() {
        when(estimateRepository.findById("nope")).thenReturn(Optional.empty());
        ApiException ex = assertThrows(ApiException.class, () -> service.getEstimate("nope"));
        assertEquals(HttpStatus.NOT_FOUND, ex.getStatus());
    }

    @Test
    void listEstimates_memberSeesCompanyOwnAndCompanyless_notForeignCompany() {
        AuthenticatedUser u = user("u1", "user", List.of());
        when(companyService.getUserCompanyIds(u)).thenReturn(List.of("c1"));
        Estimate inCompany = estimate("e1", "stranger", "c1");
        Estimate foreign = estimate("e2", "stranger", "c2");
        Estimate companyless = estimate("e3", "stranger", null);
        Estimate ownElsewhere = estimate("e4", "u1", "c2");
        when(estimateRepository.findByOrderByCreatedAtDesc())
                .thenReturn(List.of(inCompany, foreign, companyless, ownElsewhere));

        List<Estimate> visible = service.listEstimates(u, null);

        assertTrue(visible.contains(inCompany), "смета своей компании видна");
        assertTrue(visible.contains(companyless), "смета без компании видна");
        assertTrue(visible.contains(ownElsewhere), "своя смета видна даже в чужой компании");
        assertTrue(!visible.contains(foreign), "чужая смета чужой компании не видна");
        assertEquals(3, visible.size());
    }

    @Test
    void listEstimates_byProjectId_usesProjectQuery() {
        AuthenticatedUser u = user("u1", "user", List.of());
        when(companyService.getUserCompanyIds(u)).thenReturn(List.of("c1"));
        Estimate e = estimate("e1", "u1", "c1");
        when(estimateRepository.findByProjectIdOrderByCreatedAtDesc("p1")).thenReturn(List.of(e));

        List<Estimate> visible = service.listEstimates(u, "p1");

        assertEquals(1, visible.size());
        verify(estimateRepository).findByProjectIdOrderByCreatedAtDesc("p1");
    }

    @Test
    void createVersion_incrementsVersionNoAndSnapshotsData() {
        AuthenticatedUser u = user("u1", "user", List.of());
        Estimate e = estimate("e1", "u1", "c1");
        when(estimateRepository.findById("e1")).thenReturn(Optional.of(e));
        when(versionRepository.countByEstimateId("e1")).thenReturn(2L);
        when(versionRepository.save(any(EstimateVersion.class))).thenAnswer(inv -> inv.getArgument(0));
        when(estimateRepository.save(any(Estimate.class))).thenAnswer(inv -> inv.getArgument(0));

        Map<String, Object> data = Map.of(
                "totals", Map.of("subtotal", 500),
                "items", List.of(Map.of("name", "Камера")));
        EstimateVersion v = service.createVersion("e1", new VersionRequest("v3", null, null, data), u);

        assertEquals(3, v.getVersionNo(), "следующая версия = count + 1");
        assertEquals(500.0, v.getSubtotal(), 1e-9, "subtotal вычислен из data.totals");
        assertEquals(1, v.getItemsCount(), "itemsCount вычислен из data.items");
        assertEquals("u1", v.getCreatedBy());
        // Снимок становится актуальным состоянием сметы.
        assertEquals(data, e.getData());
    }

    @Test
    void deleteEstimate_removesVersionsThenEstimate() {
        when(estimateRepository.existsById("e1")).thenReturn(true);

        service.deleteEstimate("e1");

        verify(versionRepository).deleteByEstimateId("e1");
        verify(estimateRepository).deleteById("e1");
    }

    @Test
    void clearProjectReferences_unlinksAllProjectEstimates() {
        Estimate e1 = estimate("e1", "u1", "c1");
        e1.setProjectId("p1");
        Estimate e2 = estimate("e2", "u2", "c1");
        e2.setProjectId("p1");
        when(estimateRepository.findByProjectIdOrderByCreatedAtDesc("p1")).thenReturn(List.of(e1, e2));
        when(estimateRepository.save(any(Estimate.class))).thenAnswer(inv -> inv.getArgument(0));

        service.clearProjectReferences("p1");

        assertNull(e1.getProjectId());
        assertNull(e2.getProjectId());
        verify(estimateRepository, times(2)).save(any(Estimate.class));
    }

    @Test
    void listVersions_missingEstimate_throwsNotFound() {
        when(estimateRepository.findById("nope")).thenReturn(Optional.empty());
        ApiException ex = assertThrows(ApiException.class, () -> service.listVersions("nope"));
        assertEquals(HttpStatus.NOT_FOUND, ex.getStatus());
        verify(versionRepository, times(0)).findByEstimateIdOrderByVersionNoDesc(eq("nope"));
    }
}
