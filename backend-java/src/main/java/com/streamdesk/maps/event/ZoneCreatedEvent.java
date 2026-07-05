package com.streamdesk.maps.event;

import com.streamdesk.maps.Zone;

/** Зона создана — realtime рассылает {@code zone.created}. */
public record ZoneCreatedEvent(Zone zone) implements ZoneEvent {

    @Override
    public String mapId() {
        return zone.getMapId();
    }

    @Override
    public String companyId() {
        return zone.getCompanyId();
    }
}
