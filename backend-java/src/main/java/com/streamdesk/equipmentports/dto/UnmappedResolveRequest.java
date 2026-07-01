package com.streamdesk.equipmentports.dto;

/**
 * Разрешение записи очереди: {@code action = "add"} (добавлен в справочник —
 * suggestedCode обязателен) или {@code "dismiss"} (отклонить).
 */
public record UnmappedResolveRequest(String suggestedCode, String action) {

    public static final String ACTION_ADD = "add";
    public static final String ACTION_DISMISS = "dismiss";
}
