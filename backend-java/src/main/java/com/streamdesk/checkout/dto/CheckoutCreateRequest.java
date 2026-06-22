package com.streamdesk.checkout.dto;

/**
 * Тело POST /api/equipment-checkout-requests.
 */
public record CheckoutCreateRequest(
        String equipmentId,
        String location,
        String note,
        String requestType,
        String companyId,
        String currentHolder
) {
}
