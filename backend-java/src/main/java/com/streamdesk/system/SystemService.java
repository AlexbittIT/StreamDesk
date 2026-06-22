package com.streamdesk.system;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.company.CompanyService;
import com.streamdesk.config.ApiException;
import com.streamdesk.system.SystemStatusLogic.AgentStatus;
import com.streamdesk.system.dto.PingResponse;
import com.streamdesk.system.dto.SystemRequest;
import com.streamdesk.system.dto.SystemResponse;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.TaskExecutor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Логика систем — перенос /api/systems из backend/routes.ts.
 * Статус агентных систем считается «вживую» по свежести lastPing; обновление БД — в фоне.
 */
@Service
public class SystemService {

    private final SystemRepository repository;
    private final CompanyService companyService;
    private final NetworkService networkService;
    private final TaskExecutor taskExecutor;

    public SystemService(SystemRepository repository,
                         CompanyService companyService,
                         NetworkService networkService,
                         @Qualifier("applicationTaskExecutor") TaskExecutor taskExecutor) {
        this.repository = repository;
        this.companyService = companyService;
        this.networkService = networkService;
        this.taskExecutor = taskExecutor;
    }

    /** GET /api/systems — фильтр по компаниям пользователя + обогащение статусом агентов. */
    public List<SystemResponse> listSystems(AuthenticatedUser user) {
        List<String> companyIds = companyService.getUserCompanyIds(user);

        List<SystemEntity> kept = repository.findAllByOrderByName().stream()
                .filter(system -> {
                    String cid = SystemStatusLogic.companyId(SystemStatusLogic.spec(system));
                    return cid == null || cid.isBlank() || companyIds.isEmpty() || companyIds.contains(cid);
                })
                .toList();

        List<SystemResponse> result = kept.stream().map(this::toResponse).toList();

        // Фоновое обновление статусов в БД (как Promise.all без await в Express).
        taskExecutor.execute(() -> refreshStatuses(kept));
        return result;
    }

    @Transactional
    public SystemEntity createSystem(SystemRequest req) {
        SystemEntity system = new SystemEntity();
        system.setName(req.name() != null ? req.name() : "");
        system.setType(isBlank(req.type()) ? "server" : req.type());
        system.setLocation(req.location() != null ? req.location() : "");
        system.setIpAddress(req.ipAddress());
        if (!isBlank(req.status())) {
            system.setStatus(req.status());
        }
        system.setSpecifications(req.specifications());
        return repository.save(system);
    }

    @Transactional
    public SystemEntity updateSystem(String id, SystemRequest req) {
        SystemEntity system = repository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "System not found"));
        if (req.name() != null) {
            system.setName(req.name());
        }
        if (req.type() != null) {
            system.setType(req.type());
        }
        if (req.location() != null) {
            system.setLocation(req.location());
        }
        if (req.ipAddress() != null) {
            system.setIpAddress(req.ipAddress());
        }
        if (req.status() != null) {
            system.setStatus(req.status());
        }
        if (req.specifications() != null) {
            system.setSpecifications(req.specifications());
        }
        return repository.save(system);
    }

    @Transactional
    public void deleteSystem(String id) {
        if (!repository.existsById(id)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "System not found");
        }
        repository.deleteById(id);
    }

    /** POST /api/systems/{id}/ping — пинг конкретной системы по её IP и обновление статуса. */
    @Transactional
    public Map<String, Object> pingById(String id) {
        SystemEntity system = repository.findById(id).orElse(null);
        if (system == null || isBlank(system.getIpAddress())) {
            throw new ApiException(HttpStatus.NOT_FOUND, "System not found or no IP address");
        }
        String status = networkService.checkIp(system.getIpAddress()) ? "online" : "offline";
        system.setStatus(status);
        system.setLastPing(Instant.now());
        SystemEntity updated = repository.save(system);

        Map<String, Object> result = new HashMap<>();
        result.put("system", updated);
        result.put("status", status);
        return result;
    }

    /** POST /api/systems/ping — проверка доступности хоста с замером времени. */
    public PingResponse ping(String ip) {
        if (isBlank(ip)) {
            throw ApiException.badRequest("IP address is required");
        }
        long start = System.currentTimeMillis();
        boolean online = networkService.checkIp(ip);
        long elapsed = System.currentTimeMillis() - start;
        return online ? PingResponse.online(ip, elapsed) : PingResponse.offline(ip, "Host is unreachable");
    }

    // --- helpers ---

    private SystemResponse toResponse(SystemEntity system) {
        Map<String, Object> spec = SystemStatusLogic.spec(system);
        if (!SystemStatusLogic.isAgentManaged(spec)) {
            return SystemResponse.from(system);
        }
        AgentStatus agentStatus = SystemStatusLogic.computeAgentStatus(spec, system.getLastPing());
        Map<String, Object> agent = new HashMap<>(SystemStatusLogic.agent(spec));
        agent.put("staleSec", agentStatus.staleSec());
        Map<String, Object> enrichedSpec = new HashMap<>(spec);
        enrichedSpec.put("agent", agent);
        return SystemResponse.enriched(system, agentStatus.status(), enrichedSpec);
    }

    /**
     * Фоновое обновление статусов: агентные — по свежести lastPing, остальные — TCP-проверкой IP.
     * Пишем в БД только при изменении статуса (легче, чем безусловная запись в Express).
     */
    private void refreshStatuses(List<SystemEntity> systems) {
        for (SystemEntity system : systems) {
            try {
                Map<String, Object> spec = SystemStatusLogic.spec(system);
                if ("maintenance".equals(system.getStatus())) {
                    continue;
                }
                if (SystemStatusLogic.isAgentManaged(spec)) {
                    String status = SystemStatusLogic.computeAgentStatus(spec, system.getLastPing()).status();
                    if (!status.equals(system.getStatus())) {
                        system.setStatus(status);
                        repository.save(system);
                    }
                } else if (!isBlank(system.getIpAddress())) {
                    String status = networkService.checkIp(system.getIpAddress()) ? "online" : "offline";
                    if (!status.equals(system.getStatus())) {
                        system.setStatus(status);
                        system.setLastPing(Instant.now());
                        repository.save(system);
                    }
                }
            } catch (Exception ignored) {
                // фоновое обновление best-effort — ошибки одной системы не ломают остальные
            }
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
