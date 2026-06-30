package com.streamdesk.mediamtx;

import com.fasterxml.jackson.databind.JsonNode;
import com.streamdesk.config.ApiException;
import com.streamdesk.mediamtx.dto.PathRequest;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * Логика управления MediaMTX: создание/удаление путей и сборка URL для всех
 * протоколов (SRT/RTMP/HLS/WebRTC/RTSP). Готовый HLS-URL отдаётся фронту
 * («Эфир ОТИС»: HLS/URL после конвертации SRT или прямой поток).
 */
@Service
public class MediaMtxService {

    // MediaMTX допускает в имени пути буквы/цифры и _ . ~ - (без слэшей/пробелов).
    private static final Pattern VALID_NAME = Pattern.compile("[A-Za-z0-9_.~-]+");

    private final MediaMtxClient client;
    private final MediaMtxProperties props;

    /** Снимок счётчиков байт по пути для расчёта битрейта по дельте между опросами. */
    private final Map<String, long[]> byteSnapshots = new ConcurrentHashMap<>();

    public MediaMtxService(MediaMtxClient client, MediaMtxProperties props) {
        this.client = client;
        this.props = props;
    }

    public boolean isReachable() {
        return client.isReachable();
    }

    public JsonNode listPaths() {
        return client.listPaths();
    }

    /** Один путь + готовые URL подключения. */
    public Map<String, Object> getPath(String name) {
        validateName(name);
        JsonNode path = client.getPath(name);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("path", path);
        result.put("urls", buildUrls(name));
        return result;
    }

    /**
     * Создаёт (или обновляет) путь и возвращает URL публикации и чтения.
     * Если путь уже есть в конфиге — патчим, иначе добавляем.
     */
    public Map<String, Object> createOrUpdatePath(PathRequest req) {
        String name = req != null ? req.name() : null;
        validateName(name);

        Map<String, Object> config = new LinkedHashMap<>();
        if (req.source() != null && !req.source().isBlank()) {
            config.put("source", req.source().trim());
            config.put("sourceOnDemand", req.sourceOnDemand() != null ? req.sourceOnDemand() : true);
        } else {
            // Путь без source принимает публикацию от энкодера/vMix.
            config.put("source", "publisher");
        }

        if (configPathExists(name)) {
            client.patchConfigPath(name, config);
        } else {
            client.addConfigPath(name, config);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("name", name);
        result.put("config", config);
        result.put("urls", buildUrls(name));
        return result;
    }

    public void deletePath(String name) {
        validateName(name);
        client.deleteConfigPath(name);
    }

    /** Все URL для пути: куда публиковать и откуда читать (для UI «Эфир ОТИС»). */
    public Map<String, Object> buildUrls(String name) {
        String host = props.host();
        Map<String, Object> publish = new LinkedHashMap<>();
        publish.put("srt", "srt://" + host + ":" + props.srtPort() + "?streamid=publish:" + name);
        publish.put("rtmp", "rtmp://" + host + ":" + props.rtmpPort() + "/" + name);
        publish.put("rtsp", "rtsp://" + host + ":" + props.rtspPort() + "/" + name);

        Map<String, Object> read = new LinkedHashMap<>();
        read.put("hls", props.hlsScheme() + "://" + host + ":" + props.hlsPort() + "/" + name + "/index.m3u8");
        read.put("srt", "srt://" + host + ":" + props.srtPort() + "?streamid=read:" + name);
        read.put("rtmp", "rtmp://" + host + ":" + props.rtmpPort() + "/" + name);
        read.put("rtsp", "rtsp://" + host + ":" + props.rtspPort() + "/" + name);
        read.put("webrtc", props.hlsScheme() + "://" + host + ":" + props.webrtcPort() + "/" + name);
        // WHEP — низколатентный WebRTC для плеера в браузере (<1с).
        read.put("whep", props.hlsScheme() + "://" + host + ":" + props.webrtcPort() + "/" + name + "/whep");

        Map<String, Object> urls = new LinkedHashMap<>();
        urls.put("publish", publish);
        urls.put("read", read);
        // Прямой HLS — основной URL для плеера «Эфир ОТИС».
        urls.put("hls", read.get("hls"));
        return urls;
    }

    /**
     * Список активных потоков с полной телеметрией для плиток дашборда:
     * аптайм, кодеки, суммарные байты, битрейт (по дельте), RTT (для SRT-источника),
     * читатели, URL подключения и параметры для vMix.
     */
    public List<Map<String, Object>> listStreams() {
        JsonNode pathsResponse = client.listPaths();

        // RTT публикующего SRT-соединения: сопоставляем по id источника пути.
        Map<String, Double> srtRttById = new HashMap<>();
        try {
            JsonNode srt = client.listSrtConns();
            JsonNode srtItems = srt.path("items");
            if (srtItems.isArray()) {
                for (JsonNode conn : srtItems) {
                    String id = conn.path("id").asText("");
                    if (!id.isEmpty() && conn.has("msRTT")) {
                        srtRttById.put(id, conn.path("msRTT").asDouble());
                    }
                }
            }
        } catch (ApiException ignored) {
            // SRT-эндпоинт может быть недоступен — RTT просто будет null.
        }

        long now = System.currentTimeMillis();
        List<Map<String, Object>> streams = new ArrayList<>();
        JsonNode items = pathsResponse.path("items");
        if (!items.isArray()) {
            return streams;
        }

        for (JsonNode p : items) {
            String name = p.path("name").asText("");
            if (name.isEmpty()) {
                continue;
            }
            long rx = p.path("bytesReceived").asLong(0);
            long tx = p.path("bytesSent").asLong(0);

            // Битрейт по дельте байт относительно прошлого опроса.
            Long inKbps = null;
            Long outKbps = null;
            long[] prev = byteSnapshots.get(name);
            byteSnapshots.put(name, new long[]{rx, tx, now});
            if (prev != null && now > prev[2]) {
                double secs = (now - prev[2]) / 1000.0;
                if (secs > 0) {
                    inKbps = Math.round(Math.max(0, rx - prev[0]) * 8.0 / 1000.0 / secs);
                    outKbps = Math.round(Math.max(0, tx - prev[1]) * 8.0 / 1000.0 / secs);
                }
            }

            JsonNode source = p.path("source");
            String sourceType = source.path("type").asText("");
            String sourceId = source.path("id").asText("");

            List<String> tracks = new ArrayList<>();
            if (p.path("tracks").isArray()) {
                p.path("tracks").forEach(t -> tracks.add(t.asText()));
            }

            List<Map<String, Object>> readers = new ArrayList<>();
            if (p.path("readers").isArray()) {
                for (JsonNode r : p.path("readers")) {
                    Map<String, Object> reader = new LinkedHashMap<>();
                    reader.put("type", r.path("type").asText(""));
                    reader.put("id", r.path("id").asText(""));
                    readers.add(reader);
                }
            }

            Map<String, Object> urls = buildUrls(name);

            Map<String, Object> tile = new LinkedHashMap<>();
            tile.put("name", name);
            tile.put("ready", p.path("ready").asBoolean(false));
            tile.put("sourceType", sourceType);
            tile.put("sourceId", sourceId);
            tile.put("uptimeSeconds", uptimeSeconds(p.path("readyTime").asText(null), now));
            tile.put("tracks", tracks);
            tile.put("videoCodec", firstTrack(tracks, false));
            tile.put("audioCodec", firstTrack(tracks, true));
            tile.put("bytesReceived", rx);
            tile.put("bytesSent", tx);
            tile.put("bitrateInKbps", inKbps);
            tile.put("bitrateOutKbps", outKbps);
            tile.put("rttMs", srtRttById.get(sourceId));
            tile.put("readers", readers);
            tile.put("readerCount", readers.size());
            tile.put("urls", urls);
            tile.put("vmix", vmixParams(urls));
            streams.add(tile);
        }
        // Чистим снимки путей, которых уже нет.
        byteSnapshots.keySet().removeIf(key -> streams.stream().noneMatch(s -> key.equals(s.get("name"))));
        return streams;
    }

    /** Отключить читателя/соединение по типу источника MediaMTX и id. */
    public void kick(String type, String id) {
        if (type == null || type.isBlank() || id == null || id.isBlank()) {
            throw ApiException.badRequest("Нужны type и id соединения");
        }
        boolean supported = client.kick(type, id);
        if (!supported) {
            throw ApiException.badRequest("Соединение типа «" + type + "» нельзя отключить");
        }
    }

    /** Параметры для vMix (Add Input → Stream/SRT): готовые URL чтения потока. */
    private Map<String, Object> vmixParams(Map<String, Object> urls) {
        Object read = urls.get("read");
        Map<String, Object> vmix = new LinkedHashMap<>();
        if (read instanceof Map<?, ?> r) {
            vmix.put("srt", r.get("srt"));
            vmix.put("rtmp", r.get("rtmp"));
            vmix.put("rtsp", r.get("rtsp"));
            vmix.put("hls", r.get("hls"));
        }
        vmix.put("hint", "vMix → Add Input → Stream/SRT. Режим caller, тип SRT, вставьте SRT-URL.");
        return vmix;
    }

    private Long uptimeSeconds(String readyTime, long now) {
        if (readyTime == null || readyTime.isBlank() || "null".equals(readyTime)) {
            return null;
        }
        try {
            long startMs = Instant.parse(readyTime).toEpochMilli();
            return Math.max(0, (now - startMs) / 1000);
        } catch (Exception e) {
            return null;
        }
    }

    /** Первый аудио- или видео-кодек из списка треков MediaMTX. */
    private String firstTrack(List<String> tracks, boolean audio) {
        for (String track : tracks) {
            if (isAudioTrack(track) == audio) {
                return track;
            }
        }
        return null;
    }

    private boolean isAudioTrack(String track) {
        String t = track == null ? "" : track.toLowerCase();
        return t.contains("audio") || t.contains("aac") || t.contains("opus")
                || t.contains("mp3") || t.contains("g711") || t.contains("pcm")
                || t.contains("ac-3") || t.contains("ac3") || t.contains("vorbis");
    }

    private boolean configPathExists(String name) {
        try {
            JsonNode list = client.listConfigPaths();
            JsonNode items = list.path("items");
            if (items.isArray()) {
                for (JsonNode item : items) {
                    if (name.equals(item.path("name").asText())) {
                        return true;
                    }
                }
            }
        } catch (ApiException e) {
            // Если API недоступен — пусть createOrUpdate упадёт явно на add/patch.
            return false;
        }
        return false;
    }

    private void validateName(String name) {
        if (name == null || name.isBlank() || !VALID_NAME.matcher(name).matches()) {
            throw ApiException.badRequest(
                    "Некорректное имя пути MediaMTX (допустимы латиница, цифры и _ . ~ -)");
        }
    }
}
