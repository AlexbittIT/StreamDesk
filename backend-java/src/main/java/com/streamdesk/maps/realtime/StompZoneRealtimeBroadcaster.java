package com.streamdesk.maps.realtime;

import org.springframework.context.annotation.Primary;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Реальная realtime-рассылка событий зон через STOMP-брокер (docs/maps-api.md §5).
 *
 * <p>{@code @Primary} — замещает {@link LoggingZoneRealtimeBroadcaster}, как только на classpath
 * появился WebSocket (VM-06/VM-13). Каждое событие доставляется в топик комнаты карты
 * {@code /topic/maps/{mapId}} конвертом {@code { type, payload }}: {@code type} — вид события
 * ({@code zone.created}, {@code presence.update}, …), {@code payload} — тело события.
 */
@Component
@Primary
public class StompZoneRealtimeBroadcaster implements ZoneRealtimeBroadcaster {

    private final SimpMessagingTemplate messagingTemplate;

    public StompZoneRealtimeBroadcaster(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    @Override
    public void broadcast(String mapId, String type, Map<String, Object> payload) {
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("type", type);
        envelope.put("payload", payload);
        messagingTemplate.convertAndSend(MapTopics.room(mapId), envelope);
    }
}
