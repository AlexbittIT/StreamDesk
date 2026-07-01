package com.streamdesk.estimate;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Текстовые помощники движка смет — порт normalize/tokens/parseMoney из
 * backend/services/estimate-engine.ts. Общие для каталога и матчинга, поэтому
 * вынесены в отдельный утилитный класс (без состояния).
 */
public final class EstimateText {

    private EstimateText() {
    }

    // Всё, что не буква (любой алфавит, incl. кириллица) и не цифра → разделитель.
    private static final Pattern NON_ALNUM = Pattern.compile("[^\\p{L}0-9]+");

    /** Нижний регистр, ё→е, схлопывание небуквенно-цифровых в пробел, trim. */
    public static String normalize(Object value) {
        if (value == null) {
            return "";
        }
        String s = String.valueOf(value).toLowerCase(Locale.ROOT).replace('ё', 'е');
        return NON_ALNUM.matcher(s).replaceAll(" ").trim();
    }

    /** Токены ≥3 символов из нормализованной строки. */
    public static List<String> tokens(String value) {
        String n = normalize(value);
        if (n.isEmpty()) {
            return List.of();
        }
        List<String> out = new ArrayList<>();
        for (String token : n.split(" ")) {
            if (token.length() >= 3) {
                out.add(token);
            }
        }
        return out;
    }

    /** Округление денег до 2 знаков (порт Math.round(v*100)/100). */
    public static double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    /**
     * Разбор денежной величины из произвольного представления (число/строка с
     * валютой, пробелами, запятой как десятичным разделителем) — порт parseMoney.
     * Возвращает 0, если значение не положительное число.
     */
    public static double parseMoney(Object value) {
        if (value instanceof Number n) {
            double d = n.doubleValue();
            return Double.isFinite(d) && d > 0 ? d : 0;
        }
        String cleaned = String.valueOf(value == null ? "" : value).trim().replaceAll("\\s+", "");
        cleaned = cleaned.replaceAll("[^\\d.,-]", "");
        if (cleaned.isEmpty()) {
            return 0;
        }
        if (cleaned.contains(",") && !cleaned.contains(".")) {
            cleaned = cleaned.replace(",", ".");
        }
        int dots = countChar(cleaned, '.');
        if (dots > 1) {
            int last = cleaned.lastIndexOf('.');
            String intPart = cleaned.substring(0, last).replace(".", "");
            String dec = cleaned.substring(last + 1);
            cleaned = intPart + "." + dec;
        }
        try {
            double parsed = Double.parseDouble(cleaned);
            return Double.isFinite(parsed) && parsed > 0 ? round2(parsed) : 0;
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static int countChar(String s, char c) {
        int count = 0;
        for (int i = 0; i < s.length(); i++) {
            if (s.charAt(i) == c) {
                count++;
            }
        }
        return count;
    }
}
