package com.streamdesk.show;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Репозиторий маркеров шоу — замена getShowMarkers и т.п.
 */
public interface ShowMarkerRepository extends JpaRepository<ShowMarker, String> {

    // аналог getShowMarkers(eventId) — по таймкоду, затем времени создания (ASC)
    List<ShowMarker> findByEventIdOrderByTimecodeAscCreatedAtAsc(String eventId);
}
