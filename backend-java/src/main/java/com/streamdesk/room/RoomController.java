package com.streamdesk.room;

import com.streamdesk.room.dto.RoomUpdateRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * REST-контроллер комнат — перенос /api/rooms из backend/routes.ts. Пути сохранены.
 */
@RestController
@RequestMapping("/api/rooms")
public class RoomController {

    private final RoomService roomService;

    public RoomController(RoomService roomService) {
        this.roomService = roomService;
    }

    @GetMapping
    public List<Room> list() {
        return roomService.list();
    }

    @GetMapping("/{id}")
    public Room get(@PathVariable String id) {
        return roomService.getById(id);
    }

    @PutMapping("/{id}")
    public Room update(@PathVariable String id, @RequestBody RoomUpdateRequest req) {
        return roomService.update(id, req);
    }
}
