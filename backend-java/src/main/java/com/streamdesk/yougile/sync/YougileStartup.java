package com.streamdesk.yougile.sync;

import com.streamdesk.yougile.api.YougileClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * Стартовая инициализация YouGile — порт блока запуска из backend/index.ts.
 * Если YouGile настроен: запускает retry-шедулер стикеров, ставит одну синхронизацию
 * и включает периодическую подтяжку в фоне.
 */
@Component
public class YougileStartup implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(YougileStartup.class);

    private final YougileClient client;
    private final YougileSyncService syncService;

    public YougileStartup(YougileClient client, YougileSyncService syncService) {
        this.client = client;
        this.syncService = syncService;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!client.isConfigured()) {
            return;
        }
        log.info("[YouGile] Настроен — запускаю фоновую синхронизацию");
        syncService.startYougileRetryScheduler();
        syncService.triggerYougileSync(null);
        syncService.startPeriodicSync();
    }
}
