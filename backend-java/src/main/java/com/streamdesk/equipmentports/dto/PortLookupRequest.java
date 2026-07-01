package com.streamdesk.equipmentports.dto;

/**
 * Запрос поиска портов по «производитель + модель».
 */
public record PortLookupRequest(String manufacturer, String model) {
}
