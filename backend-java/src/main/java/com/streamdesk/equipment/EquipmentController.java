package com.streamdesk.equipment;

import com.streamdesk.equipment.dto.SearchRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

/**
 * REST-контроллер оборудования — образец переноса маршрутов из backend/routes.ts.
 * Эндпоинты совпадают с текущими (/api/equipment), чтобы фронт работал без изменений.
 *
 * Это эталонный паттерн Controller -> Repository. По нему переноси остальные домены
 * (Events, Tasks, Streams и т.д.). В реальном коде между контроллером и репозиторием
 * обычно добавляют слой Service для бизнес-логики.
 */
@RestController
@RequestMapping("/api/equipment")
public class EquipmentController {

    private final EquipmentRepository repository;
    private final EquipmentSearchService searchService;
    private final EquipmentPhotoService photoService;

    public EquipmentController(EquipmentRepository repository, EquipmentSearchService searchService,
                               EquipmentPhotoService photoService) {
        this.repository = repository;
        this.searchService = searchService;
        this.photoService = photoService;
    }

    // POST /api/equipment/photos/upload — загрузить фото, вернуть url
    @PostMapping("/photos/upload")
    public Map<String, Object> uploadPhoto(@RequestParam(value = "photo", required = false) MultipartFile photo) {
        return Map.of("url", photoService.saveUpload(photo));
    }

    // POST /api/equipment/{id}/photos — загрузить фото и привязать к оборудованию
    @PostMapping("/{id}/photos")
    public Equipment addPhoto(@PathVariable String id,
                              @RequestParam(value = "photo", required = false) MultipartFile photo) {
        return photoService.addPhoto(id, photo);
    }

    // GET /api/equipment/barcode/{barcode}
    @GetMapping("/barcode/{barcode}")
    public Equipment byBarcode(@PathVariable String barcode) {
        return searchService.findByBarcode(barcode);
    }

    // POST /api/equipment/search
    @PostMapping("/search")
    public Map<String, Object> search(@RequestBody SearchRequest req) {
        return searchService.search(req != null ? req.query() : null);
    }

    // GET /api/equipment  (опционально ?status=available)
    @GetMapping
    public List<Equipment> list(@RequestParam(required = false) String status) {
        if (status != null && !status.isBlank()) {
            return repository.findByStatusOrderByName(status);
        }
        return repository.findAllByOrderByName();
    }

    // GET /api/equipment/{id}
    @GetMapping("/{id}")
    public ResponseEntity<Equipment> getById(@PathVariable String id) {
        return repository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    // POST /api/equipment
    @PostMapping
    public Equipment create(@RequestBody Equipment equipment) {
        return repository.save(equipment);
    }

    // PUT /api/equipment/{id}
    @PutMapping("/{id}")
    public ResponseEntity<Equipment> update(@PathVariable String id, @RequestBody Equipment data) {
        return repository.findById(id)
                .map(existing -> {
                    data.setId(existing.getId());
                    data.setCreatedAt(existing.getCreatedAt());
                    return ResponseEntity.ok(repository.save(data));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    // DELETE /api/equipment/{id}
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        if (!repository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        repository.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}