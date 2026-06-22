package com.streamdesk.event.dto;

import com.streamdesk.event.EventParticipant;

import java.time.Instant;

/**
 * Участник события с добавленным именем пользователя (userName) — как в Express-обогащении.
 */
public record ParticipantResponse(
        String id,
        String eventId,
        String userId,
        String role,
        String status,
        Instant createdAt,
        String userName
) {

    public static ParticipantResponse from(EventParticipant p, String userName) {
        return new ParticipantResponse(
                p.getId(),
                p.getEventId(),
                p.getUserId(),
                p.getRole(),
                p.getStatus(),
                p.getCreatedAt(),
                userName != null ? userName : "?"
        );
    }
}