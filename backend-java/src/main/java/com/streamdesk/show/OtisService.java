package com.streamdesk.show;

import com.streamdesk.show.dto.OtisRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Логика настроек эфира ОТИС — синглтон (одна строка в otis_stream_settings).
 * Перенос /api/otis из backend/routes.ts.
 */
@Service
public class OtisService {

    private final OtisStreamSettingsRepository repository;

    public OtisService(OtisStreamSettingsRepository repository) {
        this.repository = repository;
    }

    /** GET /api/otis — настройки или дефолт, если их ещё нет. */
    public Object get() {
        OtisStreamSettings settings = current();
        if (settings != null) {
            return settings;
        }
        Map<String, Object> fallback = new LinkedHashMap<>();
        fallback.put("name", "Эфир ОТИС");
        fallback.put("showTimecode", true);
        fallback.put("withSound", true);
        return fallback;
    }

    /** PUT /api/otis — upsert синглтона. */
    @Transactional
    public OtisStreamSettings upsert(OtisRequest req) {
        OtisStreamSettings settings = current();
        if (settings == null) {
            settings = new OtisStreamSettings();
        }
        settings.setName(!isBlank(req.name()) ? req.name() : "Эфир ОТИС");
        if (req.streamUrl() != null) {
            settings.setStreamUrl(req.streamUrl());
        }
        if (req.streamUrlBackup() != null) {
            settings.setStreamUrlBackup(req.streamUrlBackup());
        }
        // true по умолчанию; false только если явно передан false (как showTimecode !== false в Express).
        settings.setShowTimecode(!Boolean.FALSE.equals(req.showTimecode()));
        settings.setWithSound(!Boolean.FALSE.equals(req.withSound()));
        settings.setTimecodeSource(!isBlank(req.timecodeSource()) ? req.timecodeSource() : "local");
        if (req.vmixHost() != null) {
            settings.setVmixHost(req.vmixHost());
        }
        if (req.vmixPort() != null) {
            settings.setVmixPort(req.vmixPort());
        }
        settings.setUpdatedAt(Instant.now());
        return repository.save(settings);
    }

    private OtisStreamSettings current() {
        return repository.findAll().stream().findFirst().orElse(null);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
