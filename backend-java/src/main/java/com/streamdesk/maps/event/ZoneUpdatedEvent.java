package com.streamdesk.maps.event;

import com.streamdesk.maps.Zone;

/** Изменены имя/геометрия зоны — realtime рассылает {@code zone.updated} с новой version. */
public record ZoneUpdatedEvent(Zone zone) implements ZoneEvent {

    @Override
    public String mapId() {
        return zone.getMapId();
    }

    @Override
    public String companyId() {
        return zone.getCompanyId();
    }
}
