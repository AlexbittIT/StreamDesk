package com.streamdesk.transcription;

import com.streamdesk.transcription.dto.TranscriptionResult;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.extractor.XWPFWordExtractor;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Проверяет реальную генерацию DOCX/PDF из транскрипции с кириллицей
 * (POI и PDFBox + вшитый DejaVu Sans). Без Spring-контекста — чистый юнит-тест.
 */
class DocumentGeneratorTest {

    private final DocumentGenerator generator = new DocumentGenerator();

    private TranscriptionResult sample() {
        TranscriptionResult result = new TranscriptionResult();
        result.setLanguage("ru");

        TranscriptionResult.Segment s1 = new TranscriptionResult.Segment();
        s1.setStart(5);
        s1.setEnd(8);
        s1.setText("Привет, это тестовая транскрипция.");
        s1.setSpeaker("SPEAKER_00");
        s1.setSpeakerLabel("Спикер 1");

        TranscriptionResult.Segment s2 = new TranscriptionResult.Segment();
        s2.setStart(65);
        s2.setEnd(70);
        s2.setText("Второй спикер отвечает на русском языке.");
        s2.setSpeaker("SPEAKER_01");
        s2.setSpeakerLabel("Спикер 2");

        result.setSegments(List.of(s1, s2));
        return result;
    }

    @Test
    void generatesDocxWithCyrillic() throws Exception {
        Path out = Files.createTempFile("doc-test-", ".docx");
        try {
            generator.generateDoc(sample(), out);
            assertTrue(Files.size(out) > 0, "DOCX должен быть непустым");
            try (XWPFDocument doc = new XWPFDocument(Files.newInputStream(out));
                 XWPFWordExtractor extractor = new XWPFWordExtractor(doc)) {
                String text = extractor.getText();
                assertTrue(text.contains("Транскрипция"), "DOCX содержит заголовок");
                assertTrue(text.contains("Спикер 1"), "DOCX содержит лейбл спикера");
                assertTrue(text.contains("тестовая транскрипция"), "DOCX содержит текст сегмента");
            }
        } finally {
            Files.deleteIfExists(out);
        }
    }

    @Test
    void generatesPdfWithCyrillic() throws Exception {
        Path out = Files.createTempFile("doc-test-", ".pdf");
        try {
            generator.generatePdf(sample(), out);
            assertTrue(Files.size(out) > 0, "PDF должен быть непустым");
            try (PDDocument doc = Loader.loadPDF(out.toFile())) {
                String text = new PDFTextStripper().getText(doc);
                assertTrue(text.contains("Транскрипция"), "PDF содержит заголовок");
                assertTrue(text.contains("Спикер 1"), "PDF содержит лейбл спикера (кириллица отрисована)");
                assertTrue(text.contains("русском"), "PDF содержит русский текст");
            }
        } finally {
            Files.deleteIfExists(out);
        }
    }
}
