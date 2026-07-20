package com.streamdesk.connectionschema.validation;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Правила совместимости разъёмов. Зеркалят фронтовый модуль signal-compatibility.ts —
 * если правила здесь меняются, его надо править синхронно, иначе интерфейс разрешит связь,
 * которую сервер отклонит.
 */
class ConnectorTypesCompatibilityTest {

    @Test
    @DisplayName("Конвертация внутри категории разрешена")
    void conversionWithinCategoryAllowed() {
        assertTrue(ConnectorTypes.compatible("HDMI", "HDMI"));
        // Ради этого случая правило и переписывалось: раньше отклонялось.
        assertTrue(ConnectorTypes.compatible("HDMI", "SDI"));
        assertTrue(ConnectorTypes.compatible("SDI", "DISPLAYPORT"));
        assertTrue(ConnectorTypes.compatible("XLR", "JACK"));
    }

    @Test
    @DisplayName("Между категориями переход запрещён")
    void crossCategoryRejected() {
        assertFalse(ConnectorTypes.compatible("HDMI", "XLR"));
        assertFalse(ConnectorTypes.compatible("SDI", "DMX"));
        assertFalse(ConnectorTypes.compatible("XLR", "HDMI"));
    }

    @Test
    @DisplayName("IP-протоколы не подменяют сигнал: NDI не переходит в Dante")
    void ipProtocolsKeepTheirDomain() {
        assertFalse(ConnectorTypes.compatible("NDI", "DANTE"));
        assertFalse(ConnectorTypes.compatible("DANTE", "NDI"));
        assertTrue(ConnectorTypes.compatible("DANTE", "AES67"));
        assertTrue(ConnectorTypes.compatible("ARTNET", "SACN"));
    }

    @Test
    @DisplayName("IP-протокол включается в Ethernet, но не в аналоговый разъём")
    void ipProtocolsPlugIntoEthernetOnly() {
        assertTrue(ConnectorTypes.compatible("DANTE", "ETHERNET"));
        assertTrue(ConnectorTypes.compatible("NDI", "ETHERCON"));
        assertTrue(ConnectorTypes.compatible("ETHERNET", "ARTNET"));
        // Dante сидит на RJ45 — в XLR его не воткнуть, хотя категория одна.
        assertFalse(ConnectorTypes.compatible("DANTE", "XLR"));
        assertFalse(ConnectorTypes.compatible("NDI", "HDMI"));
    }

    @Test
    @DisplayName("Питание изолировано от сигнала")
    void powerIsolated() {
        assertTrue(ConnectorTypes.compatible("IEC", "POWERCON"));
        assertTrue(ConnectorTypes.compatible("SCHUKO", "EDISON"));
        assertFalse(ConnectorTypes.compatible("IEC", "SDI"));
        assertFalse(ConnectorTypes.compatible("HDMI", "POWER"));
    }

    @Test
    @DisplayName("Синонимы Ethernet по-прежнему совместимы")
    void ethernetAliasesStillCompatible() {
        assertTrue(ConnectorTypes.compatible("LAN", "ETH"));
        assertTrue(ConnectorTypes.compatible("ETHERNET", "ETHERCON"));
        assertTrue(ConnectorTypes.compatible("RJ45", "ETHERNET"));
    }

    @Test
    @DisplayName("Незаполненный тип не блокирует связь")
    void unknownTypeStaysPermissive() {
        assertTrue(ConnectorTypes.compatible(null, "SDI"));
        assertTrue(ConnectorTypes.compatible("SDI", ""));
        assertTrue(ConnectorTypes.compatible("   ", "XLR"));
    }
}
