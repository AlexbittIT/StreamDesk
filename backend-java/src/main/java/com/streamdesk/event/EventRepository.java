package com.streamdesk.event;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;

/**
 * Репозиторий событий — замена getEvents/getEventsByUser/getEventsByDateRange из IStorage.
 */
public interface EventRepository extends JpaRepository<Event, String> {

    // аналог getEvents() — все события по времени начала
    List<Event> findAllByOrderByStartTime();

    // аналог getEventsByUser(userId) — где пользователь организатор
    List<Event> findByOrganizerIdOrderByStartTime(String organizerId);

    // аналог getEventsByDateRange(start, end) — startTime в диапазоне (границы включительно)
    List<Event> findByStartTimeBetweenOrderByStartTime(Instant start, Instant end);
}