package com.streamdesk.estimate;

import com.streamdesk.equipment.Equipment;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Фабрики тестовых данных для движка смет.
 */
final class EstimateTestFixtures {

    private EstimateTestFixtures() {
    }

    static Equipment equipment(String id, String name, String type, String model, String status, Object price) {
        Equipment e = new Equipment();
        e.setId(id);
        e.setName(name);
        e.setType(type);
        e.setModel(model);
        e.setStatus(status);
        if (price != null) {
            Map<String, Object> spec = new LinkedHashMap<>();
            spec.put("estimatePrice", price);
            e.setSpecifications(spec);
        }
        return e;
    }

    static Equipment equipmentNoPrice(String id, String name, String type, String model, String status) {
        return equipment(id, name, type, model, status, null);
    }
}
