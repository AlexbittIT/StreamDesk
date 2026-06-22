package com.streamdesk.transcription;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * REST-контроллер AI-транскрибации — перенос /api/ai-transcription/* из backend/routes.ts.
 */
@RestController
@RequestMapping("/api/ai-transcription")
public class AiTranscriptionController {

    private final WhisperXClient whisperXClient;
    private final TranscribeService transcribeService;

    public AiTranscriptionController(WhisperXClient whisperXClient, TranscribeService transcribeService) {
        this.whisperXClient = whisperXClient;
        this.transcribeService = transcribeService;
    }

    // GET /api/ai-transcription/health — доступность Whisper X
    @GetMapping("/health")
    public Map<String, Object> health() {
        Map<String, Object> result = new LinkedHashMap<>();
        if (!whisperXClient.isConfigured()) {
            result.put("available", false);
            result.put("message", "Whisper X API не настроен");
            return result;
        }
        result.put("available", whisperXClient.healthCheck());
        return result;
    }

    // POST /api/ai-transcription/transcribe — транскрибация + генерация документа + сохранение в чат
    @PostMapping("/transcribe")
    public Map<String, Object> transcribe(@RequestParam(value = "file", required = false) MultipartFile file,
                                          @RequestParam(required = false) String format,
                                          @RequestParam(required = false) String language,
                                          @RequestParam(required = false) String numSpeakers,
                                          @RequestParam(required = false) String diarize,
                                          @RequestParam(required = false) String chatSessionId,
                                          @RequestParam(required = false) String userId) {
        return transcribeService.aiTranscribe(file, format, language, numSpeakers, diarize, chatSessionId, userId);
    }
}
