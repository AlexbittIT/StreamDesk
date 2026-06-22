package com.streamdesk.room;

import com.streamdesk.config.ApiException;
import com.streamdesk.room.dto.RoomUpdateRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * In-memory хранилище комнат — перенос roomsStore из backend/routes.ts.
 * Состояние живёт в памяти процесса и сбрасывается к дефолту при перезапуске (как в Express).
 */
@Service
public class RoomService {

    private final List<Room> rooms = new CopyOnWriteArrayList<>(defaultRooms());

    public List<Room> list() {
        return rooms;
    }

    public Room getById(String id) {
        return find(id);
    }

    public synchronized Room update(String id, RoomUpdateRequest req) {
        Room room = find(id);
        if (req.capacity() != null) {
            room.setCapacity(req.capacity());
        }
        if (req.accessLevel() != null) {
            room.setAccessLevel(req.accessLevel());
        }
        if (req.name() != null) {
            room.setName(req.name());
        }
        if (req.type() != null) {
            room.setType(req.type());
        }
        return room;
    }

    private Room find(String id) {
        return rooms.stream()
                .filter(r -> r.getId().equals(id))
                .findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Room not found"));
    }

    private static List<Room> defaultRooms() {
        return List.of(
                new Room("100", "100", "Кабинет", 4, "green", "floor-1"),
                new Room("101", "101", "Кабинет", 6, "green", "floor-1"),
                new Room("102", "102", "Переговорная", 8, "green", "floor-1"),
                new Room("103", "103", "Переговорная", 10, "green", "floor-1"),
                new Room("107", "107", "Большая лекционная «Север»", 150, "red", "floor-1"),
                new Room("109", "109", "Лекционная", 80, "yellow", "floor-1"),
                new Room("110", "110", "Аудитория", 40, "yellow", "floor-1"),
                new Room("111", "111", "Кабинет", 2, "red", "floor-1"),
                new Room("112", "112", "Студия", 15, "yellow", "floor-1"),
                new Room("200", "200", "Лекционная", 100, "yellow", "floor-2"),
                new Room("201", "201", "Кабинет", 4, "green", "floor-2"),
                new Room("202", "202", "Переговорная", 12, "green", "floor-2"),
                new Room("300", "300", "Конференц-зал", 200, "red", "floor-3"),
                new Room("301", "301", "Кабинет", 4, "green", "floor-3")
        );
    }
}
