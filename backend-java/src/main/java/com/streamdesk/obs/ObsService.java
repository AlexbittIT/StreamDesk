package com.streamdesk.obs;

import com.streamdesk.config.ApiException;
import com.streamdesk.obs.dto.ObsRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Логика подключений OBS — перенос /api/obs/connections из backend/routes.ts.
 */
@Service
public class ObsService {

    private final ObsConnectionRepository repository;

    public ObsService(ObsConnectionRepository repository) {
        this.repository = repository;
    }

    public List<ObsConnection> list() {
        return repository.findAllByOrderByName();
    }

    @Transactional
    public ObsConnection create(ObsRequest req) {
        if (isBlank(req.name()) || isBlank(req.host())) {
            throw ApiException.badRequest("Invalid OBS connection data");
        }
        ObsConnection connection = new ObsConnection();
        connection.setName(req.name());
        connection.setHost(req.host());
        if (req.port() != null) {
            connection.setPort(req.port());
        }
        connection.setPassword(req.password());
        if (!isBlank(req.status())) {
            connection.setStatus(req.status());
        }
        if (!isBlank(req.streamStatus())) {
            connection.setStreamStatus(req.streamStatus());
        }
        return repository.save(connection);
    }

    @Transactional
    public ObsConnection update(String id, ObsRequest req) {
        ObsConnection connection = repository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "OBS connection not found"));
        if (req.name() != null) {
            connection.setName(req.name());
        }
        if (req.host() != null) {
            connection.setHost(req.host());
        }
        if (req.port() != null) {
            connection.setPort(req.port());
        }
        if (req.password() != null) {
            connection.setPassword(req.password());
        }
        if (req.status() != null) {
            connection.setStatus(req.status());
        }
        if (req.streamStatus() != null) {
            connection.setStreamStatus(req.streamStatus());
        }
        return repository.save(connection);
    }

    @Transactional
    public void delete(String id) {
        if (!repository.existsById(id)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "OBS connection not found");
        }
        repository.deleteById(id);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
