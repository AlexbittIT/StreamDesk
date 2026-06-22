package com.streamdesk.transcription;

import com.streamdesk.transcription.dto.TranscriptionDtos.FolderRequest;
import com.streamdesk.transcription.dto.TranscriptionDtos.PodcastRequest;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

/**
 * REST-контроллер транскрипций/подкастов — перенос /api/transcriptions/* из backend/routes.ts.
 */
@RestController
@RequestMapping("/api/transcriptions")
public class TranscriptionController {

    private final TranscriptionService service;
    private final TranscribeService transcribeService;

    public TranscriptionController(TranscriptionService service, TranscribeService transcribeService) {
        this.service = service;
        this.transcribeService = transcribeService;
    }

    // POST /api/transcriptions/transcribe — транскрибация + генерация документа (deprecated)
    @PostMapping("/transcribe")
    public Map<String, Object> transcribe(@RequestParam(value = "file", required = false) MultipartFile file,
                                          @RequestParam(required = false) String format,
                                          @RequestParam(required = false) String language,
                                          @RequestParam(required = false) String numSpeakers,
                                          @RequestParam(required = false) String diarize) {
        return transcribeService.transcribe(file, format, language, numSpeakers, diarize);
    }

    @GetMapping("/podcasts")
    public List<Map<String, Object>> listPodcasts() {
        return service.listPodcasts();
    }

    @PostMapping("/podcasts")
    public Map<String, Object> createPodcast(@RequestBody PodcastRequest req) {
        return service.createPodcast(req != null ? req.name() : null);
    }

    @DeleteMapping("/podcasts/{podcast}")
    public Map<String, Object> deletePodcast(@PathVariable String podcast) {
        return service.deletePodcast(podcast);
    }

    @GetMapping("/podcasts/{podcast}/contents")
    public Map<String, Object> contents(@PathVariable String podcast,
                                        @RequestParam(name = "path", required = false) String path) {
        return service.listContents(podcast, path);
    }

    @PostMapping("/podcasts/{podcast}/folders")
    public Map<String, Object> createFolder(@PathVariable String podcast, @RequestBody FolderRequest req) {
        return service.createFolder(podcast, req != null ? req.parentPath() : null, req != null ? req.name() : null);
    }

    @DeleteMapping("/podcasts/{podcast}/contents")
    public Map<String, Object> deleteContent(@PathVariable String podcast,
                                             @RequestParam(name = "path", required = false) String path) {
        return service.deleteContent(podcast, path);
    }

    @PostMapping("/upload")
    public Map<String, Object> upload(@RequestParam(required = false) String podcast,
                                      @RequestParam(name = "path", required = false) String path,
                                      @RequestParam(value = "file", required = false) MultipartFile file) {
        return service.upload(podcast, path, file);
    }
}
