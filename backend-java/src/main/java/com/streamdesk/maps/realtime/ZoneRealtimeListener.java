package com.streamdesk.maps.realtime;

import com.streamdesk.maps.event.ZoneAssigneeChangedEvent;
import com.streamdesk.maps.event.ZoneCreatedEvent;
import com.streamdesk.maps.event.ZoneDeletedEvent;
import com.streamdesk.maps.event.ZoneStatusChangedEvent;
import com.streamdesk.maps.event.ZoneUpdatedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Realtime-потребитель доменных событий зон: превращает их в WS-события комнаты карты
 * (docs/maps-api.md §5) и отдаёт транспорту {@link ZoneRealtimeBroadcaster}.
 *
 * <p>Слушатели синхронные (в той же транзакции, что и запись) — так тесты детерминированно
 * проверяют факт публикации, а рассылка не «теряется» при откате.
 */
@Component
public class ZoneRealtimeListener {

    private final ZoneRealtimeBroadcaster broadcaster;

    public ZoneRealtimeListener(ZoneRealtimeBroadcaster broadcaster) {
        this.broadcaster = broadcaster;
    }

    @EventListener
    public void onCreated(ZoneCreatedEvent e) {
        broadcaster.broadcast(e.mapId(), "zone.created", Map.of("zone", e.zone()));
    }

    @EventListener
    public void onUpdated(ZoneUpdatedEvent e) {
        broadcaster.broadcast(e.mapId(), "zone.updated", Map.of("zone", e.zone()));
    }

    @EventListener
    public void onDeleted(ZoneDeletedEvent e) {
        broadcaster.broadcast(e.mapId(), "zone.deleted", Map.of("zoneId", e.zoneId()));
    }

    @EventListener
    public void onStatusChanged(ZoneStatusChangedEvent e) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("zoneId", e.zone().getId());
        payload.put("fromStatus", e.fromStatus());
        payload.put("toStatus", e.toStatus());
        payload.put("changedBy", e.changedBy());
        payload.put("version", e.zone().getVersion());
        broadcaster.broadcast(e.mapId(), "zone.status_changed", payload);

        // Дублирующее событие «проблема» для клиентов карты (docs/maps-api.md §5 alert.problem).
        if ("problem".equals(e.toStatus())) {
            Map<String, Object> alert = new LinkedHashMap<>();
            alert.put("mapId", e.mapId());
            alert.put("zone", e.zone());
            alert.put("markedBy", e.changedBy());
            broadcaster.broadcast(e.mapId(), "alert.problem", alert);
        }
    }

    @EventListener
    public void onAssigneeChanged(ZoneAssigneeChangedEvent e) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("zoneId", e.zone().getId());
        payload.put("assigneeId", e.assigneeId());
        payload.put("assigneeType", e.assigneeType());
        broadcaster.broadcast(e.mapId(), "zone.assignee_changed", payload);
    }
}
