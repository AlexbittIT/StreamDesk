package com.streamdesk.location;

import com.streamdesk.config.ApiException;
import com.streamdesk.location.dto.LocationRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Логика пользовательских локаций — перенос /api/locations из backend/routes.ts.
 */
@Service
public class LocationService {

    private final CustomLocationRepository repository;

    public LocationService(CustomLocationRepository repository) {
        this.repository = repository;
    }

    public List<CustomLocation> list() {
        return repository.findAllByOrderByName();
    }

    @Transactional
    public CustomLocation create(LocationRequest req) {
        if (isBlank(req.name())) {
            throw ApiException.badRequest("Введите название локации");
        }
        CustomLocation location = new CustomLocation();
        location.setName(req.name().trim());
        location.setDescription(req.description());
        if (!isBlank(req.type())) {
            location.setType(req.type());
        }
        return repository.save(location);
    }

    @Transactional
    public void delete(String id) {
        // Как deleteCustomLocation в Express — без 404.
        if (repository.existsById(id)) {
            repository.deleteById(id);
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
