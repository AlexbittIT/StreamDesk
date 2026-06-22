package com.streamdesk.transcription;

import com.streamdesk.transcription.dto.TranscriptionResult;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFRun;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Генерация DOCX/PDF из транскрипции — порт generateDOC/generatePDF из backend/services/document-generator.ts.
 * DOCX — Apache POI (кириллица из коробки); PDF — PDFBox с вшитым DejaVu Sans (resources/fonts/DejaVuSans.ttf).
 * generateEquipmentPassDOCX из Node НЕ переносился — мёртвый код (нигде не вызывается).
 */
@Component
public class DocumentGenerator {

    private static final String FONT_PATH = "fonts/DejaVuSans.ttf";
    private static final Pattern SENTENCE_SPLIT = Pattern.compile("[.!?]\\s+");

    // --- DOCX ---

    /** Генерирует DOCX из транскрипции. */
    public void generateDoc(TranscriptionResult transcription, Path outputPath) throws IOException {
        try (XWPFDocument doc = new XWPFDocument()) {
            XWPFParagraph title = doc.createParagraph();
            XWPFRun titleRun = title.createRun();
            titleRun.setText("Транскрипция");
            titleRun.setBold(true);
            titleRun.setFontSize(16);

            doc.createParagraph(); // пустая строка

            List<TranscriptionResult.Segment> segments = transcription.getSegments();
            if (segments != null && !segments.isEmpty()) {
                for (TranscriptionResult.Segment seg : segments) {
                    XWPFParagraph p = doc.createParagraph();
                    if (seg.getSpeakerLabel() != null) {
                        XWPFRun speaker = p.createRun();
                        speaker.setText(seg.getSpeakerLabel() + ": ");
                        speaker.setBold(true);
                        speaker.setColor("0066CC");
                        speaker.setFontSize(11);
                    }
                    XWPFRun time = p.createRun();
                    time.setText("[" + formatTime(seg.getStart()) + "] ");
                    time.setColor("666666");
                    time.setFontSize(10);

                    XWPFRun text = p.createRun();
                    text.setText(seg.getText());
                    text.setFontSize(12);
                }
            } else {
                for (String sentence : splitSentences(transcription.getText())) {
                    XWPFParagraph p = doc.createParagraph();
                    XWPFRun run = p.createRun();
                    run.setText(sentence.trim());
                    run.setFontSize(12);
                }
            }

            try (OutputStream out = Files.newOutputStream(outputPath)) {
                doc.write(out);
            }
        }
    }

    // --- PDF ---

    /** Генерирует PDF из транскрипции (кириллица — через вшитый DejaVu Sans). */
    public void generatePdf(TranscriptionResult transcription, Path outputPath) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDFont font;
            try (InputStream fontStream = new ClassPathResource(FONT_PATH).getInputStream()) {
                font = PDType0Font.load(doc, fontStream);
            }

            PdfLayout layout = new PdfLayout(doc, font);
            try {
                // Заголовок по центру
                layout.drawCentered("Транскрипция", 20);
                layout.moveDown(2, 20);

                List<TranscriptionResult.Segment> segments = transcription.getSegments();
                if (segments != null && !segments.isEmpty()) {
                    for (TranscriptionResult.Segment seg : segments) {
                        if (seg.getSpeakerLabel() != null) {
                            layout.drawWrapped(seg.getSpeakerLabel(), 11, 0x0066CC, 0);
                            layout.moveDown(0.2f, 11);
                        }
                        layout.drawWrapped("[" + formatTime(seg.getStart()) + "]", 10, 0x666666, 0);
                        layout.drawWrapped(seg.getText(), 12, 0x000000, 20);
                        layout.moveDown(0.8f, 12);
                    }
                } else {
                    layout.drawWrapped(transcription.getText(), 12, 0x000000, 0);
                }

                if (transcription.getLanguage() != null) {
                    layout.moveDown(1, 12);
                    layout.drawRight("Язык: " + transcription.getLanguage(), 10, 0x999999);
                }
            } finally {
                layout.close();
            }

            doc.save(outputPath.toFile());
        }
    }

    // --- helpers ---

    /** MM:SS из секунд. */
    private String formatTime(double seconds) {
        int total = (int) Math.floor(seconds);
        int mins = total / 60;
        int secs = total % 60;
        return String.format("%02d:%02d", mins, secs);
    }

    /**
     * Аналог JS text.split(/([.!?]\s+)/) с фильтром непустых после trim:
     * разбивает на предложения, сохраняя знаки-разделители как отдельные токены (как в Node).
     */
    private List<String> splitSentences(String text) {
        List<String> result = new ArrayList<>();
        if (text == null || text.isEmpty()) {
            return result;
        }
        Matcher m = SENTENCE_SPLIT.matcher(text);
        int last = 0;
        while (m.find()) {
            addIfNotBlank(result, text.substring(last, m.start()));
            addIfNotBlank(result, m.group());
            last = m.end();
        }
        addIfNotBlank(result, text.substring(last));
        return result;
    }

    private void addIfNotBlank(List<String> list, String s) {
        if (s != null && !s.trim().isEmpty()) {
            list.add(s);
        }
    }

    /**
     * Простая текстовая разметка для PDFBox (PDFBox не умеет автопоток как pdfkit):
     * перенос слов по ширине страницы, перевод строки, новая страница при переполнении.
     */
    private static final class PdfLayout {
        private static final float MARGIN = 50f;
        private final PDDocument doc;
        private final PDFont font;
        private final float pageWidth;
        private final float pageHeight;
        private PDPage page;
        private PDPageContentStream stream;
        private float y;

        PdfLayout(PDDocument doc, PDFont font) throws IOException {
            this.doc = doc;
            this.font = font;
            this.pageWidth = PDRectangle.LETTER.getWidth();
            this.pageHeight = PDRectangle.LETTER.getHeight();
            newPage();
        }

        private void newPage() throws IOException {
            if (stream != null) {
                stream.close();
            }
            page = new PDPage(PDRectangle.LETTER);
            doc.addPage(page);
            stream = new PDPageContentStream(doc, page);
            y = pageHeight - MARGIN;
        }

        private float lineHeight(float fontSize) {
            return fontSize * 1.3f;
        }

        private void ensureSpace(float needed) throws IOException {
            if (y - needed < MARGIN) {
                newPage();
            }
        }

        /** Перенос по словам с левым отступом indent. */
        void drawWrapped(String text, float fontSize, int rgb, float indent) throws IOException {
            String clean = sanitize(text);
            float maxWidth = pageWidth - 2 * MARGIN - indent;
            for (String line : wrap(clean, fontSize, maxWidth)) {
                drawLine(line, fontSize, rgb, MARGIN + indent);
            }
        }

        void drawCentered(String text, float fontSize) throws IOException {
            String clean = sanitize(text);
            float width = textWidth(clean, fontSize);
            drawLine(clean, fontSize, 0x000000, (pageWidth - width) / 2);
        }

        void drawRight(String text, float fontSize, int rgb) throws IOException {
            String clean = sanitize(text);
            float width = textWidth(clean, fontSize);
            drawLine(clean, fontSize, rgb, pageWidth - MARGIN - width);
        }

        private void drawLine(String line, float fontSize, int rgb, float x) throws IOException {
            float lh = lineHeight(fontSize);
            ensureSpace(lh);
            y -= lh;
            stream.beginText();
            stream.setFont(font, fontSize);
            stream.setNonStrokingColor(((rgb >> 16) & 0xFF) / 255f, ((rgb >> 8) & 0xFF) / 255f, (rgb & 0xFF) / 255f);
            stream.newLineAtOffset(x, y);
            stream.showText(line);
            stream.endText();
        }

        void moveDown(float factor, float fontSize) {
            y -= factor * lineHeight(fontSize);
        }

        private List<String> wrap(String text, float fontSize, float maxWidth) throws IOException {
            List<String> lines = new ArrayList<>();
            if (text.isEmpty()) {
                return lines;
            }
            StringBuilder current = new StringBuilder();
            for (String word : text.split(" ")) {
                if (word.isEmpty()) {
                    continue;
                }
                String candidate = current.length() == 0 ? word : current + " " + word;
                if (textWidth(candidate, fontSize) > maxWidth && current.length() > 0) {
                    lines.add(current.toString());
                    current = new StringBuilder(word);
                } else {
                    current = new StringBuilder(candidate);
                }
            }
            if (current.length() > 0) {
                lines.add(current.toString());
            }
            return lines;
        }

        private float textWidth(String text, float fontSize) throws IOException {
            return font.getStringWidth(text) / 1000f * fontSize;
        }

        /** Убирает управляющие символы, которые PDFBox не сможет отрисовать. */
        private String sanitize(String text) {
            if (text == null) {
                return "";
            }
            return text.replaceAll("[\\t\\r\\n]", " ");
        }

        void close() throws IOException {
            if (stream != null) {
                stream.close();
                stream = null;
            }
        }
    }
}
