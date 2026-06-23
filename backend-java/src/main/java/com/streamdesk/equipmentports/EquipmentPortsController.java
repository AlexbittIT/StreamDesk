package com.streamdesk.equipmentports;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.config.ApiException;
import com.streamdesk.equipment.Equipment;
import com.streamdesk.equipmentports.dto.ApproveDeviceRequest;
import com.streamdesk.equipmentports.dto.DeviceDiscoveryRequest;
import com.streamdesk.equipmentports.dto.DeviceDiscoveryResponse;
import com.streamdesk.equipmentports.dto.PortLookupRequest;
import com.streamdesk.equipmentports.dto.PortLookupResponse;
import com.streamdesk.equipmentports.dto.PortsUpdateRequest;
import com.streamdesk.equipmentports.dto.UnmappedResolveRequest;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * REST-контроллер портов оборудования (Task 2): поиск/кэш портов по «производитель+
 * модель», опознание устройства, ревью человеком и очередь неизвестных разъёмов.
 */
@RestController
@RequestMapping("/api/equipment-ports")
public class EquipmentPortsController {

    private final PortLookupService service;

    public EquipmentPortsController(PortLookupService service) {
        this.service = service;
    }

    /** Поиск портов для устройства, которое уже есть на складе (кэш или свежий ИИ). */
    @PostMapping("/lookup")
    public PortLookupResponse lookup(@RequestBody PortLookupRequest req,
                                     @AuthenticationPrincipal AuthenticatedUser user) {
        requireAuth(user);
        if (req == null) {
            throw ApiException.badRequest("Пустой запрос");
        }
        return service.lookup(req.manufacturer(), req.model());
    }

    /** Список кэшированных портов (опционально по статусу, напр. pending_review). */
    @GetMapping
    public List<EquipmentModelPorts> list(@RequestParam(required = false) String status,
                                          @AuthenticationPrincipal AuthenticatedUser user) {
        requireAuth(user);
        return service.listByStatus(status);
    }

    /** Человек подтверждает найденные ИИ порты — кэшируется навсегда. */
    @PostMapping("/{id}/confirm")
    public EquipmentModelPorts confirm(@PathVariable String id,
                                       @AuthenticationPrincipal AuthenticatedUser user) {
        requireAuth(user);
        return service.confirm(id, user.id());
    }

    /** Ручная правка портов человеком. */
    @PatchMapping("/{id}")
    public EquipmentModelPorts update(@PathVariable String id,
                                      @RequestBody PortsUpdateRequest req,
                                      @AuthenticationPrincipal AuthenticatedUser user) {
        requireAuth(user);
        if (req == null) {
            throw ApiException.badRequest("Пустой запрос");
        }
        return service.updatePorts(id, req.ports(), req.status(), user.id());
    }

    /** Подсказки: до 10 моделей по запросу с предложенными портами (вкладка «Поиск»). */
    @PostMapping("/suggest")
    public List<DeviceDiscoveryResponse> suggest(@RequestBody DeviceDiscoveryRequest req,
                                                 @AuthenticationPrincipal AuthenticatedUser user) {
        requireAuth(user);
        return service.suggestModels(req != null ? req.query() : null);
    }

    /** Опознать устройство по свободному описанию (когда его нет на складе). */
    @PostMapping("/discover")
    public DeviceDiscoveryResponse discover(@RequestBody DeviceDiscoveryRequest req,
                                            @AuthenticationPrincipal AuthenticatedUser user) {
        requireAuth(user);
        return service.discover(req != null ? req.query() : null);
    }

    /** Одобрить опознанное устройство — создать оборудование + подтверждённый кэш портов. */
    @PostMapping("/approve")
    public Equipment approve(@RequestBody ApproveDeviceRequest req,
                             @AuthenticationPrincipal AuthenticatedUser user) {
        requireAuth(user);
        return service.approveDiscovered(req, user.id());
    }

    /** Очередь разъёмов, не найденных в справочнике. */
    @GetMapping("/unmapped-terms")
    public List<UnmappedTerm> unmapped(@RequestParam(required = false) String status,
                                       @AuthenticationPrincipal AuthenticatedUser user) {
        requireAuth(user);
        return service.listUnmapped(status);
    }

    /** Разрешить запись очереди: add (с suggestedCode) или dismiss. */
    @PostMapping("/unmapped-terms/{id}/resolve")
    public UnmappedTerm resolve(@PathVariable String id,
                                @RequestBody UnmappedResolveRequest req,
                                @AuthenticationPrincipal AuthenticatedUser user) {
        requireAuth(user);
        return service.resolveUnmapped(id, req, user.id());
    }

    private void requireAuth(AuthenticatedUser user) {
        if (user == null) {
            throw ApiException.unauthorized("Требуется авторизация");
        }
    }
}
