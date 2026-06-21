package com.streamdesk.agent;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.company.CompanyService;
import com.streamdesk.config.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;

/**
 * REST-контроллер агентов — перенос /api/agents/* и /api/companies/{id}/agent-download.
 */
@RestController
public class AgentController {

    private final AgentService agentService;
    private final CompanyService companyService;

    public AgentController(AgentService agentService, CompanyService companyService) {
        this.agentService = agentService;
        this.companyService = companyService;
    }

    // GET /api/agents/script/windows — PowerShell-скрипт агента
    @GetMapping(value = "/api/agents/script/windows", produces = "text/plain;charset=utf-8")
    public ResponseEntity<String> script() {
        for (Path candidate : new Path[]{
                Paths.get(System.getProperty("user.dir"), "scripts", "streamdesk-agent.ps1"),
                Paths.get(System.getProperty("user.dir"), "..", "scripts", "streamdesk-agent.ps1")}) {
            if (Files.exists(candidate)) {
                try {
                    return ResponseEntity.ok()
                            .header(HttpHeaders.CACHE_CONTROL, "no-store")
                            .body(Files.readString(candidate, StandardCharsets.UTF_8));
                } catch (IOException ignored) {
                    // пробуем следующий путь
                }
            }
        }
        return ResponseEntity.status(500).body("StreamDesk agent script is not available");
    }

    // POST /api/agents/heartbeat — отчёт агента
    @PostMapping("/api/agents/heartbeat")
    public Map<String, Object> heartbeat(@RequestBody(required = false) Map<String, Object> payload) {
        return agentService.heartbeat(payload != null ? payload : Map.of());
    }

    // GET /api/agents/metrics — история метрик системы
    @GetMapping("/api/agents/metrics")
    public Map<String, Object> metrics(@RequestParam(required = false) String systemId,
                                       @RequestParam(required = false) Integer limit,
                                       @RequestParam(required = false) Double hours,
                                       @AuthenticationPrincipal AuthenticatedUser user) {
        return agentService.metrics(systemId, limit, hours, companyService.getUserCompanyIds(user));
    }

    // GET /api/companies/{companyId}/agent-download — .bat-инсталлятор агента
    @GetMapping("/api/companies/{companyId}/agent-download")
    public ResponseEntity<String> agentDownload(@PathVariable String companyId,
                                                @RequestParam(required = false, defaultValue = "windows") String os,
                                                @RequestParam(required = false, defaultValue = "computer") String type,
                                                @RequestParam(required = false, defaultValue = "1") String autostart,
                                                @AuthenticationPrincipal AuthenticatedUser user,
                                                HttpServletRequest request) {
        if (!companyService.canManageCompany(user, companyId)) {
            throw ApiException.forbidden("Нет прав на скачивание агента");
        }
        boolean auto = !"0".equals(autostart);
        AgentService.InstallerFile file = agentService.buildInstaller(companyId, os, type, auto, serverUrl(request));

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, "application/x-msdownload; charset=utf-8")
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + file.fileName() + "\"")
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .contentType(MediaType.parseMediaType("application/x-msdownload"))
                .body(file.content());
    }

    private String serverUrl(HttpServletRequest request) {
        String forwardedProto = request.getHeader("X-Forwarded-Proto");
        String protocol = forwardedProto != null && !forwardedProto.isBlank()
                ? forwardedProto.split(",")[0].trim()
                : request.getScheme();
        String host = request.getHeader("Host");
        if (host == null || host.isBlank()) {
            host = request.getServerName() + ":" + request.getServerPort();
        }
        return protocol + "://" + host;
    }
}
