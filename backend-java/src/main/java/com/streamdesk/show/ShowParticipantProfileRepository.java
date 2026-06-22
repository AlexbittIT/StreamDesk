package com.streamdesk.show;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Репозиторий профилей участников шоу — замена getShowParticipantProfiles и т.п.
 */
public interface ShowParticipantProfileRepository extends JpaRepository<ShowParticipantProfile, String> {

    // аналог getShowParticipantProfiles(eventId) — order ASC (NULLS LAST в PG по умолчанию), затем createdAt ASC
    List<ShowParticipantProfile> findByEventIdOrderByOrderAscCreatedAtAsc(String eventId);
}
