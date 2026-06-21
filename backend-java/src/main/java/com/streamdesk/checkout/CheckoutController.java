package com.streamdesk.checkout;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.checkout.dto.CheckoutCreateRequest;
import com.streamdesk.config.ApiException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * REST-контроллер запросов на выдачу оборудования (/api/equipment-checkout-requests).
 * Доимплементация по контракту фронтенда (в Node не было).
 */
@RestController
@RequestMapping("/api/equipment-checkout-requests")
public class CheckoutController {

    private final CheckoutService checkoutService;

    public CheckoutController(CheckoutService checkoutService) {
        this.checkoutService = checkoutService;
    }

    @GetMapping
    public List<EquipmentCheckoutRequest> list() {
        return checkoutService.list();
    }

    @PostMapping
    public EquipmentCheckoutRequest create(@RequestBody CheckoutCreateRequest req,
                                           @AuthenticationPrincipal AuthenticatedUser user) {
        return checkoutService.create(req, requireUserId(user));
    }

    @PostMapping("/{id}/approve")
    public EquipmentCheckoutRequest approve(@PathVariable String id,
                                            @AuthenticationPrincipal AuthenticatedUser user) {
        return checkoutService.approve(id, requireUserId(user));
    }

    @PostMapping("/{id}/reject")
    public EquipmentCheckoutRequest reject(@PathVariable String id,
                                           @AuthenticationPrincipal AuthenticatedUser user) {
        return checkoutService.reject(id, requireUserId(user));
    }

    private String requireUserId(AuthenticatedUser user) {
        if (user == null) {
            throw ApiException.unauthorized("Требуется авторизация");
        }
        return user.id();
    }
}
