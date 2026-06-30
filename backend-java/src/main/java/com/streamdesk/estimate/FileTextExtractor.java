package com.streamdesk.estimate;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.extractor.XWPFWordExtractor;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;

/**
 * Извлечение текста из файла ТЗ — порт extractFileText из estimate-engine.ts,
 * на уже подключённых POI (docx) и PDFBox (pdf). Прочее (txt/md/csv/json/html) —
 * как UTF-8. При сбое разбора возвращаем пустую строку (как в Node-движке),
 * чтобы сборка сметы продолжилась по тексту из тела запроса.
 */
@Service
public class FileTextExtractor {

    private static final Logger log = LoggerFactory.getLogger(FileTextExtractor.class);

    public String extract(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return "";
        }
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (Exception e) {
            log.warn("[Estimates] не удалось прочитать файл: {}", e.getMessage());
            return "";
        }
        if (bytes.length == 0) {
            return "";
        }
        String name = lower(file.getOriginalFilename());
        String mime = lower(file.getContentType());
        try {
            if (name.endsWith(".docx") || mime.contains("officedocument.wordprocessingml")) {
                return extractDocx(bytes);
            }
            if (name.endsWith(".pdf") || mime.contains("pdf")) {
                return extractPdf(bytes);
            }
        } catch (Exception e) {
            log.warn("[Estimates] разбор файла не удался: {}", e.getMessage());
            return "";
        }
        // txt / md / csv / json / html и прочее текстовое
        return new String(bytes, StandardCharsets.UTF_8).trim();
    }

    private String extractDocx(byte[] bytes) throws Exception {
        try (XWPFDocument document = new XWPFDocument(new ByteArrayInputStream(bytes));
             XWPFWordExtractor extractor = new XWPFWordExtractor(document)) {
            String text = extractor.getText();
            return text == null ? "" : text.trim();
        }
    }

    private String extractPdf(byte[] bytes) throws Exception {
        try (PDDocument document = Loader.loadPDF(bytes)) {
            String text = new PDFTextStripper().getText(document);
            return text == null ? "" : text.trim();
        }
    }

    private static String lower(String value) {
        return value == null ? "" : value.toLowerCase();
    }
}
