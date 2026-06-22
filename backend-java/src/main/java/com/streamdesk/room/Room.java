package com.streamdesk.room;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Комната/аудитория для карт — перенос in-memory RoomRow из backend/routes.ts.
 * Хранится в памяти (без таблицы БД), как в Express. capacity/accessLevel/name/type редактируемы.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Room {

    private String id;
    private String name;
    private String type;
    private Integer capacity;
    private String accessLevel;
    private String floorId;
}
