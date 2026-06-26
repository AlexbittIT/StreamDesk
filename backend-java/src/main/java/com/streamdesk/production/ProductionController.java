package com.streamdesk.production;

import com.streamdesk.config.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Загрузка фото участников продакшн/шоу — перенос /api/production/upload-photo из backend/routes.ts.
 * Только изображения; файлы сохраняются в uploads/production (отдаются через /uploads/**).
 */
@RestController
public class ProductionController {

    @PostMapping("/api/production/upload-photo")
    public Map<String, Object> uploadPhoto(@RequestParam(value = "photo", required = false) MultipartFile photo) {
        if (photo == null || photo.isEmpty()
                || photo.getContentType() == null || !photo.getContentType().startsWith("image/")) {
            throw ApiException.badRequest("Файл не выбран");
        }
        try {
            Path uploadDir = Paths.get(System.getProperty("user.dir"), "uploads", "production");
            Files.createDirectories(uploadDir);
            String original = photo.getOriginalFilename() != null ? photo.getOriginalFilename() : "";
            String ext = original.contains(".") ? original.substring(original.lastIndexOf('.')) : "";
            String filename = "photo-" + System.currentTimeMillis() + "-"
                    + ThreadLocalRandom.current().nextInt(1_000_000_000) + ext;
            photo.transferTo(uploadDir.resolve(filename).toFile());
            return Map.of("url", "/uploads/production/" + filename);
        } catch (IOException e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Ошибка загрузки");
        }
    }
}
