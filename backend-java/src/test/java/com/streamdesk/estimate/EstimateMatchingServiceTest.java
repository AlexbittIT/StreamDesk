package com.streamdesk.estimate;

import com.streamdesk.equipment.Equipment;
import com.streamdesk.estimate.EstimateMatchingService.MatchQuery;
import com.streamdesk.estimate.EstimateMatchingService.MatchResult;
import com.streamdesk.estimate.EstimateMatchingService.PriceResolution;
import com.streamdesk.estimate.dto.PriceOverride;
import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Сопоставление со складом (SD-152): нормализация, синонимы типов, токен-скоринг
 * и разрешение цены (склад → ручная аренда → ИИ → no_price).
 */
class EstimateMatchingServiceTest {

    private final CatalogService catalogService = new CatalogService();
    private final EstimateMatchingService matching = new EstimateMatchingService();

    @Test
    void normalizeFoldsCaseYoAndPunctuation() {
        // ё→е, регистр, дефисы/спецсимволы → пробел
        assertEquals("микшерный пульт x32", EstimateText.normalize("  Микшёрный—пульт   X32!! "));
    }

    @Test
    void matchesViaTypeSynonymWhenNamesDiffer() {
        // В каталоге тип "audio", модель "X32"; требование описано синонимом "микшер"/"пульт".
        List<Equipment> equipment = List.of(
                EstimateTestFixtures.equipment("e1", "Цифровой микшерный пульт", "audio", "X32", "available", 4550));
        List<CatalogEntry> catalog = catalogService.buildCatalog(equipment);

        MatchResult result = matching.matchCatalog(catalog,
                new MatchQuery("Микшерный пульт", null, "audio", List.of("микшер", "пульт")),
                new HashSet<>());

        assertNotNull(result, "позиция типа audio должна сопоставиться через синонимы");
        assertEquals("audio", result.entry().getType());
        assertTrue(result.confidence() >= 0.5 && result.confidence() <= 0.98);
    }

    @Test
    void wantedTypesInferredFromSynonyms() {
        Set<String> types = matching.inferWantedTypes("Нужен микрофон для спикера и LED экран");
        assertTrue(types.contains("microphone"), "микрофон → microphone");
        assertTrue(types.contains("display"), "LED экран → display");
    }

    @Test
    void belowThresholdReturnsNull() {
        List<Equipment> equipment = List.of(
                EstimateTestFixtures.equipment("e1", "Грузовой транспорт", "transport", "", "available", 6000));
        List<CatalogEntry> catalog = catalogService.buildCatalog(equipment);

        // Требование иного типа без общих токенов — порог не достигается.
        MatchResult result = matching.matchCatalog(catalog,
                new MatchQuery("Световой прибор", null, "lighting", List.of()), new HashSet<>());
        assertNull(result);
    }

    @Test
    void noPriceWhenWarehouseHasNoPriceAndNoOverride() {
        // Склад без цены, без ручного переопределения, без оценки ИИ → no_price.
        List<Equipment> equipment = List.of(
                EstimateTestFixtures.equipmentNoPrice("e1", "Хейзер", "effects", "", "available"));
        List<CatalogEntry> catalog = catalogService.buildCatalog(equipment);
        CatalogEntry entry = catalog.get(0);

        PriceResolution price = matching.resolvePrice("Хейзер", "effects", entry, null, List.of());
        assertEquals("no_price", price.priceStatus());
        assertEquals(0, price.unitPrice());
    }

    @Test
    void manualOverrideWinsAndCarriesVendorLocation() {
        PriceOverride override = new PriceOverride("Хейзер", "effects", 3350, "Рога и Копыта", "Склад Север");
        PriceResolution price = matching.resolvePrice("Хейзер", "effects", null, null, List.of(override));

        assertEquals("priced", price.priceStatus());
        assertEquals(3350, price.unitPrice());
        assertTrue(price.priceSource().startsWith("manual"), "источник цены — ручной ввод");
        assertTrue(price.priceSource().contains("Рога и Копыта"), "поставщик попадает в источник");
        assertTrue(price.locations().contains("Склад Север"), "локация аренды сохраняется");
    }
}
