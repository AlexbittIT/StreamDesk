package com.streamdesk.e2e;

import com.fasterxml.jackson.databind.JsonNode;
import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.company.CompanyMember;
import com.streamdesk.company.CompanyMemberRepository;
import com.streamdesk.notification.Notification;
import com.streamdesk.notification.NotificationRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * E2E полного потока «статусы + история + ответственный» через HTTP-слой (docs/maps-api.md §3, §6).
 *
 * Проверяет разом критерии приёмки: дефолтный статус, запись истории на каждый переход,
 * отклонение недопустимого перехода и рассинхрона version с понятной причиной (409),
 * назначение ответственного только из сотрудников компании и алерт админам при «Проблеме».
 */
@Transactional
class MapsZoneFlowE2ETest extends AbstractE2ETest {

    private static final String COMPANY = "company-maps-flow";

    @Autowired
    private CompanyMemberRepository companyMemberRepository;

    @Autowired
    private NotificationRepository notificationRepository;

    @Test
    void statusHistoryAssigneeAndAlert_fullFlow() throws Exception {
        // Участники компании: менеджер (создаёт), исполнитель (может быть ответственным), админ (получает алерт).
        AuthenticatedUser manager = user("manager-flow", "manager", List.of());
        companyMemberRepository.save(member("manager-flow", "member"));
        companyMemberRepository.save(member("worker-flow", "member"));
        companyMemberRepository.save(member("admin-flow", "owner"));

        // Карта.
        String mapId = createMap(manager, "Главный зал");

        // Зона по умолчанию «Не начато», version = 1.
        String zoneId = createZone(manager, mapId, "Сцена");
        mockMvc.perform(get("/api/maps/{m}/zones/{z}", mapId, zoneId).with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status", is("not_started")))
                .andExpect(jsonPath("$.version", is(1)))
                .andExpect(jsonPath("$.points", hasSize(3)));

        // Валидный переход not_started → in_progress пишет историю; version растёт до 2.
        patchStatus(manager, mapId, zoneId, "in_progress", 1)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status", is("in_progress")))
                .andExpect(jsonPath("$.version", is(2)));

        mockMvc.perform(get("/api/maps/{m}/zones/{z}/status-history", mapId, zoneId).with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].fromStatus", is("not_started")))
                .andExpect(jsonPath("$[0].toStatus", is("in_progress")))
                .andExpect(jsonPath("$[0].changedBy", is("manager-flow")));

        // Недопустимый переход in_progress → verified → 409 с понятной причиной.
        patchStatus(manager, mapId, zoneId, "verified", 2)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message", org.hamcrest.Matchers.containsString("Недопустимый переход")));

        // Рассинхрон version → 409.
        patchStatus(manager, mapId, zoneId, "done", 99)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message", org.hamcrest.Matchers.containsString("version")));

        // История не пополнилась отклонёнными переходами.
        mockMvc.perform(get("/api/maps/{m}/zones/{z}/status-history", mapId, zoneId).with(as(manager)))
                .andExpect(jsonPath("$", hasSize(1)));

        // Назначение ответственного из своей компании (version растёт до 3).
        assign(manager, mapId, zoneId, "worker-flow")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assigneeId", is("worker-flow")))
                .andExpect(jsonPath("$.assigneeType", is("user")))
                .andExpect(jsonPath("$.version", is(3)));

        // Назначение постороннего (не сотрудник компании) отклоняется.
        assign(manager, mapId, zoneId, "outsider-x")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", org.hamcrest.Matchers.containsString("сотрудником")));

        // Переход в «Проблему» разрешён и триггерит алерт админам компании.
        patchStatus(manager, mapId, zoneId, "problem", 3)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status", is("problem")))
                .andExpect(jsonPath("$.version", is(4)));

        List<Notification> adminNotes = notificationRepository.findByUserIdOrderByCreatedAtDesc("admin-flow");
        org.assertj.core.api.Assertions.assertThat(adminNotes)
                .anyMatch(n -> "Проблема на площадке".equals(n.getTitle()));
        // Обычный сотрудник (не админ) алерт НЕ получает.
        org.assertj.core.api.Assertions.assertThat(
                        notificationRepository.findByUserIdOrderByCreatedAtDesc("worker-flow"))
                .noneMatch(n -> "Проблема на площадке".equals(n.getTitle()));
    }

    // --- helpers ---

    private String createMap(AuthenticatedUser u, String name) throws Exception {
        MvcResult res = mockMvc.perform(post("/api/maps").with(as(u))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\",\"companyId\":\"" + COMPANY + "\"}"))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(res.getResponse().getContentAsString()).get("id").asText();
    }

    private String createZone(AuthenticatedUser u, String mapId, String name) throws Exception {
        String body = "{\"name\":\"" + name + "\",\"points\":["
                + "{\"x\":0,\"y\":0},{\"x\":10,\"y\":0},{\"x\":10,\"y\":10}]}";
        MvcResult res = mockMvc.perform(post("/api/maps/{m}/zones", mapId).with(as(u))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode node = objectMapper.readTree(res.getResponse().getContentAsString());
        return node.get("id").asText();
    }

    private org.springframework.test.web.servlet.ResultActions patchStatus(
            AuthenticatedUser u, String mapId, String zoneId, String toStatus, int version) throws Exception {
        return mockMvc.perform(patch("/api/maps/{m}/zones/{z}/status", mapId, zoneId).with(as(u))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"" + toStatus + "\",\"version\":" + version + "}"));
    }

    private org.springframework.test.web.servlet.ResultActions assign(
            AuthenticatedUser u, String mapId, String zoneId, String assigneeId) throws Exception {
        return mockMvc.perform(put("/api/maps/{m}/zones/{z}/assignee", mapId, zoneId).with(as(u))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"assigneeId\":\"" + assigneeId + "\",\"assigneeType\":\"user\"}"));
    }

    private CompanyMember member(String userId, String role) {
        CompanyMember m = new CompanyMember();
        m.setUserId(userId);
        m.setCompanyId(COMPANY);
        m.setRole(role);
        m.setStatus("active");
        return m;
    }
}
