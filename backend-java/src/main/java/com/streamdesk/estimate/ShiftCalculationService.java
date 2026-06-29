package com.streamdesk.estimate;

import com.streamdesk.estimate.dto.CalculateRequest;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Серверный расчёт оплаты труда по сменам — единственный источник истины.
 * Формула (подтверждённая):
 *  • часы: из диапазона дат (минута за минутой) либо «смены × часы/смена» вручную;
 *  • сегменты будни/выходные × день/ночь, выходной = Сб/Вс или holidayDates,
 *    workdayDates делает день будним;
 *  • shifts = ceil((hours/shiftHours)/step) × step; amountFactor = shifts × coefficient;
 *  • chargeFactor = Σ amountFactor; lineTotal = baseTotal × chargeFactor; subtotal = Σ lineTotal.
 * Все денежные/часовые значения округляются до 2 знаков.
 */
@Service
public class ShiftCalculationService {

    private static final String[] KINDS = {"weekday_day", "weekday_night", "weekend_day", "weekend_night"};
    private static final String[] LABELS = {"Будни день", "Будни ночь", "Выходные день", "Выходные ночь"};
    // Ограничение на размер интервала, чтобы не уйти в гигантский цикл (минуты).
    private static final long MAX_MINUTES = 366L * 24 * 60;

    public Map<String, Object> calculate(CalculateRequest req) {
        double shiftHours = positive(parseDouble(req.shiftHours(), 10), 10);
        double step = positive(parseDouble(req.roundingStep(), 0.5), 0.5);
        int dayStart = clampHour(parseDouble(req.dayStartHour(), 8));
        int nightStart = clampHour(parseDouble(req.nightStartHour(), 22));
        double[] coeffs = {
                parseDouble(req.weekdayDayCoefficient(), 1),
                parseDouble(req.weekdayNightCoefficient(), 1.5),
                parseDouble(req.weekendDayCoefficient(), 1.5),
                parseDouble(req.weekendNightCoefficient(), 2),
        };
        Set<LocalDate> holidays = parseDates(req.holidayDates());
        Set<LocalDate> workdays = parseDates(req.workdayDates());

        List<String> warnings = new ArrayList<>();
        LocalDateTime start = parseDateTime(req.startAt());
        LocalDateTime end = parseDateTime(req.endAt());

        // Часы по 4 видам сегментов.
        double[] kindHours = new double[4];
        String source;
        double actualHours;

        if (start != null && end != null && end.isAfter(start)) {
            source = "dates";
            long totalMinutes = Duration.between(start, end).toMinutes();
            if (totalMinutes > MAX_MINUTES) {
                totalMinutes = MAX_MINUTES;
                warnings.add("Интервал слишком большой — ограничен 366 днями");
            }
            actualHours = totalMinutes / 60.0;
            for (long m = 0; m < totalMinutes; m++) {
                LocalDateTime t = start.plusMinutes(m);
                boolean day = t.getHour() >= dayStart && t.getHour() < nightStart;
                boolean weekend = isWeekend(t.toLocalDate(), holidays, workdays);
                int idx = (weekend ? 2 : 0) + (day ? 0 : 1);
                kindHours[idx] += 1.0 / 60.0;
            }
        } else {
            source = "manual";
            double manualShifts = Math.max(0, parseDouble(req.manualShiftCount(), 1));
            actualHours = manualShifts * shiftHours;
            // Без дат всё считаем как будни-день (нет данных о ночи/выходных).
            kindHours[0] = actualHours;
            if (start != null && end != null && !end.isAfter(start)) {
                warnings.add("Окончание не позже начала — использован ручной расчёт смен");
            }
        }

        List<Map<String, Object>> segments = new ArrayList<>();
        double chargeFactor = 0;
        for (int i = 0; i < 4; i++) {
            if (kindHours[i] <= 0) {
                continue;
            }
            double shifts = ceilToStep(kindHours[i] / shiftHours, step);
            double amountFactor = round2(shifts * coeffs[i]);
            chargeFactor += amountFactor;
            Map<String, Object> seg = new LinkedHashMap<>();
            seg.put("kind", KINDS[i]);
            seg.put("label", LABELS[i]);
            seg.put("hours", round2(kindHours[i]));
            seg.put("shifts", shifts);
            seg.put("coefficient", coeffs[i]);
            seg.put("amountFactor", amountFactor);
            segments.add(seg);
        }
        chargeFactor = round2(chargeFactor);
        double chargeableShifts = ceilToStep(actualHours / shiftHours, step);

        Map<String, Object> shiftCalculation = new LinkedHashMap<>();
        shiftCalculation.put("source", source);
        shiftCalculation.put("startAt", start != null ? req.startAt() : null);
        shiftCalculation.put("endAt", end != null ? req.endAt() : null);
        shiftCalculation.put("actualHours", round2(actualHours));
        shiftCalculation.put("shiftHours", round2(shiftHours));
        shiftCalculation.put("roundingStep", step);
        shiftCalculation.put("chargeableShifts", chargeableShifts);
        shiftCalculation.put("chargeFactor", chargeFactor);
        shiftCalculation.put("segments", segments);
        shiftCalculation.put("warnings", warnings);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("shiftCalculation", shiftCalculation);
        Map<String, Object> recomputed = recomputeItems(req.items(), chargeFactor);
        result.put("items", recomputed.get("items"));
        result.put("totals", recomputed.get("totals"));
        return result;
    }

    /** Пересчёт строк сметы с применением chargeFactor — формула один-в-один с фронтом. */
    private Map<String, Object> recomputeItems(List<Map<String, Object>> rawItems, double chargeFactor) {
        List<Map<String, Object>> items = new ArrayList<>();
        double subtotal = 0;
        int quantitySum = 0;
        int missingPrices = 0;
        int availabilityIssues = 0;

        if (rawItems != null) {
            for (Map<String, Object> raw : rawItems) {
                Map<String, Object> line = new LinkedHashMap<>(raw);
                int quantity = (int) Math.max(1, Math.round(parseDouble(str(raw.get("quantity")), 1)));
                double unitPrice = Math.max(0, parseDouble(str(raw.get("unitPrice")), 0));
                int availableQty = (int) Math.max(0, Math.round(parseDouble(str(raw.get("availableQty")), 0)));
                double baseTotal = round2(quantity * unitPrice);
                double total = round2(baseTotal * chargeFactor);

                String availability = availableQty >= quantity
                        ? "in_stock"
                        : availableQty > 0 ? "partial" : "unavailable";

                line.put("quantity", quantity);
                line.put("unitPrice", unitPrice);
                line.put("baseTotal", baseTotal);
                line.put("shiftFactor", chargeFactor);
                line.put("total", total);
                line.put("priceStatus", unitPrice > 0 ? "priced" : "no_price");
                line.put("availability", availability);

                subtotal += total;
                quantitySum += quantity;
                if (unitPrice <= 0) {
                    missingPrices++;
                }
                if (!"in_stock".equals(availability)) {
                    availabilityIssues++;
                }
                items.add(line);
            }
        }

        Map<String, Object> totals = new LinkedHashMap<>();
        totals.put("subtotal", round2(subtotal));
        totals.put("lines", items.size());
        totals.put("quantity", quantitySum);
        totals.put("missingPrices", missingPrices);
        totals.put("availabilityIssues", availabilityIssues);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("totals", totals);
        return out;
    }

    private boolean isWeekend(LocalDate date, Set<LocalDate> holidays, Set<LocalDate> workdays) {
        if (workdays.contains(date)) {
            return false; // принудительно рабочий день
        }
        DayOfWeek dow = date.getDayOfWeek();
        if (dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY) {
            return true;
        }
        return holidays.contains(date);
    }

    // --- утилиты ---

    private double ceilToStep(double value, double step) {
        if (step <= 0) {
            return round2(value);
        }
        double n = value / step;
        // эпсилон против переполнения из-за двоичной погрешности (например, 4.0 → 4.0000001)
        double rounded = Math.ceil(n - 1e-9);
        return round2(rounded * step);
    }

    private static double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    private static double positive(double value, double fallback) {
        return value > 0 ? value : fallback;
    }

    private static int clampHour(double value) {
        int h = (int) Math.round(value);
        if (h < 0) return 0;
        if (h > 23) return 23;
        return h;
    }

    private static String str(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private static double parseDouble(String value, double fallback) {
        if (value == null) {
            return fallback;
        }
        String cleaned = value.trim().replace(",", ".");
        if (cleaned.isEmpty()) {
            return fallback;
        }
        try {
            return Double.parseDouble(cleaned);
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private static LocalDateTime parseDateTime(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String v = value.trim();
        try {
            // datetime-local: "2026-05-23T08:00" или с секундами
            return LocalDateTime.parse(v);
        } catch (Exception ignored) {
            // ничего
        }
        try {
            return LocalDateTime.parse(v, DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm"));
        } catch (Exception ignored) {
            return null;
        }
    }

    private static final DateTimeFormatter ISO_DATE = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter DOT_DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");

    private static Set<LocalDate> parseDates(String value) {
        Set<LocalDate> dates = new HashSet<>();
        if (value == null || value.isBlank()) {
            return dates;
        }
        for (String token : value.split("[,;\\s]+")) {
            String t = token.trim();
            if (t.isEmpty()) {
                continue;
            }
            LocalDate date = tryParseDate(t);
            if (date != null) {
                dates.add(date);
            }
        }
        return dates;
    }

    private static LocalDate tryParseDate(String token) {
        try {
            return LocalDate.parse(token, ISO_DATE);
        } catch (Exception ignored) {
            // следующий формат
        }
        try {
            return LocalDate.parse(token, DOT_DATE);
        } catch (Exception ignored) {
            return null;
        }
    }
}
