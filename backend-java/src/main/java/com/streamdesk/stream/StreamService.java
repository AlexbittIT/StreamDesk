package com.streamdesk.stream;

import com.streamdesk.config.ApiException;
import com.streamdesk.config.TimeParse;
import com.streamdesk.stream.dto.StreamRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

/**
 * Логика трансляций — перенос /api/streams из backend/routes.ts.
 */
@Service
public class StreamService {

    private final StreamRepository repository;

    public StreamService(StreamRepository repository) {
        this.repository = repository;
    }

    /** GET /api/streams — фильтры active=true | userId, иначе все. */
    public List<Stream> listStreams(String active, String userId) {
        if ("true".equals(active)) {
            return repository.findByStatusOrderByStartTime("live");
        }
        if (userId != null && !userId.isBlank()) {
            return repository.findByUserIdOrderByCreatedAt(userId);
        }
        return repository.findAllByOrderByCreatedAt();
    }

    @Transactional
    public Stream createStream(StreamRequest req) {
        // insertStreamSchema требует title и platform (остальное опционально/с дефолтами).
        if (isBlank(req.title()) || isBlank(req.platform())) {
            throw ApiException.badRequest("Invalid stream data");
        }
        Stream stream = new Stream();
        stream.setTitle(req.title());
        stream.setPlatform(req.platform());
        stream.setStreamKey(req.streamKey());
        stream.setBitrate(req.bitrate());
        stream.setFps(req.fps());
        stream.setResolution(req.resolution());
        if (!isBlank(req.status())) {
            stream.setStatus(req.status());
        }
        if (req.viewerCount() != null) {
            stream.setViewerCount(req.viewerCount());
        }
        stream.setStartTime(parse(req.startTime()));
        stream.setEndTime(parse(req.endTime()));
        stream.setUserId(req.userId());
        stream.setSystemId(req.systemId());
        stream.setMetadata(req.metadata());
        return repository.save(stream);
    }

    @Transactional
    public Stream updateStream(String id, StreamRequest req) {
        Stream stream = repository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Stream not found"));
        if (req.title() != null) {
            stream.setTitle(req.title());
        }
        if (req.platform() != null) {
            stream.setPlatform(req.platform());
        }
        if (req.streamKey() != null) {
            stream.setStreamKey(req.streamKey());
        }
        if (req.bitrate() != null) {
            stream.setBitrate(req.bitrate());
        }
        if (req.fps() != null) {
            stream.setFps(req.fps());
        }
        if (req.resolution() != null) {
            stream.setResolution(req.resolution());
        }
        if (req.status() != null) {
            stream.setStatus(req.status());
        }
        if (req.viewerCount() != null) {
            stream.setViewerCount(req.viewerCount());
        }
        if (!isBlank(req.startTime())) {
            stream.setStartTime(parse(req.startTime()));
        }
        if (!isBlank(req.endTime())) {
            stream.setEndTime(parse(req.endTime()));
        }
        if (req.userId() != null) {
            stream.setUserId(req.userId());
        }
        if (req.systemId() != null) {
            stream.setSystemId(req.systemId());
        }
        if (req.metadata() != null) {
            stream.setMetadata(req.metadata());
        }
        return repository.save(stream);
    }

    /** Разбор времени; неверный формат -> 400 "Invalid stream data" (как Zod-ошибка в Express). */
    private Instant parse(String value) {
        try {
            return TimeParse.toInstant(value);
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("Invalid stream data");
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
