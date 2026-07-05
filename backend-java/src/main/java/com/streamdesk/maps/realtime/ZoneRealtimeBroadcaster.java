package com.streamdesk.maps.realtime;

import java.util.Map;

/**
 * Транспорт realtime-рассылки событий зон в комнату карты (docs/maps-api.md §5).
 *
 * <p>Отделяет доменную логику от механизма доставки: сейчас WebSocket в backend-java ещё нет
 * (задачи VM-06/VM-13), поэтому дефолтная реализация — логирующая. Когда появится WS-хаб,
 * достаточно подменить бин, не трогая сервис и слушатели.
 */
public interface ZoneRealtimeBroadcaster {

    /**
     * Разослать событие всем участникам комнаты карты.
     *
     * @param mapId    карта-адресат (комната)
     * @param type     тип события WS: {@code zone.created}, {@code zone.status_changed}, …
     * @param payload  тело события (см. таблицу в docs/maps-api.md §5)
     */
    void broadcast(String mapId, String type, Map<String, Object> payload);
}
