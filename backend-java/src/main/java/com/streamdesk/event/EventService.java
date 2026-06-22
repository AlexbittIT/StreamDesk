package com.streamdesk.event;

import com.streamdesk.config.ApiException;
import com.streamdesk.event.dto.EventRequest;
import com.streamdesk.event.dto.EventResponse;
import com.streamdesk.event.dto.ParticipantResponse;
import com.streamdesk.notification.NotificationService;
import com.streamdesk.user.User;
import com.streamdesk.user.UserService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Логика событий и участников — перенос веток /api/events из backend/routes.ts.
 */
@Service
public class EventService {

    private final EventRepository eventRepository;
    private final EventParticipantRepository participantRepository;
    private final UserService userService;
    private final NotificationService notificationService;

    public EventService(EventRepository eventRepository,
                        EventParticipantRepository participantRepository,
                        UserService userService,
                        NotificationService notificationService) {
        this.eventRepository = eventRepository;
        this.participantRepository = participantRepository;
        this.userService = userService;
        this.notificationService = notificationService;
    }

    /** Список событий с фильтрами (userId | start+end) — порт GET /api/events. */
    public List<EventResponse> listEvents(String userId, String start, String end) {
        List<Event> events;
        if (userId != null && !userId.isBlank()) {
            events = eventRepository.findByOrganizerIdOrderByStartTime(userId);
        } else if (start != null && !start.isBlank() && end != null && !end.isBlank()) {
            events = eventRepository.findByStartTimeBetweenOrderByStartTime(requireInstant(start), requireInstant(end));
        } else {
            events = eventRepository.findAllByOrderByStartTime();
        }
        Map<String, String> names = userNames();
        return events.stream()
                .map(event -> EventResponse.from(event, participantsOf(event.getId(), names)))
                .toList();
    }

    /** Участники события с именами — порт GET /api/events/:eventId/participants. */
    public List<ParticipantResponse> getParticipants(String eventId) {
        return participantsOf(eventId, userNames());
    }

    @Transactional
    public Event createEvent(EventRequest req, String currentUserId) {
        if (isBlank(req.title())) {
            throw ApiException.badRequest("Укажите название события");
        }
        if (isBlank(req.location())) {
            throw ApiException.badRequest("Укажите место проведения");
        }
        Instant startTime = requireInstant(req.startTime());
        Instant endTime = requireInstant(req.endTime());

        Event event = new Event();
        event.setTitle(req.title().trim());
        event.setDescription(req.description());
        event.setStartTime(startTime);
        event.setEndTime(endTime);
        event.setLocation(req.location().trim());
        event.setCustomLocation(req.customLocation());
        event.setOrganizerId(!isBlank(req.organizerId()) ? req.organizerId() : currentUserId);
        if (!isBlank(req.status())) {
            event.setStatus(req.status());
        }
        if (!isBlank(req.type())) {
            event.setType(req.type());
        }
        Event saved = eventRepository.save(event);

        addParticipants(saved, req.participants());
        return saved;
    }

    @Transactional
    public Event updateEvent(String id, EventRequest req) {
        Event event = eventRepository.findById(id)
                .orElseThrow(() -> new ApiException(org.springframework.http.HttpStatus.NOT_FOUND, "Event not found"));

        if (!isBlank(req.title())) {
            event.setTitle(req.title());
        }
        if (req.description() != null) {
            event.setDescription(req.description());
        }
        if (!isBlank(req.startTime())) {
            event.setStartTime(requireInstant(req.startTime()));
        }
        if (!isBlank(req.endTime())) {
            event.setEndTime(requireInstant(req.endTime()));
        }
        if (!isBlank(req.location())) {
            event.setLocation(req.location());
        }
        if (req.customLocation() != null) {
            event.setCustomLocation(req.customLocation());
        }
        if (!isBlank(req.status())) {
            event.setStatus(req.status());
        }
        if (!isBlank(req.type())) {
            event.setType(req.type());
        }
        if (!isBlank(req.organizerId())) {
            event.setOrganizerId(req.organizerId());
        }
        Event saved = eventRepository.save(event);

        // Список участников передан (пусть даже пустой) — заменяем целиком.
        if (req.participants() != null) {
            participantRepository.deleteByEventId(id);
            addParticipants(saved, req.participants());
        }
        return saved;
    }

    @Transactional
    public void deleteEvent(String id) {
        if (!eventRepository.existsById(id)) {
            throw new ApiException(org.springframework.http.HttpStatus.NOT_FOUND, "Event not found");
        }
        participantRepository.deleteByEventId(id);
        eventRepository.deleteById(id);
    }

    @Transactional
    public EventParticipant updateParticipantStatus(String participantId, String status) {
        if (!"accepted".equals(status) && !"declined".equals(status)) {
            throw ApiException.badRequest("status must be 'accepted' or 'declined'");
        }
        EventParticipant participant = participantRepository.findById(participantId)
                .orElseThrow(() -> new ApiException(org.springframework.http.HttpStatus.NOT_FOUND, "Participant not found"));
        participant.setStatus(status);
        return participantRepository.save(participant);
    }

    // --- helpers ---

    private void addParticipants(Event event, List<String> userIds) {
        if (userIds == null) {
            return;
        }
        String message = "Вас пригласили на событие: " + event.getTitle() + ". Примите или отклоните в календаре.";
        for (String uid : userIds) {
            if (uid == null || uid.isBlank()) {
                continue;
            }
            EventParticipant participant = new EventParticipant();
            participant.setEventId(event.getId());
            participant.setUserId(uid);
            participant.setRole("participant");
            participant.setStatus("invited");
            participantRepository.save(participant);
            notificationService.notify(uid, "Приглашение на событие", message, "info");
        }
    }

    private List<ParticipantResponse> participantsOf(String eventId, Map<String, String> names) {
        return participantRepository.findByEventId(eventId).stream()
                .map(p -> ParticipantResponse.from(p, names.get(p.getUserId())))
                .toList();
    }

    private Map<String, String> userNames() {
        return userService.getAllUsers().stream()
                .collect(Collectors.toMap(User::getId, User::getName, (a, b) -> a));
    }

    private Instant requireInstant(String value) {
        Instant parsed = parseInstant(value);
        if (parsed == null) {
            throw ApiException.badRequest("Укажите время начала и окончания события");
        }
        return parsed;
    }

    /** Гибкий разбор времени: эпоха в мс, ISO с Z/смещением или без — как new Date() в Node. */
    private Instant parseInstant(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String s = value.trim();
        if (s.matches("\\d+")) {
            return Instant.ofEpochMilli(Long.parseLong(s));
        }
        for (Function<String, Instant> parser : List.<Function<String, Instant>>of(
                Instant::parse,
                v -> OffsetDateTime.parse(v).toInstant(),
                v -> LocalDateTime.parse(v).atZone(ZoneId.systemDefault()).toInstant())) {
            try {
                return parser.apply(s);
            } catch (DateTimeParseException ignored) {
                // пробуем следующий формат
            }
        }
        throw ApiException.badRequest("Некорректная дата: " + value);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}