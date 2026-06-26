package com.streamdesk.transcription;

import com.streamdesk.chat.ChatMessage;
import com.streamdesk.chat.ChatMessageRepository;
import com.streamdesk.config.ApiException;
import com.streamdesk.transcription.dto.TranscribeOptions;
import com.streamdesk.transcription.dto.TranscriptionResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Транскрибация с генерацией документа — перенос /api/ai-transcription/transcribe и
 * /api/transcriptions/transcribe из backend/routes.ts. Связывает WhisperXClient и DocumentGenerator.
 */
@Service
public class TranscribeService {

    private static final Logger log = LoggerFactory.getLogger(TranscribeService.class);

    private static final String DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    private final WhisperXClient whisperXClient;
    private final DocumentGenerator documentGenerator;
    private final ChatMessageRepository chatMessageRepository;

    public TranscribeService(WhisperXClient whisperXClient,
                             DocumentGenerator documentGenerator,
                             ChatMessageRepository chatMessageRepository) {
        this.whisperXClient = whisperXClient;
        this.documentGenerator = documentGenerator;
        this.chatMessageRepository = chatMessageRepository;
    }

    /** POST /api/ai-transcription/transcribe — транскрибация + сохранение результата в чат. */
    public Map<String, Object> aiTranscribe(MultipartFile file, String format, String language,
                                            String numSpeakers, String diarize,
                                            String chatSessionId, String userId) {
        requireAudioVideo(file);
        if (!whisperXClient.isConfigured()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Whisper X API не настроен. Проверьте переменные окружения.");
        }

        String outputFormat = normalizeFormat(format);
        TranscriptionResult result = doTranscribe(file, outputFormat, language, numSpeakers, diarize);
        GeneratedFile generated = generate(file, result, outputFormat);

        String chatMessageId = null;
        if (notBlank(chatSessionId) && notBlank(userId)) {
            chatMessageId = saveToChat(chatSessionId, result, outputFormat, defaultLang(language), generated);
        }

        Map<String, Object> response = baseResponse(result, outputFormat, defaultLang(language), generated);
        response.put("speakerCount", result.getSpeakerCount());
        response.put("chatMessageId", chatMessageId);
        return response;
    }

    /** POST /api/transcriptions/transcribe — транскрибация + генерация документа (deprecated, без чата). */
    public Map<String, Object> transcribe(MultipartFile file, String format, String language,
                                          String numSpeakers, String diarize) {
        requireAudioVideo(file);
        String outputFormat = normalizeFormat(format);
        TranscriptionResult result = doTranscribe(file, outputFormat, language, numSpeakers, diarize);
        GeneratedFile generated = generate(file, result, outputFormat);
        return baseResponse(result, outputFormat, defaultLang(language), generated);
    }

    // --- core ---

    private TranscriptionResult doTranscribe(MultipartFile file, String outputFormat, String language,
                                             String numSpeakers, String diarize) {
        Path temp = null;
        try {
            temp = Files.createTempFile("transcribe-", "-" + safeName(originalName(file)));
            file.transferTo(temp.toFile());

            Integer speakerCount = parseInt(numSpeakers);
            TranscribeOptions opts = new TranscribeOptions(
                    "auto".equalsIgnoreCase(language) ? null : defaultLang(language),
                    null,
                    !"txt".equals(outputFormat),
                    speakerCount != null && speakerCount > 0 ? speakerCount : null,
                    parseDiarize(diarize));
            return whisperXClient.transcribe(temp, opts);
        } catch (IOException e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to read uploaded file: " + e.getMessage());
        } finally {
            if (temp != null) {
                try {
                    Files.deleteIfExists(temp);
                } catch (IOException ignored) {
                    // временный файл удалит ОС
                }
            }
        }
    }

    private GeneratedFile generate(MultipartFile file, TranscriptionResult result, String outputFormat) {
        try {
            Path outputDir = Paths.get(System.getProperty("user.dir"), "uploads", "transcriptions", "output");
            Files.createDirectories(outputDir);

            String baseName = stripExtension(originalName(file));
            long timestamp = System.currentTimeMillis();
            String fileName;
            String mimeType;
            String downloadFileName;
            Path outputPath;

            switch (outputFormat) {
                case "doc", "docx" -> {
                    fileName = baseName + "-" + timestamp + ".docx";
                    outputPath = outputDir.resolve(fileName);
                    documentGenerator.generateDoc(result, outputPath);
                    mimeType = DOCX_MIME;
                    downloadFileName = baseName + "-transcription.docx";
                }
                case "pdf" -> {
                    fileName = baseName + "-" + timestamp + ".pdf";
                    outputPath = outputDir.resolve(fileName);
                    documentGenerator.generatePdf(result, outputPath);
                    mimeType = "application/pdf";
                    downloadFileName = baseName + "-transcription.pdf";
                }
                default -> {
                    fileName = baseName + "-" + timestamp + ".txt";
                    outputPath = outputDir.resolve(fileName);
                    Files.writeString(outputPath, buildTxt(result), StandardCharsets.UTF_8);
                    mimeType = "text/plain";
                    downloadFileName = baseName + "-transcription.txt";
                }
            }

            long size = Files.size(outputPath);
            String fileUrl = "/uploads/transcriptions/output/" + fileName;
            return new GeneratedFile(fileUrl, downloadFileName, size, mimeType);
        } catch (IOException e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to generate document: " + e.getMessage());
        }
    }

    /** TXT с таймкодами и спикерами (как ветка txt в routes.ts). */
    private String buildTxt(TranscriptionResult result) {
        List<TranscriptionResult.Segment> segments = result.getSegments();
        if (segments == null || segments.isEmpty()) {
            return result.getText() != null ? result.getText() : "";
        }
        List<String> lines = new ArrayList<>();
        for (TranscriptionResult.Segment seg : segments) {
            String time = "[" + formatTime(seg.getStart()) + "]";
            String speaker = seg.getSpeakerLabel() != null ? seg.getSpeakerLabel() + ": " : "";
            lines.add(speaker + time + " " + seg.getText());
        }
        return String.join("\n\n", lines);
    }

    private String saveToChat(String chatSessionId, TranscriptionResult result, String outputFormat,
                              String language, GeneratedFile generated) {
        try {
            String content = "Транскрибация завершена:\n\n"
                    + "Язык: " + (result.getLanguage() != null ? result.getLanguage() : language) + "\n"
                    + "Формат: " + outputFormat.toUpperCase(Locale.ROOT) + "\n"
                    + (result.getSpeakerCount() != null ? "Спикеров: " + result.getSpeakerCount() + "\n" : "")
                    + "\nФайл: " + generated.name();

            Map<String, Object> attachment = new LinkedHashMap<>();
            attachment.put("id", UUID.randomUUID().toString());
            attachment.put("name", generated.name());
            attachment.put("url", generated.url());
            attachment.put("type", generated.mimeType());
            attachment.put("size", generated.size());

            ChatMessage message = new ChatMessage();
            message.setSessionId(chatSessionId);
            message.setRole("assistant");
            message.setContent(content);
            message.setAttachments(new ArrayList<>(List.of(attachment)));
            return chatMessageRepository.save(message).getId();
        } catch (Exception e) {
            log.warn("[AI Transcription] Failed to save to chat: {}", e.getMessage());
            return null; // не прерываем процесс
        }
    }

    private Map<String, Object> baseResponse(TranscriptionResult result, String outputFormat,
                                             String language, GeneratedFile generated) {
        Map<String, Object> fileBlock = new LinkedHashMap<>();
        fileBlock.put("url", generated.url());
        fileBlock.put("name", generated.name());
        fileBlock.put("size", generated.size());
        fileBlock.put("mimeType", generated.mimeType());

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("transcription", result.getText());
        response.put("segments", result.getSegments());
        response.put("language", result.getLanguage() != null ? result.getLanguage() : language);
        response.put("format", outputFormat);
        response.put("file", fileBlock);
        return response;
    }

    // --- helpers ---

    private void requireAudioVideo(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("File is required");
        }
        String type = file.getContentType();
        if (type == null || !(type.startsWith("audio/") || type.startsWith("video/"))) {
            throw ApiException.badRequest("File must be an audio or video file");
        }
    }

    private String formatTime(double seconds) {
        int total = (int) Math.floor(seconds);
        return String.format("%02d:%02d", total / 60, total % 60);
    }

    private String originalName(MultipartFile file) {
        String name = file.getOriginalFilename();
        return name != null && !name.isBlank() ? name : "audio";
    }

    private String stripExtension(String name) {
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(0, dot) : name;
    }

    private String safeName(String name) {
        return name.replaceAll("[^\\p{L}0-9_\\-.]", "_");
    }

    private String normalizeFormat(String format) {
        return (format != null && !format.isBlank() ? format : "txt").toLowerCase(Locale.ROOT);
    }

    private String defaultLang(String language) {
        return notBlank(language) ? language : "ru";
    }

    private Integer parseInt(String value) {
        if (!notBlank(value)) {
            return null;
        }
        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private boolean parseDiarize(String diarize) {
        // По умолчанию (поле отсутствует) — true; "false" выключает.
        return diarize == null || !"false".equalsIgnoreCase(diarize.trim());
    }

    private boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    private record GeneratedFile(String url, String name, long size, String mimeType) {
    }
}
