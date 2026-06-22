package com.streamdesk.computer;

import com.streamdesk.computer.dto.ComputerRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * REST-контроллер компьютеров — перенос /api/computers из backend/routes.ts. Пути сохранены.
 */
@RestController
@RequestMapping("/api/computers")
public class ComputerController {

    private final ComputerService computerService;

    public ComputerController(ComputerService computerService) {
        this.computerService = computerService;
    }

    @GetMapping
    public List<Computer> list() {
        return computerService.list();
    }

    @PostMapping
    public ResponseEntity<Computer> create(@RequestBody ComputerRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(computerService.create(req));
    }

    @PutMapping("/{id}")
    public Computer update(@PathVariable String id, @RequestBody ComputerRequest req) {
        return computerService.update(id, req);
    }

    @DeleteMapping("/{id}")
    public Map<String, Boolean> delete(@PathVariable String id) {
        computerService.delete(id);
        return Map.of("success", true);
    }
}
