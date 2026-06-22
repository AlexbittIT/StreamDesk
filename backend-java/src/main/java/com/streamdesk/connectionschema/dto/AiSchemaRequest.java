package com.streamdesk.connectionschema.dto;

import java.util.List;

/**
 * Вход AI-генерации схемы: текстовое ТЗ и/или список оборудования (нод-кандидатов).
 */
public record AiSchemaRequest(String prompt, List<EquipmentInput> equipment) {

    public record EquipmentInput(String name, String type, String model) {
    }
}
