package com.streamdesk.estimate;

import com.streamdesk.config.ApiException;
import com.streamdesk.equipment.Equipment;
import com.streamdesk.estimate.EstimateMatchingService.MatchQuery;
import com.streamdesk.estimate.EstimateMatchingService.MatchResult;
import com.streamdesk.estimate.EstimateMatchingService.PriceResolution;
import com.streamdesk.estimate.dto.EstimateAnalyzeRequest;
import com.streamdesk.estimate.dto.EstimateLine;
import com.streamdesk.estimate.dto.EstimateMissingLine;
import com.streamdesk.estimate.dto.EstimateResult;
import com.streamdesk.estimate.dto.EstimateShiftCalculation;
import com.streamdesk.estimate.dto.PriceOverride;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Оркестратор сборки сметы — порт buildEstimate + эндпоинта /api/estimates/analyze
 * (estimate-engine.ts, routes.ts).
 *
 * Поток: текст ТЗ (тело + файл) → каталог склада → расчёт смен → ИИ-подбор
 * (SD-157) → локальный продакшн-план → сопоставление со складом и разрешение
 * цены (SD-152) → строки, итоги, дефицит. ИИ-позиции получают source="ai",
 * локальные — source="local". При requireAi и сбое ИИ — ApiException (без фолбэка).
 */
@Service
public class EstimateService {

    private static final Logger log = LoggerFactory.getLogger(EstimateService.class);

    private final CatalogService catalogService;
    private final EstimateMatchingService matchingService;
    private final EstimateAiService aiService;
    private final LocalRequirementPlanner localPlanner;
    private final ShiftCalculator shiftCalculator;
    private final FileTextExtractor fileTextExtractor;

    public EstimateService(CatalogService catalogService,
                           EstimateMatchingService matchingService,
                           EstimateAiService aiService,
                           LocalRequirementPlanner localPlanner,
                           ShiftCalculator shiftCalculator,
                           FileTextExtractor fileTextExtractor) {
        this.catalogService = catalogService;
        this.matchingService = matchingService;
        this.aiService = aiService;
        this.localPlanner = localPlanner;
        this.shiftCalculator = shiftCalculator;
        this.fileTextExtractor = fileTextExtractor;
    }

    public EstimateResult analyze(EstimateAnalyzeRequest request, MultipartFile file, List<Equipment> equipment) {
        String title = request != null && request.title() != null && !request.title().isBlank()
                ? request.title().trim()
                : "Смета";
        String bodyText = request != null && request.text() != null ? request.text() : "";
        String fileText = fileTextExtractor.extract(file);
        String text = (title + "\n" + bodyText + "\n" + fileText).trim();
        String eventType = request != null ? request.eventType() : null;
        // Ручные переопределения цены/аренды пока приходят пустыми (модель готова к расширению контракта).
        List<PriceOverride> overrides = List.of();

        List<Equipment> safeEquipment = equipment == null ? List.of() : equipment;
        List<CatalogEntry> catalog = catalogService.buildCatalog(safeEquipment);
        EstimateShiftCalculation shift = shiftCalculator.compute(request);
        double shiftFactor = shift != null && shift.chargeFactor() > 0 ? shift.chargeFactor() : 1;

        // ─── ИИ-подбор (SD-157): при сбое и requireAi — ошибка, иначе тихий фолбэк ───
        List<RequirementItem> aiItems = new ArrayList<>();
        boolean aiUsed = false;
        String aiError = null;
        boolean requireAi = request != null && request.requireAi();
        if (aiService.isConfigured() && !text.isBlank()) {
            try {
                aiItems = aiService.suggest(title, text, eventType, catalog);
                aiUsed = true;
            } catch (ApiException e) {
                if (requireAi) {
                    throw e;
                }
                aiError = e.getMessage();
                log.warn("[Estimates] ИИ-подбор не удался: {}", aiError);
            }
        } else if (requireAi && !aiService.isConfigured()) {
            throw new ApiException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
                    "ИИ обязателен (requireAi), но не задан DEEPSEEK_API_KEY");
        }

        // ─── Сборка строк: сначала ИИ-позиции, затем локальный план ───
        List<EstimateLine> lines = new ArrayList<>();
        Set<String> usedCatalog = new HashSet<>();
        Set<String> seenKeys = new HashSet<>();

        for (RequirementItem item : aiItems) {
            tryAdd(item, false, lines, catalog, usedCatalog, seenKeys, shiftFactor, overrides);
        }
        for (RequirementItem item : localPlanner.plan(text, eventType)) {
            // Однородные типы (камера/транспорт) — не добавляем второй раз страховочным блоком.
            tryAdd(item, localPlanner.isHomogeneous(item.type()), lines, catalog, usedCatalog, seenKeys, shiftFactor, overrides);
        }

        return assembleResult(title, lines, catalog, safeEquipment, shift, aiUsed, aiError, file, fileText);
    }

    private void tryAdd(RequirementItem req, boolean homogeneous, List<EstimateLine> lines,
                        List<CatalogEntry> catalog, Set<String> usedCatalog, Set<String> seenKeys,
                        double shiftFactor, List<PriceOverride> overrides) {
        String key = dedupeKey(req.name(), req.type(), req.model());
        if (seenKeys.contains(key) || isConceptDuplicate(req, lines)) {
            return;
        }
        if (homogeneous && lines.stream().anyMatch(l -> l.type().equals(req.type()))) {
            return;
        }
        MatchResult match = matchingService.matchCatalog(catalog,
                new MatchQuery(req.name(), req.model(), req.type(), req.keywords()), usedCatalog);
        CatalogEntry entry = match != null ? match.entry() : null;
        if (entry != null) {
            usedCatalog.add(entry.getId());
        }
        EstimateLine line = buildLine(req, entry, match, shiftFactor, overrides);
        seenKeys.add(key);
        seenKeys.add(dedupeKey(line.name(), line.type(), line.model()));
        lines.add(line);
    }

    private EstimateLine buildLine(RequirementItem req, CatalogEntry entry, MatchResult match,
                                   double shiftFactor, List<PriceOverride> overrides) {
        int quantity = Math.max(1, req.quantity());
        PriceResolution price = matchingService.resolvePrice(req.name(), req.type(), entry, req.unitPrice(), overrides);
        double baseTotal = EstimateText.round2(quantity * price.unitPrice());
        double total = EstimateText.round2(baseTotal * shiftFactor);

        boolean fromWarehouse = entry != null;
        String name = fromWarehouse ? entry.getName() : req.name();
        String type = fromWarehouse ? entry.getType() : req.type();
        String model = fromWarehouse ? entry.getModel() : nz(req.model());
        List<String> equipmentIds = fromWarehouse ? List.copyOf(entry.getEquipmentIds()) : List.of();
        int availableQty = fromWarehouse ? entry.getAvailableQty() : 0;
        int totalQty = fromWarehouse ? entry.getTotalQty() : 0;
        String availability = availableQty >= quantity ? "in_stock" : availableQty > 0 ? "partial" : "unavailable";

        double confidence = match != null
                ? clamp(match.confidence(), 0.6, 0.99)
                : clamp(req.confidence() != null ? req.confidence() : ("ai".equals(req.source()) ? 0.65 : 0.7), 0.45, 0.9);

        String prefix = "ai".equals(req.source()) ? "ai" : "wh";
        return new EstimateLine(
                prefix + "-" + UUID.randomUUID(),
                fromWarehouse ? entry.getId() : "",
                equipmentIds,
                name,
                type,
                model,
                quantity,
                availableQty,
                totalQty,
                price.unitPrice(),
                baseTotal,
                shiftFactor,
                total,
                price.priceSource(),
                availability,
                price.priceStatus(),
                EstimateText.round2(confidence),
                req.reason(),
                price.locations() == null ? List.of() : List.copyOf(price.locations()),
                req.source());
    }

    private EstimateResult assembleResult(String title, List<EstimateLine> lines, List<CatalogEntry> catalog,
                                          List<Equipment> equipment, EstimateShiftCalculation shift,
                                          boolean aiUsed, String aiError, MultipartFile file, String fileText) {
        double subtotal = lines.stream().mapToDouble(EstimateLine::total).sum();
        int quantity = lines.stream().mapToInt(EstimateLine::quantity).sum();
        int missingPrices = (int) lines.stream().filter(l -> l.unitPrice() <= 0).count();
        int availabilityIssues = (int) lines.stream().filter(l -> !"in_stock".equals(l.availability())).count();

        // Дефицит: нет на складе ИЛИ нет цены (priceStatus=no_price) — нужно уточнить аренду/субподряд.
        List<EstimateMissingLine> missing = new ArrayList<>();
        for (EstimateLine line : lines) {
            if ("unavailable".equals(line.availability()) || line.equipmentIds().isEmpty()
                    || "no_price".equals(line.priceStatus())) {
                missing.add(new EstimateMissingLine(line.name(), line.type(), line.quantity(), line.reason()));
            }
        }

        long matchedCount = lines.stream().filter(l -> !l.equipmentIds().isEmpty()).count();
        List<String> warnings = new ArrayList<>();
        if (shift != null && shift.warnings() != null) {
            warnings.addAll(shift.warnings());
        }
        if (!aiUsed && aiError == null) {
            warnings.add("ИИ не задействован: смета собрана анализом ТЗ и складом. Задайте DEEPSEEK_API_KEY для более точного подбора.");
        }
        if (aiError != null) {
            warnings.add("ИИ не смог дополнить смету — использован складской и эвристический подбор.");
        }
        if (!missing.isEmpty()) {
            warnings.add("Позиций под аренду/субподряд: " + missing.size() + ". Их нет на складе или нужно уточнить цену.");
        }

        String summary = lines.isEmpty()
                ? "По ТЗ не удалось уверенно выделить оборудование. Уточните формат мероприятия, площадку, аудиторию, трансляцию, звук, свет и экраны."
                : "Смета собрана по ТЗ: " + lines.size() + " позиций, " + matchedCount
                + " подобрано со склада с реальными ценами и наличием. Включены оборудование, коммутация, персонал и логистика.";

        EstimateResult.CatalogStats stats = new EstimateResult.CatalogStats(
                catalog.size(),
                (int) catalog.stream().filter(e -> e.getUnitPrice() > 0).count(),
                equipment.size(),
                (int) equipment.stream().filter(e -> "available".equals(e.getStatus())).count());

        EstimateResult.Document document = file != null && !file.isEmpty()
                ? new EstimateResult.Document(file.getOriginalFilename(), fileText == null ? 0 : fileText.length())
                : null;

        return new EstimateResult(
                title,
                aiUsed ? "ai" : "heuristic",
                summary,
                lines,
                missing,
                warnings,
                new EstimateResult.Totals(EstimateText.round2(subtotal), lines.size(), quantity, missingPrices, availabilityIssues),
                stats,
                document,
                shift,
                null);
    }

    // ─── Дедупликация (порт dedupeKey/isConceptDuplicate) ───

    private static String dedupeKey(String name, String type, String model) {
        String key = EstimateText.normalize(nz(type) + " " + nz(name) + " " + nz(model));
        return key.length() > 40 ? key.substring(0, 40) : key;
    }

    /**
     * Требование считается дубликатом, если позиция того же типа уже есть и более
     * короткое (обобщённое, 1–2 слова) название целиком вложено в другое, либо
     * наборы значимых токенов совпадают. Сливает общий «Видеомикшер» со складским
     * «Видеомикшер ATEM Mini», но не схлопывает ручную и петличную радиосистемы.
     */
    private static boolean isConceptDuplicate(RequirementItem req, List<EstimateLine> lines) {
        String reqName = EstimateText.normalize(req.name());
        List<String> reqTokens = splitWords(reqName);
        for (EstimateLine line : lines) {
            if (!line.type().equals(req.type())) {
                continue;
            }
            String lineName = EstimateText.normalize(line.name());
            String shorter = reqName.length() <= lineName.length() ? reqName : lineName;
            String longer = shorter.equals(reqName) ? lineName : reqName;
            List<String> shorterTokens = splitWords(shorter);
            if (shorterTokens.size() <= 2 && longer.contains(shorter)) {
                return true;
            }
            List<String> lineTokens = splitWords(lineName);
            if (!reqTokens.isEmpty() && lineTokens.containsAll(reqTokens) && reqTokens.containsAll(lineTokens)) {
                return true;
            }
        }
        return false;
    }

    private static List<String> splitWords(String value) {
        List<String> out = new ArrayList<>();
        for (String w : value.split(" ")) {
            if (!w.isBlank()) {
                out.add(w);
            }
        }
        return out;
    }

    private static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    private static String nz(String value) {
        return value == null ? "" : value;
    }
}
