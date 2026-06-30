package com.streamdesk.mediamtx;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.streamdesk.config.ApiException;
import com.streamdesk.mediamtx.dto.PathRequest;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Логика MediaMTX (SD-133): сборка URL подключения для всех протоколов, валидация
 * имени пути, create-vs-patch по наличию в конфиге, телеметрия плиток потоков и kick.
 * Низкоуровневый клиент мокается — проверяется именно сервис.
 */
class MediaMtxServiceTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final MediaMtxClient client = mock(MediaMtxClient.class);
    private final MediaMtxProperties props =
            new MediaMtxProperties("http://localhost:9997", "stream.example.com",
                    8890, 1935, 8888, 8889, 8554, "http");
    private final MediaMtxService service = new MediaMtxService(client, props);

    private JsonNode json(String raw) {
        try {
            return mapper.readTree(raw);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    void buildUrls_assemblesAllProtocolUrls() {
        Map<String, Object> urls = service.buildUrls("otis-air");

        Map<String, Object> publish = (Map<String, Object>) urls.get("publish");
        Map<String, Object> read = (Map<String, Object>) urls.get("read");

        assertEquals("srt://stream.example.com:8890?streamid=publish:otis-air", publish.get("srt"));
        assertEquals("rtmp://stream.example.com:1935/otis-air", publish.get("rtmp"));
        assertEquals("http://stream.example.com:8888/otis-air/index.m3u8", read.get("hls"));
        assertEquals("http://stream.example.com:8889/otis-air/whep", read.get("whep"));
        // Готовый HLS вынесен на верхний уровень — основной URL плеера «Эфир ОТИС».
        assertEquals("http://stream.example.com:8888/otis-air/index.m3u8", urls.get("hls"));
    }

    @Test
    void invalidPathName_isRejected() {
        ApiException ex = assertThrows(ApiException.class, () -> service.deletePath("bad name/with slash"));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatus());
    }

    @Test
    @SuppressWarnings("unchecked")
    void createOrUpdatePath_addsWhenAbsent_publisherSourceByDefault() {
        when(client.listConfigPaths()).thenReturn(json("{\"items\":[]}"));

        service.createOrUpdatePath(new PathRequest("otis-air", null, null));

        ArgumentCaptor<Map<String, Object>> cfg = ArgumentCaptor.forClass(Map.class);
        verify(client).addConfigPath(eq("otis-air"), cfg.capture());
        verify(client, never()).patchConfigPath(any(), any());
        assertEquals("publisher", cfg.getValue().get("source"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void createOrUpdatePath_patchesWhenPresent_carriesPullSource() {
        when(client.listConfigPaths()).thenReturn(json("{\"items\":[{\"name\":\"otis-air\"}]}"));

        service.createOrUpdatePath(new PathRequest("otis-air", "srt://src:9000", true));

        ArgumentCaptor<Map<String, Object>> cfg = ArgumentCaptor.forClass(Map.class);
        verify(client).patchConfigPath(eq("otis-air"), cfg.capture());
        verify(client, never()).addConfigPath(any(), any());
        assertEquals("srt://src:9000", cfg.getValue().get("source"));
        assertEquals(true, cfg.getValue().get("sourceOnDemand"));
    }

    @Test
    void listStreams_buildsTelemetryTile() {
        when(client.listPaths()).thenReturn(json("""
                {"items":[
                  {"name":"otis-air","ready":true,"bytesReceived":1000,"bytesSent":2000,
                   "source":{"type":"srtConn","id":"s1"},
                   "tracks":["H264","MPEG-4 Audio"],
                   "readers":[{"type":"hlsMuxer","id":"r1"}]}
                ]}"""));
        when(client.listSrtConns()).thenReturn(json("{\"items\":[]}"));

        List<Map<String, Object>> streams = service.listStreams();

        assertEquals(1, streams.size());
        Map<String, Object> tile = streams.get(0);
        assertEquals("otis-air", tile.get("name"));
        assertEquals(true, tile.get("ready"));
        assertEquals(1, tile.get("readerCount"));
        assertEquals(1000L, ((Number) tile.get("bytesReceived")).longValue());
        assertTrue(tile.get("urls") != null);
        assertTrue(tile.get("vmix") != null);
        // Первый опрос — нет предыдущего снимка, битрейт ещё неизвестен.
        assertNull(tile.get("bitrateInKbps"));
    }

    @Test
    void kick_validatesAndDelegates() {
        // нет type/id
        assertEquals(HttpStatus.BAD_REQUEST,
                assertThrows(ApiException.class, () -> service.kick(null, "x")).getStatus());

        // тип без kick-эндпоинта (hlsMuxer) → клиент вернул false → понятная ошибка
        when(client.kick("hlsMuxer", "r1")).thenReturn(false);
        assertEquals(HttpStatus.BAD_REQUEST,
                assertThrows(ApiException.class, () -> service.kick("hlsMuxer", "r1")).getStatus());

        // поддерживаемый тип → без исключения, делегирование в клиент
        when(client.kick("srtConn", "s1")).thenReturn(true);
        service.kick("srtConn", "s1");
        verify(client).kick("srtConn", "s1");
    }

    @Test
    void isReachable_delegatesToClient() {
        when(client.isReachable()).thenReturn(true);
        assertTrue(service.isReachable());
    }
}
