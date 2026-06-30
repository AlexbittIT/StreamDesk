package com.streamdesk.estimate;

import com.streamdesk.estimate.dto.EstimateAnalyzeRequest;
import com.streamdesk.estimate.dto.EstimateShiftCalculation;
import com.streamdesk.estimate.dto.EstimateShiftSegment;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Расчёт смен с коэффициентами — порт computeShift из estimate-engine.ts.
 *
 * Если заданы корректные start/end — почасовой проход с классификацией каждого
 * часа (будни/выходные × день/ночь, с учётом праздников и рабочих дат). Иначе —
 * ручной расчёт по числу смен. Итоговый chargeFactor идёт множителем в строки сметы.
 */
@Service
public class ShiftCalculator {

    private static final Pattern DMY = Pattern.compile("^(\\d{1,2})[.\\/](\\d{1,2})[.\\/](\\d{4})$");
    private static final Pattern ISO_DATE = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}");
    private static final DateTimeFormatter DATE_KEY = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private static final Map<String, String> SEGMENT_LABELS = Map.of(
            "weekday_day", "Будни, день",
            "weekday_night", "Будни, ночь",
            "weekend_day", "Выходные, день",
            "weekend_night", "Выходные, ночь");

    public EstimateShiftCalculation compute(EstimateAnalyzeRequest p) {
        double shiftHours = Math.max(1, num(p.shiftHours(), 10));
        double roundingStep = Math.max(0, num(p.roundingStep(), 0.5));
        double dayStart = Math.min(23, Math.max(0, num(p.dayStartHour(), 8)));
        double nightStart = Math.min(24, Math.max(0, num(p.nightStartHour(), 22)));
        Map<String, Double> coeff = Map.of(
                "weekday_day", Math.max(0, num(p.weekdayDayCoefficient(), 1)),
                "weekday_night", Math.max(0, num(p.weekdayNightCoefficient(), 1.5)),
                "weekend_day", Math.max(0, num(p.weekendDayCoefficient(), 1.5)),
                "weekend_night", Math.max(0, num(p.weekendNightCoefficient(), 2)));
        Set<String> holidays = parseDateSet(p.holidayDates());
        Set<String> workdays = parseDateSet(p.workdayDates());
        List<String> warnings = new ArrayList<>();

        // Часы по тарифам — сохраняем порядок weekday_day → weekend_night.
        Map<String, Double> hoursByKind = new LinkedHashMap<>();
        hoursByKind.put("weekday_day", 0.0);
        hoursByKind.put("weekday_night", 0.0);
        hoursByKind.put("weekend_day", 0.0);
        hoursByKind.put("weekend_night", 0.0);

        OffsetDateTime start = parseDate(p.startAt());
        OffsetDateTime end = parseDate(p.endAt());
        String source = "manual";
        double actualHours;
        String startAtIso = null;
        String endAtIso = null;

        if (start != null && end != null && end.isAfter(start)) {
            source = "dates";
            startAtIso = start.toInstant().toString();
            endAtIso = end.toInstant().toString();
            actualHours = EstimateText.round2(Duration.between(start, end).toMillis() / 3_600_000.0);
            OffsetDateTime cursor = start;
            int guard = 0;
            while (cursor.isBefore(end) && guard < 24 * 366) {
                OffsetDateTime next = cursor.plusHours(1);
                if (next.isAfter(end)) {
                    next = end;
                }
                double fraction = Duration.between(cursor, next).toMillis() / 3_600_000.0;
                String dateKey = cursor.format(DATE_KEY);
                DayOfWeek dow = cursor.getDayOfWeek();
                boolean weekend = dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY;
                if (holidays.contains(dateKey)) {
                    weekend = true;
                }
                if (workdays.contains(dateKey)) {
                    weekend = false;
                }
                int hour = cursor.getHour();
                boolean isDay = nightStart > dayStart
                        ? hour >= dayStart && hour < nightStart
                        : hour >= dayStart || hour < nightStart;
                String kind = weekend
                        ? (isDay ? "weekend_day" : "weekend_night")
                        : (isDay ? "weekday_day" : "weekday_night");
                hoursByKind.merge(kind, fraction, Double::sum);
                cursor = next;
                guard++;
            }
        } else {
            if (notBlank(p.startAt()) || notBlank(p.endAt())) {
                warnings.add("Даты заданы не полностью — использован ручной расчёт смен.");
            }
            double manualShifts = Math.max(0.25, num(p.manualShiftCount(), 1));
            actualHours = EstimateText.round2(manualShifts * shiftHours);
            hoursByKind.put("weekday_day", actualHours);
        }

        List<EstimateShiftSegment> segments = new ArrayList<>();
        for (Map.Entry<String, Double> e : hoursByKind.entrySet()) {
            if (e.getValue() <= 0.001) {
                continue;
            }
            double hours = EstimateText.round2(e.getValue());
            double shifts = EstimateText.round2(hours / shiftHours);
            double coefficient = coeff.getOrDefault(e.getKey(), 1.0);
            segments.add(new EstimateShiftSegment(
                    e.getKey(),
                    SEGMENT_LABELS.getOrDefault(e.getKey(), e.getKey()),
                    hours,
                    shifts,
                    coefficient,
                    EstimateText.round2(shifts * coefficient)));
        }

        double rawShifts = segments.stream().mapToDouble(EstimateShiftSegment::shifts).sum();
        double rawFactor = segments.stream().mapToDouble(EstimateShiftSegment::amountFactor).sum();
        double floor = roundingStep > 0 ? roundingStep : 0.5;
        double chargeableShifts = Math.max(floor, roundTo(rawShifts, roundingStep));
        double chargeFactor = Math.max(floor, roundTo(rawFactor, roundingStep));

        return new EstimateShiftCalculation(
                source,
                startAtIso,
                endAtIso,
                actualHours,
                shiftHours,
                roundingStep,
                EstimateText.round2(chargeableShifts),
                EstimateText.round2(chargeFactor),
                segments,
                warnings);
    }

    private static double num(Object value, double fallback) {
        if (value == null) {
            return fallback;
        }
        String s = String.valueOf(value).trim().replace(",", ".");
        if (s.isEmpty()) {
            return fallback;
        }
        try {
            double parsed = Double.parseDouble(s);
            return Double.isFinite(parsed) ? parsed : fallback;
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private static double roundTo(double value, double step) {
        if (step <= 0) {
            return EstimateText.round2(value);
        }
        return EstimateText.round2(Math.ceil(value / step - 1e-9) * step);
    }

    private static Set<String> parseDateSet(String value) {
        Set<String> set = new LinkedHashSet<>();
        if (value == null || value.isBlank()) {
            return set;
        }
        for (String raw : value.split("[,;\\n]+")) {
            String trimmed = raw.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            String iso = "";
            Matcher dmy = DMY.matcher(trimmed);
            if (dmy.matches()) {
                iso = dmy.group(3) + "-" + pad2(dmy.group(2)) + "-" + pad2(dmy.group(1));
            } else if (ISO_DATE.matcher(trimmed).find()) {
                iso = trimmed.substring(0, 10);
            }
            if (!iso.isEmpty()) {
                set.add(iso);
            }
        }
        return set;
    }

    /** Разбор даты ISO; голую дату-строку трактуем как полночь UTC. */
    private static OffsetDateTime parseDate(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String s = value.trim();
        try {
            return OffsetDateTime.parse(s);
        } catch (Exception ignored) {
            // продолжаем
        }
        try {
            if (ISO_DATE.matcher(s).find() && s.length() == 10) {
                return OffsetDateTime.parse(s + "T00:00:00Z");
            }
            // datetime-local без зоны: 2026-06-30T18:00
            if (s.length() >= 16 && s.charAt(10) == 'T') {
                return OffsetDateTime.of(java.time.LocalDateTime.parse(s.substring(0, 16)), ZoneOffset.UTC);
            }
        } catch (Exception ignored) {
            // не дата
        }
        return null;
    }

    private static String pad2(String value) {
        return value.length() == 1 ? "0" + value : value;
    }

    private static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }
}
