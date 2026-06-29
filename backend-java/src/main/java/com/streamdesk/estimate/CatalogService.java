package com.streamdesk.estimate;

import com.streamdesk.equipment.Equipment;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Сборка каталога склада — порт buildCatalog/readCatalogPrice из estimate-engine.ts.
 *
 * Группирует одинаковое оборудование (по типу+имени+модели+цене), суммирует
 * количество и наличие, собирает локации и достаёт цену из specifications.
 * Цена ищется по приоритетным ключам, затем по любому ключу со словом цена/стоимость/price.
 */
@Service
public class CatalogService {

    // Приоритетные ключи цены в specifications (как в Node-движке).
    private static final List<String> DIRECT_PRICE_KEYS = List.of(
            "estimatePrice", "estimate_price", "estimateUnitPrice", "unitPrice",
            "price", "cost", "цена", "цена за смену", "стоимость", "стоимость за смену", "сметная стоимость");

    /** Цена позиции и ключ-источник, по которому она найдена. */
    public record Price(double value, String source) {
    }

    public List<CatalogEntry> buildCatalog(List<Equipment> equipment) {
        Map<String, CatalogEntry> groups = new LinkedHashMap<>();
        for (Equipment item : equipment == null ? List.<Equipment>of() : equipment) {
            Price price = readCatalogPrice(item);
            String key = EstimateText.normalize(String.join("|",
                    nz(item.getType()), nz(item.getName()), nz(item.getModel()), formatNumber(price.value())));
            CatalogEntry entry = groups.computeIfAbsent(key, k -> {
                CatalogEntry e = new CatalogEntry();
                e.setName(nz(item.getName()));
                e.setType(blankToOther(item.getType()));
                e.setModel(nz(item.getModel()));
                e.setUnitPrice(price.value());
                e.setPriceSource(price.source());
                return e;
            });
            entry.getEquipmentIds().add(item.getId());
            entry.setTotalQty(entry.getTotalQty() + 1);
            if ("available".equals(item.getStatus())) {
                entry.setAvailableQty(entry.getAvailableQty() + 1);
            }
            String location = item.getLocation();
            if (location != null && !location.isBlank() && !entry.getLocations().contains(location)) {
                entry.getLocations().add(location);
            }
            // Если у первой записи цены не было, а у следующей появилась — подхватываем.
            if (entry.getUnitPrice() == 0 && price.value() > 0) {
                entry.setUnitPrice(price.value());
                entry.setPriceSource(price.source());
            }
        }
        List<CatalogEntry> out = new ArrayList<>(groups.size());
        int idx = 1;
        for (CatalogEntry entry : groups.values()) {
            entry.setId("catalog-" + (idx++));
            entry.setSearch(EstimateText.normalize(entry.getName() + " " + entry.getModel() + " " + entry.getType()));
            out.add(entry);
        }
        return out;
    }

    /** Цена из specifications: сперва приоритетные ключи, затем любой «ценовой» ключ. */
    public Price readCatalogPrice(Equipment item) {
        Map<String, Object> spec = item == null ? null : item.getSpecifications();
        if (spec == null || spec.isEmpty()) {
            return new Price(0, "");
        }
        for (String key : DIRECT_PRICE_KEYS) {
            Object raw = spec.get(key);
            if (raw != null) {
                double value = EstimateText.parseMoney(raw);
                if (value > 0) {
                    return new Price(value, key);
                }
            }
        }
        for (Map.Entry<String, Object> e : spec.entrySet()) {
            String nk = EstimateText.normalize(e.getKey());
            if (nk.contains("цен") || nk.contains("стоим") || nk.contains("прайс")
                    || nk.contains("price") || nk.contains("cost")) {
                double value = EstimateText.parseMoney(e.getValue());
                if (value > 0) {
                    return new Price(value, e.getKey());
                }
            }
        }
        return new Price(0, "");
    }

    private static String nz(String value) {
        return value == null ? "" : value;
    }

    private static String blankToOther(String type) {
        return type == null || type.isBlank() ? "other" : type;
    }

    private static String formatNumber(double value) {
        if (value == Math.rint(value) && !Double.isInfinite(value)) {
            return Long.toString((long) value);
        }
        return Double.toString(value);
    }
}
