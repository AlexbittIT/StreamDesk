package com.streamdesk.maps.event;

/** Зона удалена — realtime рассылает {@code zone.deleted}. */
public record ZoneDeletedEvent(String mapId, String companyId, String zoneId) implements ZoneEvent {
}
