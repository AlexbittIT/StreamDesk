package com.streamdesk.yougile.api;

/**
 * Ошибка лимита запросов YouGile (429 или сообщение «слишком много запросов») —
 * порт YouGileRateLimitError из backend/yougile.ts. Повтор — через retryAfterMs.
 */
public class YougileRateLimitException extends RuntimeException {

    private final long retryAfterMs;

    public YougileRateLimitException(String message, long retryAfterMs) {
        super(message);
        this.retryAfterMs = retryAfterMs;
    }

    public long getRetryAfterMs() {
        return retryAfterMs;
    }
}
