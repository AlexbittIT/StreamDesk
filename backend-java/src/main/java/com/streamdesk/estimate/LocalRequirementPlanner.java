package com.streamdesk.estimate;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Predicate;

/**
 * Локальный продакшн-план по ТЗ — порт inferProfile + NEED_RULES + PRODUCTION_BLOCKS
 * из estimate-engine.ts. Работает без ИИ: по ключевым словам и профилю мероприятия
 * собирает базовый комплект (звук/видео/свет/коммутация/персонал/логистика).
 * Все позиции помечаются source="local".
 */
@Service
public class LocalRequirementPlanner {

    /** Профиль мероприятия по нормализованному тексту ТЗ. */
    private record Profile(boolean conference, boolean stream, boolean concert,
                           boolean lighting, boolean led, boolean hybrid, boolean large) {
    }

    private Profile inferProfile(String normalized) {
        return new Profile(
                hasAny(normalized, "конференц", "форум", "панель", "спикер", "доклад", "презентац", "зал", "пленар", "семинар"),
                hasAny(normalized, "трансляц", "стрим", "эфир", "запись", "youtube", "vk", "rutube", "онлайн", "вещан"),
                hasAny(normalized, "концерт", "сцена", "артист", "группа", "вокал", "dj", "диджей", "выступлен"),
                hasAny(normalized, "свет", "атмосфер", "подсвет", "концерт", "вечерин", "шоу"),
                hasAny(normalized, "led", "экран", "светодиод", "контент", "видеоэкран", "задник"),
                hasAny(normalized, "vks", "zoom", "teams", "гибрид", "удален", "онлайн подключ", "телемост"),
                hasAny(normalized, "фестиваль", "площад", "улиц", "стадион", "большой зал", "1000", "2000", "массов"));
    }

    private record Need(List<String> keys, String name, String type, int quantity, String reason) {
    }

    // Прямые правила «по ключевым словам ТЗ» — гарантируют базовый набор.
    private static final List<Need> NEED_RULES = List.of(
            new Need(List.of("камера", "camera", "съемк", "оператор"), "Камера", "camera", 2, "Съёмка по ТЗ."),
            new Need(List.of("микрофон", "звук", "петлич", "mic", "спикер"), "Радиосистема", "microphone", 4, "Звукоусиление и речь по ТЗ."),
            new Need(List.of("свет", "lighting", "прожектор", "подсвет"), "Световой прибор", "lighting", 4, "Освещение сцены/спикеров по ТЗ."),
            new Need(List.of("трансляц", "stream", "эфир", "вещан"), "Компьютер трансляции / vMix", "computer", 1, "Трансляция по ТЗ."),
            new Need(List.of("экран", "монитор", "тв", "display", "led"), "Экран / монитор", "display", 1, "Показ контента по ТЗ."),
            new Need(List.of("интернет", "сеть", "роутер", "switch", "lan"), "Сетевое оборудование", "network", 1, "Сеть и интернет по ТЗ."),
            new Need(List.of("запись", "рекордер"), "Рекордер", "video", 1, "Запись по ТЗ."),
            new Need(List.of("atem", "режиссер", "коммутац", "микшер видео"), "Видеомикшер", "video", 1, "Коммутация видео по ТЗ."));

    private record BlockItem(String name, String type, int quantity, String reason, List<String> keywords) {
    }

    private record Block(Predicate<Profile> when, List<BlockItem> items) {
    }

    private static final List<Block> PRODUCTION_BLOCKS = List.of(
            new Block(p -> p.conference() || p.hybrid(), List.of(
                    new BlockItem("Комплект акустики для зала", "audio", 2, "Основная озвучка речи и фоновой музыки в зале.", List.of("акустика", "колонк")),
                    new BlockItem("Цифровой микшерный пульт", "audio", 1, "Сведение микрофонов, ноутбуков, VKS и фоновой музыки.", List.of("микшер", "пульт")),
                    new BlockItem("Ручная радиосистема", "microphone", 4, "Спикеры, модератор и вопросы из зала.", List.of("радиосистем", "микрофон")),
                    new BlockItem("Петличная радиосистема", "microphone", 2, "Спикеры с презентацией, чтобы руки оставались свободными.", List.of("петлич", "радиосистем")),
                    new BlockItem("Презентер / кликер", "accessory", 1, "Управление презентацией со сцены.", List.of("презентер", "кликер")))),
            new Block(p -> p.stream() || p.hybrid(), List.of(
                    new BlockItem("Камера на штативе", "camera", 2, "Минимум общий и крупный планы для трансляции/записи.", List.of("камер")),
                    new BlockItem("Видеомикшер", "video", 1, "Переключение камер, презентаций и графики в эфир.", List.of("видеомикшер", "atem", "switcher")),
                    new BlockItem("Компьютер трансляции / vMix", "computer", 1, "Кодирование эфира, титры, запись и отправка на платформу.", List.of("vmix", "компьютер трансляц")),
                    new BlockItem("Рекордер / резервная запись", "video", 1, "Локальная резервная запись мероприятия.", List.of("рекордер", "запись")),
                    new BlockItem("Монитор режиссёра", "display", 1, "Контроль программного сигнала и предпросмотра.", List.of("монитор")))),
            new Block(Profile::led, List.of(
                    new BlockItem("Светодиодный экран LED", "display", 1, "Показ презентаций, заставок, таймера и контента.", List.of("led", "экран", "светодиод")),
                    new BlockItem("Видеопроцессор для экрана", "video", 1, "Корректная подача сигнала и масштабирование на экран.", List.of("процессор", "novastar")),
                    new BlockItem("Ноутбук / медиасервер презентаций", "computer", 1, "Запуск презентаций и медиаконтента.", List.of("ноутбук", "медиасервер")))),
            new Block(p -> p.lighting() || p.concert(), List.of(
                    new BlockItem("Световой прибор заливочный", "lighting", 6, "Базовая сценическая заливка и подсветка спикеров/артистов.", List.of("wash", "заливочн", "прибор")),
                    new BlockItem("Световой пульт / контроллер", "lighting", 1, "Управление сценическим светом.", List.of("пульт", "контроллер", "command")),
                    new BlockItem("DMX сплиттер и коммутация", "cable", 1, "Разводка управления светом по площадке.", List.of("dmx", "сплиттер")))),
            new Block(Profile::concert, List.of(
                    new BlockItem("Сабвуфер", "audio", 2, "Низкочастотная поддержка музыкальной программы.", List.of("сабвуфер", "sb")),
                    new BlockItem("Сценический монитор", "audio", 4, "Мониторинг для артистов на сцене.", List.of("монитор сцен", "сценический монитор")),
                    new BlockItem("Комплект микрофонов для сцены", "microphone", 6, "Вокал, инструменты и запасные каналы.", List.of("микрофон", "радиосистем")))),
            new Block(p -> true, List.of(
                    new BlockItem("Комплект видео-коммутации", "cable", 1, "SDI/HDMI кабели, переходники и резерв для подключения видео.", List.of("коммутац видео")),
                    new BlockItem("Комплект аудио-коммутации", "cable", 1, "XLR, DI-box и резервные линии для звука.", List.of("коммутац звук")),
                    new BlockItem("Комплект силовой коммутации", "power", 1, "Питание оборудования, удлинители, распределение нагрузки.", List.of("питание", "силовая")),
                    new BlockItem("Сетевой комплект", "network", 1, "LAN/Wi-Fi, резервная сеть и подключение оборудования.", List.of("сеть", "роутер")),
                    new BlockItem("Монтаж/демонтаж, человеко-смена", "labor", 2, "Погрузка, монтаж, настройка и демонтаж оборудования.", List.of("монтаж")),
                    new BlockItem("Технический руководитель проекта", "labor", 1, "Ответственный за схему, тайминг, площадку и запуск.", List.of("технический руководитель")),
                    new BlockItem("Звукорежиссёр", "labor", 1, "Настройка и ведение звука во время мероприятия.", List.of("звукорежиссер")),
                    new BlockItem("Видеоинженер / режиссёр трансляции", "labor", 1, "Контроль камер, сигнала, записи и вывода на экран/эфир.", List.of("видеоинженер", "режиссер трансляции")),
                    new BlockItem("Грузовой транспорт", "transport", 1, "Доставка оборудования на площадку и обратно.", List.of("транспорт")))));

    /**
     * Локальные требования по тексту ТЗ: правила по ключевым словам + продакшн-план
     * по профилю. Тип мероприятия добавляется к тексту, чтобы профиль учитывал и его.
     */
    public List<RequirementItem> plan(String text, String eventType) {
        String normalized = EstimateText.normalize(safe(text) + " " + safe(eventType));
        List<RequirementItem> out = new ArrayList<>();

        for (Need rule : NEED_RULES) {
            if (rule.keys().stream().anyMatch(key -> normalized.contains(EstimateText.normalize(key)))) {
                out.add(new RequirementItem(rule.name(), rule.type(), "", rule.quantity(), rule.reason(),
                        null, null, rule.keys(), "local"));
            }
        }

        Profile profile = inferProfile(normalized);
        for (Block block : PRODUCTION_BLOCKS) {
            if (!block.when().test(profile)) {
                continue;
            }
            for (BlockItem item : block.items()) {
                out.add(new RequirementItem(item.name(), item.type(), "", item.quantity(), item.reason(),
                        null, null, item.keywords(), "local"));
            }
        }
        return out;
    }

    /** Однородные типы — общий «страховочный» блок не дублирует уже покрытый тип. */
    public boolean isHomogeneous(String type) {
        return "camera".equals(type) || "transport".equals(type);
    }

    private static boolean hasAny(String normalized, String... keys) {
        for (String key : keys) {
            if (normalized.contains(EstimateText.normalize(key))) {
                return true;
            }
        }
        return false;
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }
}
