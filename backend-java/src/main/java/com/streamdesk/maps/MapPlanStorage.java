package com.streamdesk.maps;

import com.streamdesk.config.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Приём и надёжное хранение подложки плана площадки (docs/maps-api.md §4, POST /plan, VM-04).
 *
 * <p>Валидирует тип и размер, а затем декодирует байты через {@link ImageIO} — так отсекаются
 * файлы с картиночным расширением/MIME, но не являющиеся картинкой (иначе клиент получил бы
 * битую подложку). Файл кладётся в {@code uploads/maps/} <b>атомарно</b> (temp-файл + move),
 * чтобы при сбое ФС не осталось частичной/битой записи, которую отдаст {@code /uploads/**}.
 */
@Component
public class MapPlanStorage {

    /** Прикладной лимит размера подложки — PNG/JPG ≤ 20 МБ (docs/maps-api.md §4). */
    static final long MAX_SIZE_BYTES = 20L * 1024 * 1024;

    /** Разрешённые MIME-типы подложки. */
    private static final Set<String> ALLOWED_TYPES = Set.of("image/png", "image/jpeg", "image/jpg");

    /** Результат сохранения: url для отдачи и размеры оригинала (для координат зон). */
    public record StoredPlan(String url, int width, int height) {
    }

    /**
     * Проверить файл и надёжно сохранить его как подложку карты.
     *
     * @throws ApiException 400 — пустой/битый файл; 413 — превышен размер; 415 — не картинка;
     *                      500 — сбой хранилища
     */
    public StoredPlan store(String mapId, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("Файл не передан");
        }
        if (file.getSize() > MAX_SIZE_BYTES) {
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "Файл слишком большой (максимум 20 МБ)");
        }
        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_TYPES.contains(contentType.toLowerCase())) {
            throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Поддерживаются только PNG и JPG");
        }

        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw ApiException.badRequest("Не удалось прочитать файл");
        }

        // Декодируем сами байты: отклоняем «картинку» с правильным расширением, но битым содержимым.
        BufferedImage image;
        try {
            image = ImageIO.read(new ByteArrayInputStream(bytes));
        } catch (IOException e) {
            throw ApiException.badRequest("Файл повреждён");
        }
        if (image == null) {
            throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Файл не является изображением");
        }

        String ext = "image/png".equals(contentType.toLowerCase()) ? ".png" : ".jpg";
        String filename = "plan-" + mapId + "-" + System.currentTimeMillis() + "-"
                + ThreadLocalRandom.current().nextInt(1_000_000_000) + ext;
        writeAtomically(bytes, filename);
        return new StoredPlan("/uploads/maps/" + filename, image.getWidth(), image.getHeight());
    }

    /**
     * Атомарная запись: пишем во временный файл в той же папке и переносим на место через
     * {@code ATOMIC_MOVE} (fallback на обычный move, если ФС его не поддерживает). Так читатель
     * {@code /uploads/**} никогда не увидит частично записанный файл; при сбое temp удаляется.
     */
    private void writeAtomically(byte[] bytes, String filename) {
        Path uploadDir = Paths.get(System.getProperty("user.dir"), "uploads", "maps");
        Path tmp = null;
        try {
            Files.createDirectories(uploadDir);
            Path target = uploadDir.resolve(filename);
            tmp = Files.createTempFile(uploadDir, "plan-", ".tmp");
            Files.write(tmp, bytes);
            try {
                Files.move(tmp, target, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            if (tmp != null) {
                try {
                    Files.deleteIfExists(tmp);
                } catch (IOException ignored) {
                    // temp-файл всё равно с расширением .tmp и не раздаётся как подложка
                }
            }
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Не удалось сохранить файл");
        }
    }
}
