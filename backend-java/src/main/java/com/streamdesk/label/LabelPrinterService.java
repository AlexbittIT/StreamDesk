package com.streamdesk.label;

import com.streamdesk.config.ApiException;
import com.streamdesk.equipment.Equipment;
import com.streamdesk.equipment.EquipmentRepository;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Печать инвентарных этикеток на сетевой TSPL-принтер (TCP).
 * Перенос /api/equipment/labels/* и хелперов из backend/routes.ts.
 */
@Service
public class LabelPrinterService {

    private final EquipmentRepository equipmentRepository;

    public LabelPrinterService(EquipmentRepository equipmentRepository) {
        this.equipmentRepository = equipmentRepository;
    }

    // --- native TSPL print ---

    public Map<String, Object> printLabels(List<String> equipmentIds) {
        List<String> ids = equipmentIds == null ? List.of() : equipmentIds.stream()
                .map(id -> id != null ? id.trim() : "")
                .filter(id -> !id.isEmpty())
                .toList();
        if (ids.isEmpty()) {
            throw ApiException.badRequest("Выберите оборудование для печати этикеток");
        }
        if (ids.size() > 100) {
            throw ApiException.badRequest("За один раз можно напечатать до 100 этикеток");
        }

        List<Equipment> items = new ArrayList<>();
        for (String id : ids) {
            equipmentRepository.findById(id).ifPresent(items::add);
        }
        if (items.isEmpty()) {
            throw new ApiException(org.springframework.http.HttpStatus.NOT_FOUND, "Оборудование для печати не найдено");
        }

        String payload = buildEquipmentLabelTspl(items);
        byte[] bytes = payload.getBytes(StandardCharsets.UTF_8);
        send(bytes, "Не удалось отправить этикетки на принтер");

        LabelConfig config = config();
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("count", items.size());
        response.put("printer", config.host() + ":" + config.port());
        response.put("bytes", bytes.length);
        response.put("mode", "native-tspl");
        return response;
    }

    // --- bitmap TSPL print ---

    @SuppressWarnings("unchecked")
    public Map<String, Object> printBitmaps(List<Map<String, Object>> labels) {
        if (labels == null || labels.isEmpty()) {
            throw ApiException.badRequest("Нет этикеток для печати");
        }
        if (labels.size() > 100) {
            throw ApiException.badRequest("За один раз можно напечатать до 100 этикеток");
        }
        LabelConfig config = config();
        ByteArrayOutputStream payload = new ByteArrayOutputStream();

        for (Map<String, Object> label : labels) {
            int widthBytes = toInt(label.get("widthBytes"), 0);
            int heightDots = toInt(label.get("heightDots"), 0);
            int xDots = Math.max(0, Math.min(2000, toInt(label.get("xDots"), 0)));
            int yDots = Math.max(0, Math.min(2000, toInt(label.get("yDots"), 0)));
            String bitmapBase64 = label.get("bitmapBase64") != null ? String.valueOf(label.get("bitmapBase64")) : "";

            if (widthBytes <= 0 || widthBytes > 256) {
                throw ApiException.badRequest("Некорректная ширина этикетки");
            }
            if (heightDots <= 0 || heightDots > 1200) {
                throw ApiException.badRequest("Некорректная высота этикетки");
            }
            byte[] bitmap;
            try {
                bitmap = Base64.getDecoder().decode(bitmapBase64);
            } catch (IllegalArgumentException e) {
                throw ApiException.badRequest("Некорректный bitmap этикетки");
            }
            if (bitmap.length != widthBytes * heightDots) {
                throw ApiException.badRequest("Некорректный bitmap этикетки");
            }

            String header = String.join("\r\n",
                    "SIZE " + config.widthMm() + " mm," + config.heightMm() + " mm",
                    "GAP " + config.gapMm() + " mm,0 mm",
                    "DIRECTION 1",
                    "REFERENCE 0,0",
                    "SPEED 4",
                    "DENSITY 10",
                    "SET TEAR ON",
                    "SET CUTTER OFF",
                    "CLS",
                    "BITMAP " + xDots + "," + yDots + "," + widthBytes + "," + heightDots + ",0,");
            try {
                payload.write(header.getBytes(StandardCharsets.US_ASCII));
                payload.write(bitmap);
                payload.write("\r\nPRINT 1,1\r\n".getBytes(StandardCharsets.US_ASCII));
            } catch (IOException e) {
                throw new ApiException(org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR, e.getMessage());
            }
        }

        byte[] bytes = payload.toByteArray();
        send(bytes, "Не удалось отправить PNG-этикетку на принтер");

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("count", labels.size());
        response.put("printer", config.host() + ":" + config.port());
        response.put("bytes", bytes.length);
        response.put("mode", "bitmap-tspl");
        return response;
    }

    // --- calibration ---

    public Map<String, Object> calibrate() {
        LabelConfig config = config();
        String payload = String.join("\r\n",
                "SIZE " + config.widthMm() + " mm," + config.heightMm() + " mm",
                "GAP " + config.gapMm() + " mm,0 mm",
                "DIRECTION 1",
                "REFERENCE 0,0",
                "GAPDETECT",
                "FORMFEED",
                "");
        byte[] bytes = payload.getBytes(StandardCharsets.US_ASCII);
        send(bytes, "Не удалось откалибровать принтер");

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("printer", config.host() + ":" + config.port());
        response.put("bytes", bytes.length);
        return response;
    }

    // --- TSPL builders ---

    private String buildEquipmentLabelTspl(List<Equipment> items) {
        LabelConfig config = config();
        double dotsPerMm = config.dpi() / 25.4;
        int widthDots = dot(config.widthMm(), dotsPerMm);
        int centerX = Math.round(widthDots / 2f);

        List<String> blocks = new ArrayList<>();
        for (Equipment item : items) {
            String value = firstNonBlank(item.getInventoryNumber(), item.getBarcode(), item.getSerialNumber(), item.getId());
            String barcode = cleanBarcode(value, item.getId());
            String inventory = cleanText(value != null ? value : barcode, 32)
                    .replaceAll("[^\\x20-\\x7E]+", "").trim();
            if (inventory.isEmpty()) {
                inventory = barcode;
            }

            int barcodeX = dot(3.0, dotsPerMm);
            int barcodeY = dot(2.6, dotsPerMm);
            int barcodeHeight = dot(10.2, dotsPerMm);
            int eraseWidth = dot(13.4, dotsPerMm);
            int eraseHeight = dot(4.3, dotsPerMm);
            int eraseX = centerX - Math.round(eraseWidth / 2f);
            int eraseY = barcodeY + Math.round(barcodeHeight / 2f) - Math.round(eraseHeight / 2f);
            int brandX = centerX - dot(4.1, dotsPerMm);
            int brandY = eraseY + dot(0.55, dotsPerMm);
            int inventoryX = Math.max(dot(1.4, dotsPerMm), centerX - Math.round(inventory.length() * dot(0.86, dotsPerMm) / 2f));

            blocks.add(String.join("\r\n",
                    "SIZE " + config.widthMm() + " mm," + config.heightMm() + " mm",
                    "GAP " + config.gapMm() + " mm,0 mm",
                    "DIRECTION 1",
                    "REFERENCE 0,0",
                    "CODEPAGE UTF-8",
                    "SPEED 4",
                    "DENSITY 10",
                    "SET TEAR ON",
                    "SET CUTTER OFF",
                    "CLS",
                    "BARCODE " + barcodeX + "," + barcodeY + ",\"128\"," + barcodeHeight + ",0,0,2,4,\"" + barcode + "\"",
                    "ERASE " + eraseX + "," + eraseY + "," + eraseWidth + "," + eraseHeight,
                    "TEXT " + brandX + "," + brandY + ",\"0\",0,2,2,\"ОТИС\"",
                    "TEXT " + inventoryX + "," + dot(15.4, dotsPerMm) + ",\"0\",0,1,1,\"" + inventory + "\"",
                    "PRINT 1,1"));
        }
        return String.join("\r\n", blocks);
    }

    // --- low-level send ---

    private void send(byte[] payload, String failureMessage) {
        LabelConfig config = config();
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(config.host(), config.port()), 5000);
            OutputStream out = socket.getOutputStream();
            out.write(payload);
            out.flush();
        } catch (IOException | IllegalArgumentException e) {
            throw new ApiException(org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR, failureMessage);
        }
    }

    // --- config & helpers ---

    private LabelConfig config() {
        return new LabelConfig(
                env("LABEL_PRINTER_HOST", "10.90.109.120").trim(),
                envInt("LABEL_PRINTER_PORT", 9100),
                envInt("LABEL_WIDTH_MM", 40),
                envInt("LABEL_HEIGHT_MM", 20),
                envInt("LABEL_GAP_MM", 2),
                envInt("LABEL_PRINTER_DPI", 300));
    }

    private int dot(double mm, double dotsPerMm) {
        return Math.round((float) (mm * dotsPerMm));
    }

    private String cleanText(String value, int maxLength) {
        if (value == null) {
            return "";
        }
        String s = value.replaceAll("[\\r\\n\\t]+", " ").replace("\"", "'").replaceAll("\\s+", " ").trim();
        return s.length() > maxLength ? s.substring(0, maxLength) : s;
    }

    private String cleanBarcode(String value, Object fallback) {
        String cleaned = slice(String.valueOf(value == null ? "" : value).replaceAll("[^A-Za-z0-9_.-]+", ""), 64);
        if (!cleaned.isEmpty()) {
            return cleaned;
        }
        String fb = slice(String.valueOf(fallback == null ? "" : fallback).replaceAll("[^A-Za-z0-9_.-]+", ""), 64);
        return !fb.isEmpty() ? fb : "STREAMDESK";
    }

    private String slice(String s, int max) {
        return s.length() > max ? s.substring(0, max) : s;
    }

    private String firstNonBlank(String... values) {
        for (String v : values) {
            if (v != null && !v.isBlank()) {
                return v;
            }
        }
        return null;
    }

    private int toInt(Object value, int fallback) {
        if (value instanceof Number n) {
            return (int) Math.round(n.doubleValue());
        }
        try {
            return value != null ? (int) Math.round(Double.parseDouble(String.valueOf(value))) : fallback;
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private String env(String key, String def) {
        String v = System.getenv(key);
        return v != null && !v.isBlank() ? v : def;
    }

    private int envInt(String key, int def) {
        try {
            String v = System.getenv(key);
            return v != null && !v.isBlank() ? Integer.parseInt(v.trim()) : def;
        } catch (NumberFormatException e) {
            return def;
        }
    }

    private record LabelConfig(String host, int port, int widthMm, int heightMm, int gapMm, int dpi) {
    }
}
