package com.streamdesk.maps.realtime;

import org.springframework.boot.task.ThreadPoolTaskExecutorBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/**
 * STOMP-over-WebSocket для realtime карт (docs/maps-api.md §5).
 *
 * <p>Эндпоинт рукопожатия — {@code /ws} (SockJS), комната карты — топик {@code /topic/maps/{mapId}}.
 * Аутентификация берётся из HttpSession на рукопожатии ({@link WsHandshakeAuthInterceptor}),
 * изоляция компаний и presence — на входящем канале ({@link ZoneWsChannelInterceptor}).
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final WsHandshakeAuthInterceptor handshakeAuthInterceptor;
    private final ZoneWsChannelInterceptor channelInterceptor;

    public WebSocketConfig(WsHandshakeAuthInterceptor handshakeAuthInterceptor,
                           ZoneWsChannelInterceptor channelInterceptor) {
        this.handshakeAuthInterceptor = handshakeAuthInterceptor;
        this.channelInterceptor = channelInterceptor;
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
                .addInterceptors(handshakeAuthInterceptor)
                .setAllowedOriginPatterns("*")
                .withSockJS();
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        // Простой in-memory брокер: сервер шлёт в /topic/**; клиент → сервер под /app (пока не используется).
        registry.enableSimpleBroker("/topic");
        registry.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        // Изоляция компаний на SUBSCRIBE + учёт presence на подписке/отписке/дисконнекте.
        registration.interceptors(channelInterceptor);
    }

    /**
     * Явный {@code applicationTaskExecutor}: {@code @EnableWebSocketMessageBroker} регистрирует
     * свои {@code Executor}-бины (каналы STOMP), из-за чего автоконфигурация Spring Boot перестаёт
     * создавать общий {@code applicationTaskExecutor} ({@code @ConditionalOnMissingBean(Executor)}).
     * На него завязан {@code SystemService} — воссоздаём его тем же билдером, что и Boot.
     */
    @Bean
    public ThreadPoolTaskExecutor applicationTaskExecutor(ThreadPoolTaskExecutorBuilder builder) {
        return builder.build();
    }
}
