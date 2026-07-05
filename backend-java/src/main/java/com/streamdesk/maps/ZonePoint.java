package com.streamdesk.maps;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Точка полигона зоны в координатах изображения-подложки (см. docs/maps-api.md §2).
 * Хранится в JSON-колонке {@code zones.points}; сериализуется Hibernate/Jackson.
 */
@Getter
@Setter
@NoArgsConstructor
public class ZonePoint {

    private double x;
    private double y;

    public ZonePoint(double x, double y) {
        this.x = x;
        this.y = y;
    }
}
