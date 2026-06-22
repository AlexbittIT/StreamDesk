package com.streamdesk.equipmentports.dto;

/**
 * Свободный запрос на опознание устройства (название и/или характеристики),
 * когда его нет на складе.
 */
public record DeviceDiscoveryRequest(String query) {
}
