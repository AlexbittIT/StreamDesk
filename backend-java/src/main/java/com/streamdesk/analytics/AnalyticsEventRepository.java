package com.streamdesk.analytics;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Репозиторий аналитических событий — замена getAnalyticsEvents/createAnalyticsEvent.
 * Фильтр по датам делается в сервисе (чтобы не упираться в типизацию null-параметров Postgres).
 */
public interface AnalyticsEventRepository extends JpaRepository<AnalyticsEvent, String> {

    List<AnalyticsEvent> findAllByOrderByTimestampDesc();

    List<AnalyticsEvent> findByEntityTypeOrderByTimestampDesc(String entityType);
}
