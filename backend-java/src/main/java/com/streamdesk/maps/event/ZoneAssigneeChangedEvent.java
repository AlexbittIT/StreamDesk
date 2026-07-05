package com.streamdesk.maps.event;

import com.streamdesk.maps.Zone;

/** Ответственный за зону назначен или снят — realtime рассылает {@code zone.assignee_changed}. */
public record ZoneAssigneeChangedEvent(
        Zone zone,
        String assigneeId,
        String assigneeType,
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
