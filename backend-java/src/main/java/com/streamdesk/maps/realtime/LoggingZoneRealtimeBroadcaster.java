package com.streamdesk.maps.realtime;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * Дефолтная реализация realtime-рассылки — пишет событие в лог. Заглушка на период, пока
 * нет WS-хаба (VM-06/VM-13). Когда появится реальный WS-транспорт, его бин помечается
 * {@code @Primary} (или эта заглушка удаляется), и слушатель начинает слать в сокеты.
 */
@Component
public class LoggingZoneRealtimeBroadcaster implements ZoneRealtimeBroadcaster {

    private static final Logger log = LoggerFactory.getLogger(LoggingZoneRealtimeBroadcaster.class);

    @Override
    public void broadcast(String mapId, String type, Map<String, Object> payload) {
        log.debug("[MapsRealtime] map={} event={} payload={}", mapId, type, payload);
    }
}
