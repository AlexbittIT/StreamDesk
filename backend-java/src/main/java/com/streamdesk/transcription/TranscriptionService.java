package com.streamdesk.transcription;

import com.streamdesk.config.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Stream;

/**
 * Транскрипции/подкасты — файловые операции в uploads/transcriptions.
 * Перенос /api/transcriptions/* из backend/routes.ts. Пути санитизируются (без выхода за базу).
 */
@Service
public class TranscriptionService {

    private final Path baseDir = Paths.get(System.getProperty("user.dir"), "uploads", "transcriptions");

    /** GET /api/transcriptions/podcasts — список папок-подкастов. */
    public List<Map<String, Object>> listPodcasts() {
        ensureDir(baseDir);
        return listDirNames(baseDir).stream()
                .map(name -> Map.<String, Object>of("name", name))
                .toList();
    }

    /** POST /api/transcriptions/podcasts. */
    public Map<String, Object> createPodcast(String name) {
        if (name == null || name.isBlank()) {
            throw ApiException.badRequest("Название подкаста обязательно");
        }
        ensureDir(safePath(name));
        return Map.of("name", name);
    }

    /** DELETE /api/transcriptions/podcasts/{podcast}. */
    public Map<String, Object> deletePodcast(String podcast) {
        Path target = safePath(podcast);
        if (!target.startsWith(baseDir) || target.equals(baseDir)) {
            throw ApiException.badRequest("Недопустимое имя подкаста");
        }
        if (!Files.isDirectory(target)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Подкаст не найден");
        }
        deleteRecursively(target);
        return Map.of("success", true);
    }

    /** GET /api/transcriptions/podcasts/{podcast}/contents?path= */
    public Map<String, Object> listContents(String podcast, String relativePath) {
        Path target = safePath(podcast, relativePath != null ? relativePath : "");
        ensureDir(target);
        List<Map<String, Object>> folders = new ArrayList<>();
        List<Map<String, Object>> files = new ArrayList<>();
        try (Stream<Path> entries = Files.list(target)) {
            entries.sorted(Comparator.comparing(p -> p.getFileName().toString())).forEach(p -> {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("name", p.getFileName().toString());
                if (Files.isDirectory(p)) {
                    item.put("type", "folder");
                    folders.add(item);
                } else {
                    item.put("type", "file");
                    files.add(item);
                }
            });
        } catch (IOException e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to list podcast contents");
        }
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("folders", folders);
        response.put("files", files);
        return response;
    }

    /** POST /api/transcriptions/podcasts/{podcast}/folders. */
    public Map<String, Object> createFolder(String podcast, String parentPath, String name) {
        if (name == null || name.isBlank()) {
            throw ApiException.badRequest("Название папки обязательно");
        }
        ensureDir(safePath(podcast, parentPath != null ? parentPath : "", name));
        return Map.of("name", name);
    }

    /** DELETE /api/transcriptions/podcasts/{podcast}/contents?path= */
    public Map<String, Object> deleteContent(String podcast, String relativePath) {
        if (relativePath == null || relativePath.isEmpty()) {
            throw ApiException.badRequest("Укажите path (файл или папку)");
        }
        Path target = safePath(podcast, relativePath);
        Path base = safePath(podcast);
        if (!target.startsWith(base)) {
            throw ApiException.badRequest("Недопустимый путь");
        }
        if (!Files.exists(target)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Файл или папка не найдены");
        }
        deleteRecursively(target);
        return Map.of("success", true);
    }

    /** POST /api/transcriptions/upload. */
    public Map<String, Object> upload(String podcast, String relativePath, MultipartFile file) {
        String trimmedPodcast = podcast != null ? podcast.trim() : "";
        if (trimmedPodcast.isEmpty()) {
            throw ApiException.badRequest("Выберите подкаст (папку) для загрузки");
        }
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("Файл не выбран");
        }
        String safePodcast = trimmedPodcast.replaceAll("[^\\p{L}0-9_\\- ]", "_");
        String rel = relativePath != null ? relativePath.trim() : "";
        String safeRelative = rel.replaceAll("\\.\\.[/\\\\]", "").replaceAll("[^\\p{L}0-9_\\-/\\\\ ]", "_");

        Path targetDir = safeRelative.isEmpty() ? baseDir.resolve(safePodcast) : baseDir.resolve(safePodcast).resolve(safeRelative);
        ensureDir(targetDir);

        String original = file.getOriginalFilename() != null ? file.getOriginalFilename() : "file";
        String ext = original.contains(".") ? original.substring(original.lastIndexOf('.')) : "";
        String base = (ext.isEmpty() ? original : original.substring(0, original.length() - ext.length()))
                .replaceAll("[^\\p{L}0-9_\\- ]", "_");
        String filename = base + "-" + System.currentTimeMillis() + "-" + ThreadLocalRandom.current().nextInt(1_000_000_000) + ext;

        Path targetPath = targetDir.resolve(filename);
        try {
            file.transferTo(targetPath.toFile());
        } catch (IOException e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Не удалось загрузить файл");
        }

        Path cwd = Paths.get(System.getProperty("user.dir"));
        String storagePath = cwd.relativize(targetPath).toString().replace('\\', '/');
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("name", filename);
        response.put("originalName", original);
        response.put("size", file.getSize());
        response.put("podcast", safePodcast);
        response.put("path", rel);
        response.put("url", "/" + storagePath);
        return response;
    }

    // --- helpers ---

    private Path safePath(String... segments) {
        Path p = baseDir;
        for (String seg : segments) {
            if (seg == null || seg.isEmpty()) {
                continue;
            }
            String s = seg.trim()
                    .replaceAll("\\.\\.[/\\\\]", "")
                    .replaceAll("[^\\p{L}0-9_\\-/\\\\ .]", "_");
            if (!s.isEmpty()) {
                p = p.resolve(s);
            }
        }
        return p.normalize();
    }

    private List<String> listDirNames(Path dir) {
        try (Stream<Path> entries = Files.list(dir)) {
            return entries.filter(Files::isDirectory)
                    .map(p -> p.getFileName().toString())
                    .sorted()
                    .toList();
        } catch (IOException e) {
            return List.of();
        }
    }

    private void ensureDir(Path dir) {
        try {
            Files.createDirectories(dir);
        } catch (IOException ignored) {
            // best-effort, как в Express
        }
    }

    private void deleteRecursively(Path path) {
        try {
            if (Files.isDirectory(path)) {
                try (Stream<Path> walk = Files.walk(path)) {
                    walk.sorted(Comparator.reverseOrder()).forEach(p -> {
                        try {
                            Files.delete(p);
                        } catch (IOException ignored) {
                            // пропускаем
                        }
                    });
                }
            } else {
                Files.deleteIfExists(path);
            }
        } catch (IOException e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Не удалось удалить");
        }
    }
}
