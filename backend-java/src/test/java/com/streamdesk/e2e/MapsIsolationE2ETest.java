package com.streamdesk.e2e;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.company.CompanyMember;
import com.streamdesk.company.CompanyMemberRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * E2E критического инварианта изоляции компаний (docs/maps-api.md §7): пользователь компании B
 * физически не может прочитать/изменить карту и зоны компании A — ответ 404 (существование не раскрываем).
 */
@Transactional
class MapsIsolationE2ETest extends AbstractE2ETest {

    @Autowired
    private CompanyMemberRepository companyMemberRepository;

    @Test
    void companyB_cannotAccessCompanyA_zones() throws Exception {
        AuthenticatedUser userA = user("user-a", "manager", List.of());
        AuthenticatedUser userB = user("user-b", "user", List.of());
        companyMemberRepository.save(member("user-a", "company-a"));
        companyMemberRepository.save(member("user-b", "company-b"));

        // Компания A создаёт карту и зону.
        MvcResult mapRes = mockMvc.perform(post("/api/maps").with(as(userA))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"План A\",\"companyId\":\"company-a\"}"))
                .andExpect(status().isCreated()).andReturn();
        String mapId = objectMapper.readTree(mapRes.getResponse().getContentAsString()).get("id").asText();

        MvcResult zoneRes = mockMvc.perform(post("/api/maps/{m}/zones", mapId).with(as(userA))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Зона A\",\"points\":[{\"x\":0,\"y\":0},{\"x\":5,\"y\":0},{\"x\":5,\"y\":5}]}"))
                .andExpect(status().isCreated()).andReturn();
        String zoneId = objectMapper.readTree(zoneRes.getResponse().getContentAsString()).get("id").asText();

        // Список карт B не содержит карту A.
        mockMvc.perform(get("/api/maps").with(as(userB)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));

        // Любой доступ B к сущностям A → 404.
        mockMvc.perform(get("/api/maps/{m}", mapId).with(as(userB)))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/maps/{m}/zones", mapId).with(as(userB)))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/maps/{m}/zones/{z}", mapId, zoneId).with(as(userB)))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/maps/{m}/zones/{z}/status-history", mapId, zoneId).with(as(userB)))
                .andExpect(status().isNotFound());
        mockMvc.perform(patch("/api/maps/{m}/zones/{z}/status", mapId, zoneId).with(as(userB))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"in_progress\",\"version\":1}"))
                .andExpect(status().isNotFound());
        mockMvc.perform(put("/api/maps/{m}/zones/{z}/assignee", mapId, zoneId).with(as(userB))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assigneeId\":\"user-b\",\"assigneeType\":\"user\"}"))
                .andExpect(status().isNotFound());

        // Зона A не изменилась (по-прежнему not_started, version 1) — читаем как A.
        mockMvc.perform(get("/api/maps/{m}/zones/{z}", mapId, zoneId).with(as(userA)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status", org.hamcrest.Matchers.is("not_started")))
                .andExpect(jsonPath("$.version", org.hamcrest.Matchers.is(1)));
    }

    private CompanyMember member(String userId, String companyId) {
        CompanyMember m = new CompanyMember();
        m.setUserId(userId);
        m.setCompanyId(companyId);
        m.setStatus("active");
        return m;
    }
}
