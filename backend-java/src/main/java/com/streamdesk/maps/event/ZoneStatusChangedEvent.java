package com.streamdesk.maps.event;

import com.streamdesk.maps.Zone;

/**
 * Статус зоны изменён — realtime рассылает {@code zone.status_changed}, alert реагирует на
 * переход в {@code problem}. {@code mapName} нужен alert-слушателю для текста уведомления.
 */
public record ZoneStatusChangedEvent(
        Zone zone,
        String mapName,
        String fromStatus,
        String toStatus,
        String changedBy
) implements ZoneEvent {

    @Override
    public String mapId() {
        return zone.getMapId();
    }

    @Override
    public String companyId() {
        return zone.getCompanyId();
    }
}
