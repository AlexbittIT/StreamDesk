package com.streamdesk.maps.realtime;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Реестр presence в памяти: «кто сейчас онлайн в комнате карты» (docs/maps-api.md §5).
 *
 * <p>Ключ участника комнаты — WS-сессия ({@code sessionId}), но состав считается по
 * {@code userId} с дедупом: несколько вкладок одного пользователя — один участник. Методы
 * возвращают признак «состав изменился», чтобы рассылать {@code presence.update} только когда
 * реально кто-то пришёл/ушёл (открытие второй вкладки состав не меняет). Потокобезопасно —
 * WS-события приходят из разных потоков.
 */
@Component
public class MapPresenceRegistry {

    /** Участник presence: id и отображаемое имя. */
    public record PresenceUser(String id, String name) {
    }

    /** mapId → (sessionId → участник). */
    private final Map<String, Map<String, PresenceUser>> rooms = new ConcurrentHashMap<>();

    /**
     * Добавить WS-сессию пользователя в комнату карты.
     *
     * @return {@code true}, если состав участников (уникальные userId) изменился
     */
    public synchronized boolean join(String mapId, String sessionId, PresenceUser user) {
        Map<String, PresenceUser> room = rooms.computeIfAbsent(mapId, k -> new LinkedHashMap<>());
        Set<String> before = distinctIds(room);
        room.put(sessionId, user);
        return !before.equals(distinctIds(room));
    }

    /**
     * Убрать WS-сессию из комнаты карты.
     *
     * @return {@code true}, если состав участников изменился (ушла последняя вкладка пользователя)
     */
    public synchronized boolean leave(String mapId, String sessionId) {
        Map<String, PresenceUser> room = rooms.get(mapId);
        if (room == null) {
            return false;
        }
        Set<String> before = distinctIds(room);
        room.remove(sessionId);
        boolean changed = !before.equals(distinctIds(room));
        if (room.isEmpty()) {
            rooms.remove(mapId);
        }
        return changed;
    }

    /**
     * Убрать WS-сессию из всех комнат (DISCONNECT).
     *
     * @return множество mapId, у которых после удаления изменился состав участников
     */
    public synchronized Set<String> removeSession(String sessionId) {
        Set<String> changedRooms = new java.util.HashSet<>();
        for (String mapId : new ArrayList<>(rooms.keySet())) {
            if (leave(mapId, sessionId)) {
                changedRooms.add(mapId);
            }
        }
        return changedRooms;
    }

    /** Текущий состав комнаты — уникальные участники по userId (первая встреченная вкладка). */
    public synchronized List<PresenceUser> users(String mapId) {
        Map<String, PresenceUser> room = rooms.get(mapId);
        if (room == null) {
            return List.of();
        }
        Map<String, PresenceUser> byId = new LinkedHashMap<>();
        for (PresenceUser u : room.values()) {
            byId.putIfAbsent(u.id(), u);
        }
        return new ArrayList<>(byId.values());
    }

    private static Set<String> distinctIds(Map<String, PresenceUser> room) {
        return room.values().stream().map(PresenceUser::id).collect(Collectors.toSet());
    }
}
