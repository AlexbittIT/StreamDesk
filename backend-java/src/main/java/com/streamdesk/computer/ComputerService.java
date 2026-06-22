package com.streamdesk.computer;

import com.streamdesk.computer.dto.ComputerRequest;
import com.streamdesk.config.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Логика компьютеров — перенос /api/computers из backend/routes.ts.
 */
@Service
public class ComputerService {

    private final ComputerRepository repository;

    public ComputerService(ComputerRepository repository) {
        this.repository = repository;
    }

    public List<Computer> list() {
        return repository.findAllByOrderByName();
    }

    @Transactional
    public Computer create(ComputerRequest req) {
        // Лояльные дефолты, как в Express (name/location -> "", status -> active).
        Computer computer = new Computer();
        computer.setName(req.name() != null ? req.name() : "");
        computer.setLocation(req.location() != null ? req.location() : "");
        computer.setPurpose(req.purpose());
        computer.setStatus(isBlank(req.status()) ? "active" : req.status());
        computer.setIpAddress(req.ipAddress());
        if (req.components() != null) {
            computer.setComponents(req.components());
        }
        computer.setNotes(req.notes());
        return repository.save(computer);
    }

    @Transactional
    public Computer update(String id, ComputerRequest req) {
        Computer computer = repository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Computer not found"));
        if (req.name() != null) {
            computer.setName(req.name());
        }
        if (req.location() != null) {
            computer.setLocation(req.location());
        }
        if (req.purpose() != null) {
            computer.setPurpose(req.purpose());
        }
        if (req.status() != null) {
            computer.setStatus(req.status());
        }
        if (req.ipAddress() != null) {
            computer.setIpAddress(req.ipAddress());
        }
        if (req.components() != null) {
            computer.setComponents(req.components());
        }
        if (req.notes() != null) {
            computer.setNotes(req.notes());
        }
        return repository.save(computer);
    }

    @Transactional
    public void delete(String id) {
        // Как deleteComputer в Express — без 404.
        if (repository.existsById(id)) {
            repository.deleteById(id);
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
