package com.streamdesk.e2e;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.company.CompanyMember;
import com.streamdesk.company.CompanyMemberRepository;
import com.streamdesk.maps.MapRepository;
import com.streamdesk.maps.SiteMap;
import com.streamdesk.maps.Zone;
import com.streamdesk.maps.ZonePoint;
import com.streamdesk.maps.ZoneRepository;
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

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Transactional
class MapsAccessAndPlanE2ETest extends AbstractE2ETest {

    private static final String COMPANY = "company-maps-access";

    @Autowired
    private CompanyMemberRepository companyMemberRepository;

    @Autowired
    private MapRepository mapRepository;

    @Autowired
    private ZoneRepository zoneRepository;

    @Test
    void planUpload_setsImageUrlAndDimensions_andRejectsNonImage() throws Exception {
        AuthenticatedUser manager = user("maps-manager", "manager", List.of());
        companyMemberRepository.save(member("maps-manager", COMPANY));
        String mapId = createMap(manager, "План с подложкой");

        MockMultipartFile plan = new MockMultipartFile(
                "file", "plan.png", "image/png", pngBytes(7, 5));
        mockMvc.perform(multipart("/api/maps/{m}/plan", mapId).file(plan).with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.imageUrl", containsString("/uploads/maps/map-" + mapId)))
                .andExpect(jsonPath("$.imageWidth", is(7)))
                .andExpect(jsonPath("$.imageHeight", is(5)));

        MockMultipartFile text = new MockMultipartFile(
                "file", "plan.txt", "text/plain", "not an image".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        mockMvc.perform(multipart("/api/maps/{m}/plan", mapId).file(text).with(as(manager)))
                .andExpect(status().isUnsupportedMediaType());
    }

    @Test
    void employeeCannotEditMapsOrZones_butCanChangeStatusForVisibleZone() throws Exception {
        AuthenticatedUser employee = user("maps-employee", "employee", List.of());
        companyMemberRepository.save(member("maps-employee", COMPANY));

        SiteMap map = new SiteMap();
        map.setCompanyId(COMPANY);
        map.setName("Карта техника");
        map.setCreatedBy("maps-employee");
        map = mapRepository.save(map);

        Zone zone = new Zone();
        zone.setMapId(map.getId());
        zone.setCompanyId(COMPANY);
        zone.setName("Зона техника");
        zone.setPoints(List.of(new ZonePoint(0, 0), new ZonePoint(10, 0), new ZonePoint(10, 10)));
        zone = zoneRepository.save(zone);

        mockMvc.perform(post("/api/maps").with(as(employee))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Нельзя\",\"companyId\":\"" + COMPANY + "\"}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(put("/api/maps/{m}", map.getId()).with(as(employee))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Новое\"}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/maps/{m}/zones", map.getId()).with(as(employee))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Новая зона\",\"points\":[{\"x\":0,\"y\":0},{\"x\":5,\"y\":0},{\"x\":5,\"y\":5}]}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(put("/api/maps/{m}/zones/{z}", map.getId(), zone.getId()).with(as(employee))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Новое имя\",\"version\":1}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(delete("/api/maps/{m}/zones/{z}", map.getId(), zone.getId()).with(as(employee)))
                .andExpect(status().isForbidden());

        mockMvc.perform(patch("/api/maps/{m}/zones/{z}/status", map.getId(), zone.getId()).with(as(employee))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"in_progress\",\"version\":1}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status", is("in_progress")))
                .andExpect(jsonPath("$.version", is(2)));
    }

    @Test
    void dataScopeOwnLimitsMapsByCreator_andManagerAllSeesCompanyMaps() throws Exception {
        AuthenticatedUser employee = user("scope-employee", "employee", List.of());
        AuthenticatedUser manager = user("scope-manager", "manager", List.of());
        companyMemberRepository.save(member("scope-employee", COMPANY));
        companyMemberRepository.save(member("scope-manager", COMPANY));

        SiteMap own = new SiteMap();
        own.setCompanyId(COMPANY);
        own.setName("Своя площадка");
        own.setCreatedBy("scope-employee");
        own = mapRepository.save(own);

        SiteMap other = new SiteMap();
        other.setCompanyId(COMPANY);
        other.setName("Чужая площадка");
        other.setCreatedBy("scope-manager");
        other = mapRepository.save(other);

        mockMvc.perform(get("/api/maps").with(as(employee)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].id", is(own.getId())));

        mockMvc.perform(get("/api/maps/{m}", other.getId()).with(as(employee)))
                .andExpect(status().isNotFound());

        mockMvc.perform(get("/api/maps").with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)));
    }

    private String createMap(AuthenticatedUser user, String name) throws Exception {
        MvcResult res = mockMvc.perform(post("/api/maps").with(as(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\",\"companyId\":\"" + COMPANY + "\"}"))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(res.getResponse().getContentAsString()).get("id").asText();
    }

    private static CompanyMember member(String userId, String companyId) {
        CompanyMember member = new CompanyMember();
        member.setUserId(userId);
        member.setCompanyId(companyId);
        member.setStatus("active");
        return member;
    }

    private static byte[] pngBytes(int width, int height) throws Exception {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, "png", out);
        return out.toByteArray();
    }
}
