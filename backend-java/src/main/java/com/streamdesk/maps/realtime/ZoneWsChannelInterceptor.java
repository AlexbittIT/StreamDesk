package com.streamdesk.maps.realtime;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.company.CompanyService;
import com.streamdesk.maps.MapRepository;
import com.streamdesk.maps.SiteMap;
import org.springframework.context.annotation.Lazy;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Перехватчик входящего STOMP-канала: изоляция компаний на подписке и учёт presence
 * (docs/maps-api.md §5, §7).
 *
 * <ul>
 *   <li><b>SUBSCRIBE</b> на {@code /topic/maps/{mapId}} — карта обязана принадлежать компании
 *       пользователя (иначе подписка отклоняется, чужие события клиент не получит), затем
 *       пользователь добавляется в presence комнаты;</li>
 *   <li><b>UNSUBSCRIBE</b> / <b>DISCONNECT</b> — пользователь убирается из комнат;</li>
 *   <li>при изменении состава участников в комнату рассылается {@code presence.update}.</li>
 * </ul>
 */
@Component
public class ZoneWsChannelInterceptor implements ChannelInterceptor {

    /** Ключ атрибута WS-сессии: subscriptionId → mapId (чтобы UNSUBSCRIBE нашёл комнату). */
    private static final String SUBS_ATTR = "wsMapSubs";

    private final MapRepository mapRepository;
    private final CompanyService companyService;
    private final MapPresenceRegistry presence;
    private final ZoneRealtimeBroadcaster broadcaster;

    public ZoneWsChannelInterceptor(MapRepository mapRepository,
                                    CompanyService companyService,
                                    MapPresenceRegistry presence,
                                    @Lazy ZoneRealtimeBroadcaster broadcaster) {
        this.mapRepository = mapRepository;
        this.companyService = companyService;
        this.presence = presence;
        this.broadcaster = broadcaster;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(message);
        StompCommand command = accessor.getCommand();
        if (command == null) {
            return message;
        }
        return switch (command) {
            case SUBSCRIBE -> onSubscribe(message, accessor);
            case UNSUBSCRIBE -> onUnsubscribe(message, accessor);
            case DISCONNECT -> onDisconnect(message, accessor);
            default -> message;
        };
    }

    private Message<?> onSubscribe(Message<?> message, StompHeaderAccessor accessor) {
        String mapId = MapTopics.mapIdOf(accessor.getDestination());
        if (mapId == null) {
            return message; // подписка не на комнату карты — не наша забота
        }
        AuthenticatedUser user = user(accessor);
        if (user == null || !belongsToUserCompany(mapId, user)) {
            return null; // чужая/несуществующая карта → подписку отклоняем
        }

        subs(accessor).put(accessor.getSubscriptionId(), mapId);
        boolean changed = presence.join(mapId, accessor.getSessionId(),
                new MapPresenceRegistry.PresenceUser(user.id(), user.name()));
        if (changed) {
            broadcastPresence(mapId);
        }
        return message;
    }

    private Message<?> onUnsubscribe(Message<?> message, StompHeaderAccessor accessor) {
        String mapId = subs(accessor).remove(accessor.getSubscriptionId());
        if (mapId != null && presence.leave(mapId, accessor.getSessionId())) {
            broadcastPresence(mapId);
        }
        return message;
    }

    private Message<?> onDisconnect(Message<?> message, StompHeaderAccessor accessor) {
        Set<String> changedRooms = presence.removeSession(accessor.getSessionId());
        changedRooms.forEach(this::broadcastPresence);
        return message;
    }

    /** Принадлежит ли карта компании пользователя (существует и своя) — иначе изоляция запрещает. */
    private boolean belongsToUserCompany(String mapId, AuthenticatedUser user) {
        SiteMap map = mapRepository.findById(mapId).orElse(null);
        return map != null && companyService.getUserCompanyIds(user).contains(map.getCompanyId());
    }

    private void broadcastPresence(String mapId) {
        broadcaster.broadcast(mapId, "presence.update", Map.of("users", presence.users(mapId)));
    }

    private static AuthenticatedUser user(StompHeaderAccessor accessor) {
        Map<String, Object> attrs = accessor.getSessionAttributes();
        Object user = attrs != null ? attrs.get(WsHandshakeAuthInterceptor.WS_USER) : null;
        return user instanceof AuthenticatedUser au ? au : null;
    }

    /** Карта subscriptionId → mapId в атрибутах WS-сессии (создаётся при первой подписке). */
    @SuppressWarnings("unchecked")
    private static Map<String, String> subs(StompHeaderAccessor accessor) {
        Map<String, Object> attrs = accessor.getSessionAttributes();
        return (Map<String, String>) attrs.computeIfAbsent(SUBS_ATTR, k -> new ConcurrentHashMap<String, String>());
    }
}
