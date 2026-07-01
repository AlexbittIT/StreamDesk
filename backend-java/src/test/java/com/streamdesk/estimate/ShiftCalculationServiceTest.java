package com.streamdesk.estimate;

import com.streamdesk.estimate.dto.CalculateRequest;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Серверный расчёт смен (SD-161) — источник истины. Проверяет ядро формулы:
 * ручной режим, сегменты будни/выходные × день/ночь, праздники/рабочие даты,
 * округление смен до шага и пересчёт строк сметы по chargeFactor.
 *
 * Опорные даты: 2026-07-11 — суббота (выходной), 2026-07-10 — пятница (будни).
 */
class ShiftCalculationServiceTest {

    private final ShiftCalculationService service = new ShiftCalculationService();

    /** Запрос только с релевантными полями; остальное — null (сервис берёт дефолты). */
    private CalculateRequest req(String startAt, String endAt, String manualShifts, String shiftHours,
                                 String step, String holidays, String workdays,
                                 List<Map<String, Object>> items) {
        return new CalculateRequest(startAt, endAt, manualShifts, shiftHours, step,
                null, null, null, null, null, null, holidays, workdays, items);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> shift(Map<String, Object> result) {
        return (Map<String, Object>) result.get("shiftCalculation");
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> segments(Map<String, Object> result) {
        return (List<Map<String, Object>>) shift(result).get("segments");
    }

    private double num(Map<String, Object> m, String key) {
        return ((Number) m.get(key)).doubleValue();
    }

    private Map<String, Object> segmentOfKind(Map<String, Object> result, String kind) {
        return segments(result).stream()
                .filter(s -> kind.equals(s.get("kind")))
                .findFirst().orElse(null);
    }

    @Test
    void manualMode_chargesAsWeekdayDay() {
        Map<String, Object> result = service.calculate(req(null, null, "2", "10", "0.5", null, null, null));
        Map<String, Object> sc = shift(result);

        assertEquals("manual", sc.get("source"));
        assertEquals(2.0, num(sc, "chargeableShifts"), 1e-9);
        // 2 смены × коэффициент будни-день (1.0) = 2.0
        assertEquals(2.0, num(sc, "chargeFactor"), 1e-9);
        assertEquals(1, segments(result).size());
        assertEquals("weekday_day", segments(result).get(0).get("kind"));
    }

    @Test
    void datesMode_weekdayDay_singleShift() {
        // Пятница 08:00–18:00 = 10 ч будни-день; 10ч / 10ч-смена = 1 смена, коэфф 1.0.
        Map<String, Object> result = service.calculate(
                req("2026-07-10T08:00", "2026-07-10T18:00", null, "10", "0.5", null, null, null));
        Map<String, Object> sc = shift(result);

        assertEquals("dates", sc.get("source"));
        assertEquals(1.0, num(sc, "chargeFactor"), 1e-9);
        Map<String, Object> seg = segmentOfKind(result, "weekday_day");
        assertTrue(seg != null, "ожидается сегмент weekday_day");
        assertEquals(1.0, num(seg, "shifts"), 1e-9);
    }

    @Test
    void weekendOvernight_splitsIntoWeekendDayAndNight() {
        // Сб 08:00 → Вс 02:00: 08–22 выходные-день (14ч), 22–02 выходные-ночь (4ч).
        Map<String, Object> result = service.calculate(
                req("2026-07-11T08:00", "2026-07-12T02:00", null, "10", "0.5", null, null, null));

        assertEquals("dates", shift(result).get("source"));
        assertTrue(segmentOfKind(result, "weekend_day") != null, "ожидается weekend_day");
        assertTrue(segmentOfKind(result, "weekend_night") != null, "ожидается weekend_night");
        assertTrue(segmentOfKind(result, "weekday_day") == null, "будних сегментов быть не должно");
        assertTrue(num(shift(result), "chargeFactor") > 0);
    }

    @Test
    void holidayDate_makesWeekdayCountAsWeekend() {
        // Пятница, но помечена праздником → считается как выходной (коэфф 1.5).
        Map<String, Object> result = service.calculate(
                req("2026-07-10T08:00", "2026-07-10T18:00", null, "10", "0.5", "2026-07-10", null, null));

        assertTrue(segmentOfKind(result, "weekend_day") != null, "праздник → weekend_day");
        assertTrue(segmentOfKind(result, "weekday_day") == null);
        assertEquals(1.5, num(segmentOfKind(result, "weekend_day"), "coefficient"), 1e-9);
    }

    @Test
    void workdayDate_overridesWeekend() {
        // Суббота, но помечена рабочим днём → считается как будни.
        Map<String, Object> result = service.calculate(
                req("2026-07-11T08:00", "2026-07-11T18:00", null, "10", "0.5", null, "2026-07-11", null));

        assertTrue(segmentOfKind(result, "weekday_day") != null, "workday → weekday_day");
        assertTrue(segmentOfKind(result, "weekend_day") == null);
    }

    @Test
    void endNotAfterStart_fallsBackToManualWithWarning() {
        Map<String, Object> result = service.calculate(
                req("2026-07-10T18:00", "2026-07-10T08:00", null, "10", "0.5", null, null, null));
        Map<String, Object> sc = shift(result);

        assertEquals("manual", sc.get("source"));
        @SuppressWarnings("unchecked")
        List<String> warnings = (List<String>) sc.get("warnings");
        assertTrue(warnings.stream().anyMatch(w -> w.contains("Окончание не позже начала")),
                "ожидается предупреждение о некорректном интервале");
    }

    @Test
    void shifts_roundUpToStep() {
        // 10ч при смене 8ч = 1.25 смены → округление вверх до шага 0.5 = 1.5.
        Map<String, Object> result = service.calculate(
                req("2026-07-10T08:00", "2026-07-10T18:00", null, "8", "0.5", null, null, null));
        Map<String, Object> seg = segmentOfKind(result, "weekday_day");
        assertEquals(1.5, num(seg, "shifts"), 1e-9);
    }

    @Test
    void items_recomputedWithChargeFactor() {
        // Ручной режим, 2 смены (chargeFactor 2.0). Строка 3×100 → base 300, total 600.
        List<Map<String, Object>> items = List.of(Map.of("quantity", 3, "unitPrice", 100, "availableQty", 5));
        Map<String, Object> result = service.calculate(req(null, null, "2", "10", "0.5", null, null, items));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> outItems = (List<Map<String, Object>>) result.get("items");
        @SuppressWarnings("unchecked")
        Map<String, Object> totals = (Map<String, Object>) result.get("totals");

        assertEquals(1, outItems.size());
        Map<String, Object> line = outItems.get(0);
        assertEquals(300.0, num(line, "baseTotal"), 1e-9);
        assertEquals(2.0, num(line, "shiftFactor"), 1e-9);
        assertEquals(600.0, num(line, "total"), 1e-9);
        assertEquals("priced", line.get("priceStatus"));
        assertEquals("in_stock", line.get("availability"));
        assertEquals(600.0, num(totals, "subtotal"), 1e-9);
        assertFalse(outItems.isEmpty());
    }
}
