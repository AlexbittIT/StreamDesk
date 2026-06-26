package com.streamdesk.event;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/**
 * Репозиторий участников событий — замена getEventParticipants/updateEventParticipant и т.п.
 */
public interface EventParticipantRepository extends JpaRepository<EventParticipant, String> {

    // аналог getEventParticipants(eventId)
    List<EventParticipant> findByEventId(String eventId);

    Optional<EventParticipant> findByEventIdAndUserId(String eventId, String userId);

    // массовое удаление участников события (для замены списка и при удалении события)
    void deleteByEventId(String eventId);
}