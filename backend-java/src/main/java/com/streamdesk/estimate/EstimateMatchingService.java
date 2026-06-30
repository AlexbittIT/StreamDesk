package com.streamdesk.estimate;

import com.streamdesk.estimate.dto.PriceOverride;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Умное сопоставление требований сметы со складом (SD-152) — порт matchCatalog +
 * TYPE_ALIASES из estimate-engine.ts.
 *
 * Делает три вещи:
 * 1) токен-скоринг требования против каталога (с порогом и доверием/confidence);
 * 2) предварительную фильтрацию каталога по типам из ТЗ для грундинга промпта ИИ
 *    (не слать весь каталог, но и не резать наивным slice);
 * 3) разрешение цены: реальный склад → ручное переопределение → оценка ИИ →
 *    иначе no_price (в дефицит).
 */
@Service
public class EstimateMatchingService {

    // Синонимы типов оборудования — порт TYPE_ALIASES. Канон-тип → обозначения в ТЗ/каталоге.
    private static final Map<String, List<String>> TYPE_ALIASES = Map.ofEntries(
            Map.entry("audio", List.of("audio", "микшер", "пульт", "акустик", "колон", "сабвуфер", "монитор сцен", "усилит")),
            Map.entry("microphone", List.of("microphone", "mic", "микрофон", "радиосистем", "петлич", "радиомикрофон")),
            Map.entry("camera", List.of("camera", "камер")),
            Map.entry("video", List.of("video", "видеомикшер", "atem", "switcher", "процессор", "коммутатор видео", "рекордер")),
            Map.entry("computer", List.of("computer", "компьютер", "ноутбук", "vmix", "медиасервер", "resolume", "сервер")),
            Map.entry("display", List.of("display", "экран", "монитор", "led", "дисплей", "телевизор")),
            Map.entry("lighting", List.of("lighting", "свет", "прожектор", "прибор", "wash", "beam", "dmx", "пульт свет")),
            Map.entry("network", List.of("network", "сеть", "роутер", "router", "switch", "коммутатор", "lan")),
            Map.entry("power", List.of("power", "питание", "удлинит", "дистрибьютор", "стабилизатор")),
            Map.entry("cable", List.of("cable", "кабель", "коммутац", "переходник", "сплиттер")),
            Map.entry("effects", List.of("effects", "дым", "хейзер", "туман", "конфетти"))
    );

    /** Требование к подбору: имя/модель/тип и ключевые слова-фразы. */
    public record MatchQuery(String name, String model, String type, List<String> keywords) {
    }

    /** Результат сопоставления: запись каталога, скоринг и доверие. */
    public record MatchResult(CatalogEntry entry, double score, double confidence) {
    }

    /** Разрешённая цена позиции: значение, источник, статус и связанные локации. */
    public record PriceResolution(double unitPrice, String priceSource, String priceStatus, List<String> locations) {
    }

    /**
     * Подбор лучшей записи каталога под требование. Порог: либо явное совпадение
     * по типу, либо хотя бы одно совпадение по токену названия (score ≥ 6).
     * Уже занятые записи (used) пропускаются.
     */
    public MatchResult matchCatalog(List<CatalogEntry> catalog, MatchQuery query, Set<String> used) {
        List<String> wantedTokens = EstimateText.tokens(joinNonBlank(query.name(), query.model()));
        List<String> keywordTokens = new ArrayList<>();
        if (query.keywords() != null) {
            for (String keyword : query.keywords()) {
                String n = EstimateText.normalize(keyword);
                if (!n.isEmpty()) {
                    keywordTokens.add(n);
                }
            }
        }

        MatchResult best = null;
        for (CatalogEntry entry : catalog) {
            if (used != null && used.contains(entry.getId())) {
                continue;
            }
            double score = typeMatchScore(entry.getType(), query.type(), entry.getSearch());

            int tokenHits = 0;
            for (String token : wantedTokens) {
                if (entry.getSearch().contains(token)) {
                    tokenHits++;
                    score += 4;
                }
            }
            for (String keyword : keywordTokens) {
                if (!keyword.isEmpty() && entry.getSearch().contains(keyword)) {
                    score += 3;
                }
            }
            if (entry.getAvailableQty() > 0) {
                score += 2;
            }
            if (entry.getUnitPrice() > 0) {
                score += 1;
            }
            if (score <= 0) {
                continue;
            }

            double nameConfidence = wantedTokens.isEmpty()
                    ? 0
                    : Math.min(1.0, (double) tokenHits / wantedTokens.size());
            double confidence = Math.max(0.5, Math.min(0.98,
                    0.55 + nameConfidence * 0.4 + (score > 10 ? 0.05 : 0)));
            if (best == null || score > best.score()) {
                best = new MatchResult(entry, score, confidence);
            }
        }
        return best != null && best.score() >= 6 ? best : null;
    }

    private double typeMatchScore(String itemType, String wantedType, String itemSearch) {
        if (wantedType == null || wantedType.isBlank()) {
            return 0;
        }
        if (wantedType.equals(itemType)) {
            return 6;
        }
        List<String> aliases = TYPE_ALIASES.getOrDefault(wantedType, List.of());
        String haystack = nz(itemType) + " " + nz(itemSearch);
        for (String alias : aliases) {
            if (haystack.contains(alias)) {
                return 4;
            }
        }
        return 0;
    }

    // ─── Грундинг каталога в промпт ИИ (предфильтр по типам из ТЗ) ───────────────

    /** Типы оборудования, упомянутые в ТЗ (по синонимам) — сигнал для предфильтра. */
    public Set<String> inferWantedTypes(String text) {
        String n = EstimateText.normalize(text);
        Set<String> types = new LinkedHashSet<>();
        if (n.isEmpty()) {
            return types;
        }
        for (Map.Entry<String, List<String>> e : TYPE_ALIASES.entrySet()) {
            if (n.contains(e.getKey())) {
                types.add(e.getKey());
                continue;
            }
            for (String alias : e.getValue()) {
                if (n.contains(alias)) {
                    types.add(e.getKey());
                    break;
                }
            }
        }
        return types;
    }

    /**
     * Подмножество каталога для промпта ИИ. Если каталог не больше лимита —
     * отдаём целиком; иначе берём в первую очередь записи релевантных типов
     * (по равенству типа или попаданию синонима), сортируя по полезности
     * (наличие, затем наличие цены), и добиваем остатком до лимита. Не наивный slice.
     */
    public List<CatalogEntry> filterForPrompt(List<CatalogEntry> catalog, Collection<String> wantedTypes, int limit) {
        if (catalog == null || catalog.isEmpty()) {
            return List.of();
        }
        if (catalog.size() <= limit) {
            return new ArrayList<>(catalog);
        }
        Set<String> wanted = wantedTypes == null ? Set.of() : new HashSet<>(wantedTypes);
        List<CatalogEntry> relevant = new ArrayList<>();
        List<CatalogEntry> rest = new ArrayList<>();
        for (CatalogEntry entry : catalog) {
            if (isRelevant(entry, wanted)) {
                relevant.add(entry);
            } else {
                rest.add(entry);
            }
        }
        Comparator<CatalogEntry> byUsefulness = Comparator
                .comparingInt((CatalogEntry e) -> e.getAvailableQty() > 0 ? 1 : 0)
                .thenComparingInt(e -> e.getUnitPrice() > 0 ? 1 : 0)
                .reversed();
        relevant.sort(byUsefulness);
        rest.sort(byUsefulness);

        List<CatalogEntry> out = new ArrayList<>(limit);
        for (CatalogEntry entry : relevant) {
            if (out.size() >= limit) {
                break;
            }
            out.add(entry);
        }
        for (CatalogEntry entry : rest) {
            if (out.size() >= limit) {
                break;
            }
            out.add(entry);
        }
        return out;
    }

    private boolean isRelevant(CatalogEntry entry, Set<String> wanted) {
        if (wanted.isEmpty()) {
            return false;
        }
        if (wanted.contains(entry.getType())) {
            return true;
        }
        String haystack = nz(entry.getType()) + " " + nz(entry.getSearch());
        for (String wantedType : wanted) {
            for (String alias : TYPE_ALIASES.getOrDefault(wantedType, List.of())) {
                if (haystack.contains(alias)) {
                    return true;
                }
            }
        }
        return false;
    }

    // ─── Разрешение цены (склад → ручное переопределение → ИИ → no_price) ───────

    /** Ручное переопределение под позицию: по типу (если задан) и нечёткому совпадению имени. */
    public Optional<PriceOverride> findOverride(String name, String type, List<PriceOverride> overrides) {
        if (overrides == null || overrides.isEmpty()) {
            return Optional.empty();
        }
        String wantName = EstimateText.normalize(name);
        for (PriceOverride override : overrides) {
            if (override == null || override.unitPrice() <= 0) {
                continue;
            }
            boolean typeOk = override.type() == null || override.type().isBlank()
                    || override.type().equals(type);
            String on = EstimateText.normalize(override.name());
            boolean nameOk = !on.isEmpty() && !wantName.isEmpty()
                    && (on.equals(wantName) || wantName.contains(on) || on.contains(wantName));
            if (typeOk && nameOk) {
                return Optional.of(override);
            }
        }
        return Optional.empty();
    }

    /**
     * Цена позиции по приоритету: (1) ручное переопределение/аренда → (2) реальный
     * склад → (3) оценка ИИ → (4) нет цены (no_price, попадёт в дефицит).
     * Источник «manual:&lt;поставщик&gt;» и локация аренды сохраняются в строке.
     */
    public PriceResolution resolvePrice(String name, String type, CatalogEntry matched,
                                        Double aiUnitPrice, List<PriceOverride> overrides) {
        Optional<PriceOverride> override = findOverride(name, type, overrides);
        if (override.isPresent()) {
            PriceOverride o = override.get();
            StringBuilder source = new StringBuilder("manual");
            if (o.rentalVendor() != null && !o.rentalVendor().isBlank()) {
                source.append(":").append(o.rentalVendor().trim());
            }
            List<String> locations = new ArrayList<>();
            if (o.rentalLocation() != null && !o.rentalLocation().isBlank()) {
                locations.add(o.rentalLocation().trim());
            }
            return new PriceResolution(EstimateText.round2(o.unitPrice()), source.toString(), "priced", locations);
        }
        if (matched != null && matched.getUnitPrice() > 0) {
            String source = matched.getPriceSource() == null || matched.getPriceSource().isBlank()
                    ? "warehouse"
                    : matched.getPriceSource();
            return new PriceResolution(matched.getUnitPrice(), source, "priced", matched.getLocations());
        }
        if (aiUnitPrice != null && aiUnitPrice > 0) {
            List<String> locations = matched != null ? matched.getLocations() : List.of();
            return new PriceResolution(EstimateText.round2(aiUnitPrice), "ai_estimate", "priced", locations);
        }
        List<String> locations = matched != null ? matched.getLocations() : List.of();
        return new PriceResolution(0, "", "no_price", locations);
    }

    private static String joinNonBlank(String... parts) {
        StringBuilder sb = new StringBuilder();
        for (String part : parts) {
            if (part != null && !part.isBlank()) {
                if (sb.length() > 0) {
                    sb.append(" ");
                }
                sb.append(part);
            }
        }
        return sb.toString();
    }

    private static String nz(String value) {
        return value == null ? "" : value;
    }
}
