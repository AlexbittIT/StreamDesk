package com.streamdesk.equipment;

import com.streamdesk.config.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Загрузка фото оборудования — перенос /api/equipment/photos/upload и /api/equipment/{id}/photos.
 * Только изображения; файлы сохраняются в uploads/ (отдаются через /uploads/**).
 */
@Service
public class EquipmentPhotoService {

    private final EquipmentRepository repository;

    public EquipmentPhotoService(EquipmentRepository repository) {
        this.repository = repository;
    }

    /** Сохранить загруженное фото и вернуть его url. */
    public String saveUpload(MultipartFile file) {
        if (file == null || file.isEmpty()
                || file.getContentType() == null || !file.getContentType().startsWith("image/")) {
            throw ApiException.badRequest("No photo file provided");
        }
        try {
            Path uploadDir = Paths.get(System.getProperty("user.dir"), "uploads");
            Files.createDirectories(uploadDir);
            String original = file.getOriginalFilename() != null ? file.getOriginalFilename() : "photo";
            String ext = original.contains(".") ? original.substring(original.lastIndexOf('.')) : "";
            String filename = "photo-" + System.currentTimeMillis() + "-"
                    + ThreadLocalRandom.current().nextInt(1_000_000_000) + ext;
            file.transferTo(uploadDir.resolve(filename).toFile());
            return "/uploads/" + filename;
        } catch (IOException e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to upload photo");
        }
    }

    /** Сохранить фото и дописать его в equipment.photos. */
    @Transactional
    public Equipment addPhoto(String equipmentId, MultipartFile file) {
        String url = saveUpload(file);
        Equipment equipment = repository.findById(equipmentId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Equipment not found"));
        List<Object> photos = equipment.getPhotos() != null ? new ArrayList<>(equipment.getPhotos()) : new ArrayList<>();
        photos.add(url);
        equipment.setPhotos(photos);
        return repository.save(equipment);
    }
}
