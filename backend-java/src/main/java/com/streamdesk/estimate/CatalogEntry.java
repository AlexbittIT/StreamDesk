package com.streamdesk.estimate;

import lombok.Getter;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

/**
 * Группа однотипного оборудования склада — порт CatalogEntry из estimate-engine.ts.
 *
 * Внутренняя модель движка (не сериализуется напрямую): {@code matchCatalog}
 * сопоставляет требования сметы с такими записями, а строки сметы копируют из
 * них цену, наличие, локации и id оборудования. Мутабельна — накапливается в
 * {@link CatalogService#buildCatalog}.
 */
@Getter
@Setter
public class CatalogEntry {

    private String id;
    private List<String> equipmentIds = new ArrayList<>();
    private String name = "";
    private String type = "other";
    private String model = "";
    private double unitPrice;
    private String priceSource = "";
    private int availableQty;
    private int totalQty;
    private List<String> locations = new ArrayList<>();
    // Нормализованная строка для токен-поиска: имя + модель + тип.
    private String search = "";
}
