package com.streamdesk.integrations;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Статистика внешних платформ (mock) — перенос /api/integrations/{youtube,vk}/stats из backend/routes.ts.
 * В реальности здесь были бы вызовы YouTube Data API / VK API.
 */
@RestController
@RequestMapping("/api/integrations")
public class IntegrationsController {

    @GetMapping("/youtube/stats")
    public Map<String, Object> youtubeStats() {
        return stats(ThreadLocalRandom.current().nextInt(2000) + 500, "6000 kbps");
    }

    @GetMapping("/vk/stats")
    public Map<String, Object> vkStats() {
        return stats(ThreadLocalRandom.current().nextInt(1500) + 300, "5800 kbps");
    }

    private Map<String, Object> stats(int viewers, String bitrate) {
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("viewers", viewers);
        stats.put("duration", "1ч 25м");
        stats.put("status", "live");
        stats.put("bitrate", bitrate);
        stats.put("fps", 60);
        return stats;
    }
}
