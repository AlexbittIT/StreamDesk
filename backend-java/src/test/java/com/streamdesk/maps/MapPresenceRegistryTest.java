package com.streamdesk.maps;

import com.streamdesk.maps.realtime.MapPresenceRegistry;
import com.streamdesk.maps.realtime.MapPresenceRegistry.PresenceUser;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit-тест реестра presence (docs/maps-api.md §5): дедуп нескольких вкладок одного пользователя,
 * корректный признак «состав изменился» и очистка WS-сессии из всех комнат при дисконнекте.
 */
class MapPresenceRegistryTest {

    private static final String MAP_A = "map-a";
    private static final String MAP_B = "map-b";

    private final MapPresenceRegistry registry = new MapPresenceRegistry();

    @Test
    void multipleTabsOfOneUser_areOneParticipant() {
        PresenceUser anna = new PresenceUser("u1", "Анна");

        // Первая вкладка — состав изменился (появился участник).
        assertThat(registry.join(MAP_A, "sess-1", anna)).isTrue();
        // Вторая вкладка того же пользователя — состав НЕ меняется (дедуп по userId).
        assertThat(registry.join(MAP_A, "sess-2", anna)).isFalse();

        assertThat(registry.users(MAP_A)).containsExactly(anna);

        // Закрытие одной вкладки не убирает участника — состав прежний.
        assertThat(registry.leave(MAP_A, "sess-1")).isFalse();
        assertThat(registry.users(MAP_A)).containsExactly(anna);

        // Закрытие последней вкладки — участник ушёл, состав изменился.
        assertThat(registry.leave(MAP_A, "sess-2")).isTrue();
        assertThat(registry.users(MAP_A)).isEmpty();
    }

    @Test
    void rosterChange_reflectsDistinctUsers() {
        PresenceUser anna = new PresenceUser("u1", "Анна");
        PresenceUser boris = new PresenceUser("u2", "Борис");

        assertThat(registry.join(MAP_A, "sess-1", anna)).isTrue();
        // Другой пользователь — состав изменился.
        assertThat(registry.join(MAP_A, "sess-2", boris)).isTrue();
        assertThat(registry.users(MAP_A)).containsExactlyInAnyOrder(anna, boris);

        // Уход одного из двоих — состав изменился, остаётся второй.
        assertThat(registry.leave(MAP_A, "sess-1")).isTrue();
        assertThat(registry.users(MAP_A)).containsExactly(boris);
    }

    @Test
    void removeSession_clearsUserFromAllRooms() {
        PresenceUser anna = new PresenceUser("u1", "Анна");
        PresenceUser boris = new PresenceUser("u2", "Борис");

        registry.join(MAP_A, "sess-1", anna);
        registry.join(MAP_B, "sess-1", anna); // та же сессия в двух комнатах
        registry.join(MAP_A, "sess-2", boris); // другой участник остаётся в MAP_A

        Set<String> changed = registry.removeSession("sess-1");

        // Обе комнаты Анны затронуты дисконнектом.
        assertThat(changed).containsExactlyInAnyOrder(MAP_A, MAP_B);
        // В MAP_A остался Борис, MAP_B опустела.
        assertThat(registry.users(MAP_A)).containsExactly(boris);
        assertThat(registry.users(MAP_B)).isEmpty();
    }

    @Test
    void leaveUnknownRoomOrSession_isNoop() {
        assertThat(registry.leave("no-such-map", "sess-x")).isFalse();
        registry.join(MAP_A, "sess-1", new PresenceUser("u1", "Анна"));
        assertThat(registry.leave(MAP_A, "sess-unknown")).isFalse();
    }
}
