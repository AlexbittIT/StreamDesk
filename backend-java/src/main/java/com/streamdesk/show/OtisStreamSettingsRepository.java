package com.streamdesk.show;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Репозиторий настроек эфира ОТИС — синглтон (одна строка).
 */
public interface OtisStreamSettingsRepository extends JpaRepository<OtisStreamSettings, String> {
}
