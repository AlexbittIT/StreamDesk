package com.streamdesk.mediamtx;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.streamdesk.config.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;

/**
 * Низкоуровневый клиент Control API MediaMTX (v3). Управляет «путями» (paths):
 * список/получение рантайма и добавление/удаление в конфиге. Сетевые сбои и
 * не-2xx превращаются в ApiException, чтобы контроллер отдал понятный статус.
 */
@Component
public class MediaMtxClient {

    private static final Logger log = LoggerFactory.getLogger(MediaMtxClient.class);

    private final ObjectMapper objectMapper;
    private final MediaMtxProperties props;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    public MediaMtxClient(ObjectMapper objectMapper, MediaMtxProperties props) {
        this.objectMapper = objectMapper;
        this.props = props;
    }

    /** Активные пути (рантайм): GET /v3/paths/list. */
    public JsonNode listPaths() {
        return get("/v3/paths/list");
    }

    /** Один активный путь: GET /v3/paths/get/{name}. */
    public JsonNode getPath(String name) {
        return get("/v3/paths/get/" + encode(name));
    }

    /** Сконфигурированные пути: GET /v3/config/paths/list. */
    public JsonNode listConfigPaths() {
        return get("/v3/config/paths/list");
    }

    /** Добавить путь в конфиг: POST /v3/config/paths/add/{name}. */
    public void addConfigPath(String name, Map<String, Object> config) {
        send("POST", "/v3/config/paths/add/" + encode(name), config);
    }

    /** Изменить путь в конфиге: PATCH /v3/config/paths/patch/{name}. */
    public void patchConfigPath(String name, Map<String, Object> config) {
        send("PATCH", "/v3/config/paths/patch/" + encode(name), config);
    }

    /** Удалить путь из конфига: DELETE /v3/config/paths/delete/{name}. */
    public void deleteConfigPath(String name) {
        send("DELETE", "/v3/config/paths/delete/" + encode(name), null);
    }

    /** Активные SRT-соединения: GET /v3/srtconns/list (нужно для RTT публикующего источника). */
    public JsonNode listSrtConns() {
        return get("/v3/srtconns/list");
    }

    /**
     * Отключить (kick) соединение/сессию MediaMTX по типу источника и id.
     * Возвращает false, если для такого типа kick не поддерживается (например, hlsMuxer).
     */
    public boolean kick(String type, String id) {
        String endpoint = kickEndpoint(type);
        if (endpoint == null) {
            return false;
        }
        send("POST", endpoint + "/" + encode(id), null);
        return true;
    }

    private String kickEndpoint(String type) {
        if (type == null) {
            return null;
        }
        return switch (type) {
            case "srtConn" -> "/v3/srtconns/kick";
            case "rtmpConn" -> "/v3/rtmpconns/kick";
            case "rtspConn" -> "/v3/rtspconns/kick";
            case "rtspSession" -> "/v3/rtspsessions/kick";
            case "webRTCSession" -> "/v3/webrtcsessions/kick";
            // hlsMuxer/прочие читатели не имеют kick-эндпоинта
            default -> null;
        };
    }

    /** Доступен ли Control API (для health-проверки). */
    public boolean isReachable() {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(props.apiUrl() + "/v3/paths/list"))
                    .timeout(Duration.ofSeconds(3))
                    .GET()
                    .build();
            HttpResponse<Void> response = httpClient.send(request, HttpResponse.BodyHandlers.discarding());
            return response.statusCode() / 100 == 2;
        } catch (Exception e) {
            return false;
        }
    }

    // --- внутреннее ---

    private JsonNode get(String path) {
        return send("GET", path, null);
    }

    private JsonNode send(String method, String path, Map<String, Object> body) {
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(props.apiUrl() + path))
                    .timeout(Duration.ofSeconds(10))
                    .header("Content-Type", "application/json");

            HttpRequest.BodyPublisher publisher = body != null
                    ? HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body))
                    : HttpRequest.BodyPublishers.noBody();
            builder.method(method, publisher);

            HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
            int code = response.statusCode();
            if (code / 100 != 2) {
                String detail = extractError(response.body());
                throw new ApiException(mapStatus(code),
                        "MediaMTX вернул статус " + code + (detail.isBlank() ? "" : ": " + detail));
            }
            String responseBody = response.body();
            if (responseBody == null || responseBody.isBlank()) {
                return objectMapper.createObjectNode();
            }
            return objectMapper.readTree(responseBody);
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            log.warn("MediaMTX {} {} не удалось: {}", method, path, e.getMessage());
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "MediaMTX недоступен по адресу " + props.apiUrl() + " (" + e.getMessage() + ")");
        }
    }

    private HttpStatus mapStatus(int code) {
        if (code == 404) return HttpStatus.NOT_FOUND;
        if (code == 400) return HttpStatus.BAD_REQUEST;
        if (code == 409) return HttpStatus.CONFLICT;
        return HttpStatus.BAD_GATEWAY;
    }

    private String extractError(String body) {
        if (body == null || body.isBlank()) {
            return "";
        }
        try {
            JsonNode node = objectMapper.readTree(body);
            JsonNode error = node.path("error");
            return error.isMissingNode() ? body.trim() : error.asText();
        } catch (Exception e) {
            return body.trim();
        }
    }

    private String encode(String name) {
        return java.net.URLEncoder.encode(name, StandardCharsets.UTF_8).replace("+", "%20");
    }
}
