package com.streamdesk.event.dto;

import com.streamdesk.event.Event;

import java.time.Instant;
import java.util.List;

/**
 * Событие вместе со списком участников (с именами) — формат GET /api/events из Express.
 */
public record EventResponse(
        String id,
        String title,
        String description,
        Instant startTime,
        Instant endTime,
        String location,
        String customLocation,
        String organizerId,
        String status,
        String type,
        Instant createdAt,
        List<ParticipantResponse> participants
) {

    public static EventResponse from(Event e, List<ParticipantResponse> participants) {
        return new EventResponse(
                e.getId(),
                e.getTitle(),
                e.getDescription(),
                e.getStartTime(),
                e.getEndTime(),
                e.getLocation(),
                e.getCustomLocation(),
                e.getOrganizerId(),
                e.getStatus(),
                e.getType(),
                e.getCreatedAt(),
                participants
        );
    }
}