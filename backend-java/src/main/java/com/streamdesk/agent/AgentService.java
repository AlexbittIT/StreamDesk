package com.streamdesk.agent;

import com.streamdesk.company.Company;
import com.streamdesk.company.CompanyService;
import com.streamdesk.config.ApiException;
import com.streamdesk.equipment.Equipment;
import com.streamdesk.equipment.EquipmentRepository;
import com.streamdesk.system.SystemEntity;
import com.streamdesk.system.SystemRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Логика агентов мониторинга — перенос /api/agents/* и agent-download из backend/routes.ts.
 * heartbeat: апсертит систему по agentKey, копит историю метрик, синкает оборудование-компьютер.
 */
@Service
public class AgentService {

    private static final Logger log = LoggerFactory.getLogger(AgentService.class);
    private static final int HISTORY_LIMIT = 359;

    private final SystemRepository systemRepository;
    private final EquipmentRepository equipmentRepository;
    private final CompanyService companyService;
    private final SecureRandom secureRandom = new SecureRandom();

    public AgentService(SystemRepository systemRepository,
                        EquipmentRepository equipmentRepository,
                        CompanyService companyService) {
        this.systemRepository = systemRepository;
        this.equipmentRepository = equipmentRepository;
        this.companyService = companyService;
    }

    // --- heartbeat ---

    @Transactional
    public Map<String, Object> heartbeat(Map<String, Object> payload) {
        String companyId = str(payload.get("companyId"));
        String workspaceKey = str(payload.get("workspaceKey"));
        String expectedKey = companyService.getWorkspaceKey(companyId);
        if (expectedKey == null || !expectedKey.equals(workspaceKey != null ? workspaceKey : "")) {
            throw ApiException.forbidden("Agent workspace rejected");
        }
        Company company = companyService.getCompanyById(companyId).orElse(null);
        String agentKey = str(payload.get("agentKey"));
        agentKey = agentKey != null ? agentKey.trim() : "";
        if (agentKey.isEmpty()) {
            throw ApiException.badRequest("agentKey is required");
        }

        final String key = agentKey;
        SystemEntity existing = systemRepository.findAll().stream()
                .filter(s -> {
                    Map<String, Object> spec = asMap(s.getSpecifications());
                    Map<String, Object> agent = asMap(spec.get("agent"));
                    return key.equals(spec.get("agentKey")) || key.equals(agent.get("agentKey"));
                })
                .findFirst().orElse(null);

        Instant now = Instant.now();
        Map<String, Object> previousSpec = existing != null ? asMap(existing.getSpecifications()) : new LinkedHashMap<>();
        Map<String, Object> metrics = asMap(payload.get("metrics"));
        Map<String, Object> vmix = asMap(payload.get("vmix"));

        List<Object> history = new ArrayList<>(lastN(asList(previousSpec.get("metricsHistory")), HISTORY_LIMIT));
        Map<String, Object> point = new LinkedHashMap<>();
        point.put("timestamp", now.toString());
        point.putAll(metrics);
        point.put("vmixDroppedFrames", coalesce(vmix.get("droppedFramesTotal"), vmix.get("droppedFrames")));
        history.add(point);

        Map<String, Object> agent = new LinkedHashMap<>();
        agent.put("agentKey", agentKey);
        agent.put("companyId", companyId);
        agent.put("workspaceKey", workspaceKey);
        agent.put("deviceType", payload.getOrDefault("type", "computer"));
        agent.put("version", payload.get("version") != null ? payload.get("version") : "1.0.0");
        agent.put("localIps", asList(payload.get("localIps")));
        agent.put("capabilities", asList(payload.get("capabilities")));
        agent.put("intervalSec", payload.get("intervalSec"));
        agent.put("staleSec", 0);
        agent.put("sampleLagMs", sampleLag(metrics.get("collectedAt"), now));

        Map<String, Object> specifications = new LinkedHashMap<>(previousSpec);
        specifications.put("companyId", companyId);
        specifications.put("workspaceKey", workspaceKey);
        specifications.put("agentKey", agentKey);
        specifications.put("agent", agent);
        specifications.put("metrics", metrics);
        specifications.put("hardware", payload.get("hardware") != null ? asMap(payload.get("hardware")) : asMap(previousSpec.get("hardware")));
        specifications.put("vmix", vmix);
        specifications.put("metricsHistory", history);

        SystemEntity system = existing != null ? existing : new SystemEntity();
        system.setName(firstNonBlank(str(payload.get("name")), str(payload.get("hostname")), agentKey));
        system.setType("server".equals(payload.get("type")) ? "server" : "computer");
        system.setLocation(firstNonBlank(str(payload.get("location")), company != null ? company.getName() : null, "StreamDesk Agent"));
        system.setIpAddress(firstNonBlank(str(payload.get("ipAddress")), ""));
        system.setStatus("online");
        system.setLastPing(now);
        system.setSpecifications(specifications);
        system = systemRepository.save(system);

        syncEquipment(payload, specifications, company, agentKey, system.getId(), now);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("ok", true);
        response.put("systemId", system.getId());
        return response;
    }

    private void syncEquipment(Map<String, Object> payload, Map<String, Object> specifications,
                               Company company, String agentKey, String systemId, Instant now) {
        try {
            Map<String, Object> hardware = asMap(specifications.get("hardware"));
            Map<String, Object> metrics = asMap(specifications.get("metrics"));

            String cpuName = firstNonBlank(str(metrics.get("cpuName")), cpuFromHardware(hardware), "");
            String gpuName = gpuNames(hardware);
            Object memoryTotalGb = coalesce(metrics.get("memoryTotalGb"),
                    nested(hardware, "memory", "totalGb"), nested(hardware, "ram", "totalGb"));
            Object diskTotalGb = coalesce(metrics.get("diskTotalGb"), nested(hardware, "storage", "totalGb"));

            Map<String, Object> equipmentSpecs = new LinkedHashMap<>();
            equipmentSpecs.put("companyId", str(payload.get("companyId")));
            equipmentSpecs.put("source", "streamdesk-agent");
            equipmentSpecs.put("agentKey", agentKey);
            equipmentSpecs.put("systemId", systemId);
            equipmentSpecs.put("syncedAt", now.toString());
            equipmentSpecs.put("hostname", coalesce(payload.get("hostname"), payload.get("name")));
            equipmentSpecs.put("ipAddress", firstNonBlank(str(payload.get("ipAddress")), ""));
            equipmentSpecs.put("localIps", asList(payload.get("localIps")));
            equipmentSpecs.put("deviceType", payload.getOrDefault("type", "computer"));
            equipmentSpecs.put("metrics", metrics);
            equipmentSpecs.put("hardware", hardware);
            equipmentSpecs.put("cpu", cpuName);
            equipmentSpecs.put("gpu", gpuName);
            equipmentSpecs.put("os", firstNonBlank(str(metrics.get("osCaption")), str(nested(hardware, "os", "caption")), ""));

            Equipment existing = equipmentRepository.findAll().stream()
                    .filter(e -> agentKey.equals(asMap(e.getSpecifications()).get("agentKey")))
                    .findFirst().orElse(null);

            Equipment equipment = existing != null ? existing : new Equipment();
            equipment.setName(firstNonBlank(str(payload.get("name")), str(payload.get("hostname")), "StreamDesk computer"));
            equipment.setType("computer");
            String model = String.join(" / ", nonBlank(cpuName, gpuName,
                    memoryTotalGb != null ? memoryTotalGb + "GB RAM" : ""));
            equipment.setModel(model.length() > 180 ? model.substring(0, 180) : model);
            equipment.setInventoryNumber(agentKey);
            equipment.setStatus("available");
            equipment.setLocation(firstNonBlank(str(payload.get("location")), company != null ? company.getName() : null, "StreamDesk Agent"));
            equipment.setSpecifications(equipmentSpecs);
            equipment.setNotes("Автоматически синхронизировано агентом StreamDesk.");
            equipmentRepository.save(equipment);
        } catch (Exception e) {
            log.warn("[Agent] equipment sync failed: {}", e.getMessage());
        }
    }

    // --- metrics ---

    public Map<String, Object> metrics(String systemId, Integer limitParam, Double hoursParam, List<String> allowedCompanyIds) {
        SystemEntity system = systemId != null ? systemRepository.findById(systemId).orElse(null) : null;
        if (system == null) {
            return Map.of("points", List.of());
        }
        Map<String, Object> spec = asMap(system.getSpecifications());
        String companyId = str(spec.get("companyId"));
        if (allowedCompanyIds != null && !allowedCompanyIds.isEmpty() && companyId != null && !allowedCompanyIds.contains(companyId)) {
            return Map.of("points", List.of());
        }
        int limit = (int) Math.max(1, Math.min(1000, limitParam != null ? limitParam : 240));
        double hours = Math.max(0.1, Math.min(24 * 30, hoursParam != null ? hoursParam : 24));
        long since = System.currentTimeMillis() - (long) (hours * 3600_000);

        List<Object> all = asList(spec.get("metricsHistory"));
        List<Object> filtered = all.stream()
                .filter(p -> pointTime(p) >= since)
                .toList();
        return Map.of("points", lastN(filtered, limit));
    }

    // --- installer (.bat) ---

    /** Готовит .bat-инсталлятор агента (порт agent-download). Возвращает имя файла и содержимое. */
    @Transactional
    public InstallerFile buildInstaller(String companyId, String os, String type, boolean autostart, String serverUrl) {
        String deviceType = List.of("server", "computer", "vmix").contains(type) ? type : "computer";
        if (!"windows".equalsIgnoreCase(os)) {
            throw ApiException.badRequest("Пока доступен Windows agent");
        }
        String workspaceKey = companyService.ensureWorkspaceKey(companyId);
        String agentKey = "agent_" + companyId.substring(0, Math.min(8, companyId.length())) + "_" + deviceType + "_" + randomHex(8);
        Company company = companyService.getCompanyById(companyId).orElse(null);
        String location = (company != null ? company.getName() : "StreamDesk") + " / " + deviceType;
        String vmixEnv = "vmix".equals(deviceType) ? "$env:STREAMDESK_VMIX_URL = 'http://127.0.0.1:8088/api'" : "";

        String inner = String.join("\n",
                "$MachineGuid = try { (Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography' -Name MachineGuid -ErrorAction Stop).MachineGuid } catch { $env:COMPUTERNAME }",
                "$Sha = [System.Security.Cryptography.SHA256]::Create()",
                "$MachineHash = [BitConverter]::ToString($Sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes(\"$env:COMPUTERNAME|$MachineGuid\"))).Replace('-', '').Substring(0, 10).ToLowerInvariant()",
                "$AgentKey = '" + ps(agentKey) + "_' + $env:COMPUTERNAME + '_' + $MachineHash",
                "$env:STREAMDESK_URL = '" + ps(serverUrl) + "'",
                "$env:STREAMDESK_COMPANY_ID = '" + ps(companyId) + "'",
                "$env:STREAMDESK_WORKSPACE_KEY = '" + ps(workspaceKey) + "'",
                "$env:STREAMDESK_AGENT_KEY = $AgentKey",
                "$env:STREAMDESK_AGENT_TYPE = '" + ps(deviceType) + "'",
                "$env:STREAMDESK_AGENT_LOCATION = '" + ps(location) + "'",
                "$env:STREAMDESK_AGENT_INTERVAL_SEC = '15'",
                "$env:STREAMDESK_AGENT_HARDWARE_INTERVAL_SEC = '1800'",
                vmixEnv,
                "& powershell.exe -NoProfile -ExecutionPolicy Bypass -File '$AgentScript'");

        String runner = ("$ErrorActionPreference = 'Stop'\n"
                + "$ServerUrl = '" + ps(serverUrl) + "'\n"
                + "$AgentDir = Join-Path $env:ProgramData 'StreamDeskAgent'\n"
                + "$AgentScript = Join-Path $AgentDir 'streamdesk-agent.ps1'\n"
                + "$RunnerScript = Join-Path $AgentDir 'run-streamdesk-agent.ps1'\n"
                + "New-Item -ItemType Directory -Force -Path $AgentDir | Out-Null\n\n"
                + "$AgentKey = '" + ps(agentKey) + "_' + $env:COMPUTERNAME\n"
                + "$env:STREAMDESK_URL = $ServerUrl\n"
                + "$env:STREAMDESK_COMPANY_ID = '" + ps(companyId) + "'\n"
                + "$env:STREAMDESK_WORKSPACE_KEY = '" + ps(workspaceKey) + "'\n"
                + "$env:STREAMDESK_AGENT_TYPE = '" + ps(deviceType) + "'\n"
                + "$env:STREAMDESK_AGENT_LOCATION = '" + ps(location) + "'\n"
                + "$env:STREAMDESK_AGENT_INTERVAL_SEC = '15'\n"
                + (vmixEnv.isEmpty() ? "" : vmixEnv + "\n")
                + "Write-Host 'StreamDesk: installing company-bound agent...'\n"
                + "Invoke-WebRequest -Uri \"$ServerUrl/api/agents/script/windows\" -OutFile $AgentScript -UseBasicParsing\n\n"
                + "@'\n" + inner + "\n'@ | Set-Content -Path $RunnerScript -Encoding UTF8\n\n"
                + "if (" + (autostart ? "$true" : "$false") + ") {\n"
                + "  try {\n"
                + "    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"' + $RunnerScript + '\"')\n"
                + "    $trigger = New-ScheduledTaskTrigger -AtStartup\n"
                + "    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest\n"
                + "    Register-ScheduledTask -TaskName 'StreamDesk Agent' -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null\n"
                + "  } catch { Write-Warning ('Autostart was not enabled: {0}.' -f $_.Exception.Message) }\n"
                + "}\n"
                + "& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $AgentScript\n").stripLeading();

        String encoded = java.util.Base64.getEncoder().encodeToString(runner.getBytes(StandardCharsets.UTF_16LE));
        String bat = String.join("\r\n",
                "@echo off",
                "chcp 65001 >nul",
                "title StreamDesk Agent",
                "echo StreamDesk Agent installer",
                "echo Company-bound file. Do not share it with another company.",
                "echo.",
                "powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand " + encoded,
                "if errorlevel 1 (",
                "  echo.",
                "  echo StreamDesk Agent failed to start. Run this file as administrator if autostart is enabled.",
                "  pause",
                ")",
                "endlocal",
                "");
        String fileName = "streamdesk-agent-" + deviceType + "-" + companyId.substring(0, Math.min(8, companyId.length())) + ".bat";
        return new InstallerFile(fileName, bat);
    }

    public record InstallerFile(String fileName, String content) {
    }

    // --- helpers ---

    @SuppressWarnings("unchecked")
    private Map<String, Object> asMap(Object o) {
        return o instanceof Map ? (Map<String, Object>) o : new LinkedHashMap<>();
    }

    @SuppressWarnings("unchecked")
    private List<Object> asList(Object o) {
        return o instanceof List ? (List<Object>) o : new ArrayList<>();
    }

    private List<Object> lastN(List<Object> list, int n) {
        if (list.size() <= n) {
            return new ArrayList<>(list);
        }
        return new ArrayList<>(list.subList(list.size() - n, list.size()));
    }

    private String str(Object o) {
        return o != null ? String.valueOf(o) : null;
    }

    private String firstNonBlank(String... values) {
        for (String v : values) {
            if (v != null && !v.isBlank()) {
                return v;
            }
        }
        return values.length > 0 ? values[values.length - 1] : "";
    }

    private List<String> nonBlank(String... values) {
        List<String> out = new ArrayList<>();
        for (String v : values) {
            if (v != null && !v.isBlank()) {
                out.add(v);
            }
        }
        return out;
    }

    private Object coalesce(Object... values) {
        for (Object v : values) {
            if (v != null) {
                return v;
            }
        }
        return null;
    }

    private Object nested(Map<String, Object> map, String a, String b) {
        return asMap(map.get(a)).get(b);
    }

    private Long sampleLag(Object collectedAt, Instant now) {
        if (collectedAt == null) {
            return null;
        }
        try {
            long collected = Instant.parse(String.valueOf(collectedAt)).toEpochMilli();
            return Math.max(0, now.toEpochMilli() - collected);
        } catch (Exception e) {
            return null;
        }
    }

    private long pointTime(Object point) {
        try {
            Object ts = asMap(point).get("timestamp");
            return ts != null ? Instant.parse(String.valueOf(ts)).toEpochMilli() : 0;
        } catch (Exception e) {
            return 0;
        }
    }

    private String cpuFromHardware(Map<String, Object> hardware) {
        Object cpu = hardware.get("cpu");
        if (cpu instanceof List<?> list && !list.isEmpty()) {
            return str(asMap(list.get(0)).get("name"));
        }
        if (cpu instanceof Map) {
            return str(asMap(cpu).get("name"));
        }
        return null;
    }

    private String gpuNames(Map<String, Object> hardware) {
        Set<String> names = new LinkedHashSet<>();
        List<Object> sources = new ArrayList<>(asList(hardware.get("gpus")));
        sources.addAll(asList(hardware.get("videoControllers")));
        for (Object g : sources) {
            Map<String, Object> gpu = asMap(g);
            String name = firstNonBlank(str(gpu.get("name")), str(gpu.get("caption")), str(gpu.get("description")), "");
            if (!name.isBlank()) {
                names.add(name);
            }
        }
        return String.join(", ", names);
    }

    private String ps(String value) {
        return value == null ? "" : value.replace("'", "''");
    }

    private String randomHex(int bytes) {
        byte[] buf = new byte[bytes];
        secureRandom.nextBytes(buf);
        StringBuilder sb = new StringBuilder();
        for (byte b : buf) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}
