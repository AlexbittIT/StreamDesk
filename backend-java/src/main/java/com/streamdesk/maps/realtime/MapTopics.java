package com.streamdesk.maps.realtime;

/**
 * Схема STOMP-топиков модуля карт: одна комната на карту (docs/maps-api.md §5).
 * Единое место разбора/сборки {@code /topic/maps/{mapId}}, чтобы префикс не разъезжался
 * между рассылкой (broadcaster) и проверкой подписки (channel interceptor).
 */
public final class MapTopics {

    /** Префикс комнаты карты. */
    public static final String ROOM_PREFIX = "/topic/maps/";

    private MapTopics() {
    }

    /** Топик комнаты конкретной карты. */
    public static String room(String mapId) {
        return ROOM_PREFIX + mapId;
    }

    /** mapId из топика комнаты, либо {@code null}, если destination — не комната карты. */
    public static String mapIdOf(String destination) {
        if (destination == null || !destination.startsWith(ROOM_PREFIX)) {
            return null;
        }
        String mapId = destination.substring(ROOM_PREFIX.length());
        return mapId.isBlank() ? null : mapId;
    }
}
