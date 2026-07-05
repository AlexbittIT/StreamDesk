package com.streamdesk.maps.event;

/**
 * Общий предок доменных событий зоны. Публикуются сервисом через Spring
 * {@link org.springframework.context.ApplicationEventPublisher} и потребляются независимо
 * realtime-слушателем (WS-рассылка) и alert-слушателем (уведомления). См. docs/maps-api.md §5–§6.
 *
 * <p>{@code mapId} нужен, чтобы realtime адресовал событие в комнату конкретной карты,
 * {@code companyId} — чтобы alert знал, каким администраторам слать уведомление.
 */
public interface ZoneEvent {

    String mapId();

    String companyId();
}
