package com.streamdesk.estimate;

import java.util.List;

/**
 * Требование к позиции сметы — порт RequirementItem из estimate-engine.ts.
 *
 * Источник требования ({@code source}) определяет индикатор на итоговой строке:
 * "ai" — позицию предложил ИИ, "local" — локальные правила/продакшн-блоки по ТЗ.
 *
 * @param unitPrice  цена-подсказка от ИИ (может быть null)
 * @param confidence доверие ИИ к позиции (может быть null)
 * @param keywords   ключевые фразы для токен-матчинга со складом
 * @param source     "ai" | "local"
 */
public record RequirementItem(
        String name,
        String type,
        String model,
        int quantity,
        String reason,
        Double unitPrice,
        Double confidence,
        List<String> keywords,
        String source
) {
}
