package com.streamdesk.e2e;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.company.CompanyMember;
import com.streamdesk.company.CompanyMemberRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.List;

import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * E2E загрузки подложки плана (docs/maps-api.md §4, POST /plan, VM-04): валидная PNG сохраняется
 * в {@code /uploads/maps/} с правильными размерами; не-картинка → 415; загрузка в карту чужой
 * компании → 404 (изоляция, §7).
 */
@Transactional
class MapPlanUploadE2ETest extends AbstractE2ETest {

    @Autowired
    private CompanyMemberRepository companyMemberRepository;

    @Test
    void uploadPng_savesUrlAndDimensions() throws Exception {
        AuthenticatedUser owner = user("plan-owner", "user", List.of());
        companyMemberRepository.save(member("plan-owner", "company-plan"));
        String mapId = createMap(owner);

        MockMultipartFile file = new MockMultipartFile(
                "file", "plan.png", "image/png", pngBytes(120, 80));

        MvcResult res = mockMvc.perform(multipart("/api/maps/{m}/plan", mapId).file(file).with(as(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.imageUrl", startsWith("/uploads/maps/")))
                .andExpect(jsonPath("$.imageWidth", is(120)))
                .andExpect(jsonPath("$.imageHeight", is(80)))
                .andReturn();
        String imageUrl = objectMapper.readTree(res.getResponse().getContentAsString()).get("imageUrl").asText();

        // Размеры и ссылка действительно сохранены на карте (читаем повторным GET).
        mockMvc.perform(get("/api/maps/{m}", mapId).with(as(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.imageUrl", is(imageUrl)))
                .andExpect(jsonPath("$.imageWidth", is(120)))
                .andExpect(jsonPath("$.imageHeight", is(80)));
    }

    @Test
    void uploadNonImage_returns415() throws Exception {
        AuthenticatedUser owner = user("plan-owner-2", "user", List.of());
        companyMemberRepository.save(member("plan-owner-2", "company-plan-2"));
        String mapId = createMap(owner);

        MockMultipartFile file = new MockMultipartFile(
                "file", "notes.txt", "text/plain", "не картинка".getBytes());

        mockMvc.perform(multipart("/api/maps/{m}/plan", mapId).file(file).with(as(owner)))
                .andExpect(status().isUnsupportedMediaType());
    }

    @Test
    void uploadToOtherCompanyMap_returns404() throws Exception {
        AuthenticatedUser owner = user("plan-a", "user", List.of());
        AuthenticatedUser outsider = user("plan-b", "user", List.of());
        companyMemberRepository.save(member("plan-a", "company-a"));
        companyMemberRepository.save(member("plan-b", "company-b"));
        String mapId = createMap(owner);

        MockMultipartFile file = new MockMultipartFile(
                "file", "plan.png", "image/png", pngBytes(64, 64));

        mockMvc.perform(multipart("/api/maps/{m}/plan", mapId).file(file).with(as(outsider)))
                .andExpect(status().isNotFound());
    }

    // --- helpers ---

    private String createMap(AuthenticatedUser u) throws Exception {
        String companyId = companyMemberRepository.findByUserId(u.id()).get(0).getCompanyId();
        MvcResult res = mockMvc.perform(post("/api/maps").with(as(u))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"План\",\"companyId\":\"" + companyId + "\"}"))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(res.getResponse().getContentAsString()).get("id").asText();
    }

    /** Валидный PNG заданного размера в памяти. */
    private static byte[] pngBytes(int width, int height) throws Exception {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, "png", out);
        return out.toByteArray();
    }

    private CompanyMember member(String userId, String companyId) {
        CompanyMember m = new CompanyMember();
        m.setUserId(userId);
        m.setCompanyId(companyId);
        m.setStatus("active");
        return m;
    }
}
