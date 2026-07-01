package com.streamdesk.mediamtx;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Настройки подключения к MediaMTX. Сам MediaMTX — внешний бинарь/контейнер;
 * этот бэкенд управляет им через его Control API (по умолчанию порт 9997) и
 * строит URL публикации/чтения для протоколов SRT/RTMP/HLS/WebRTC/RTSP.
 *
 * Переопределяется переменными окружения, например MEDIAMTX_API_URL, MEDIAMTX_HOST.
 */
@Component
public class MediaMtxProperties {

    /** Control API MediaMTX (apiAddress в mediamtx.yml). */
    private final String apiUrl;
    /** Публичный хост, по которому клиенты подключаются к потокам. */
    private final String host;
    private final int srtPort;
    private final int rtmpPort;
    private final int hlsPort;
    private final int webrtcPort;
    private final int rtspPort;
    /** Схема HLS-плеера (http/https) — для отдачи готового m3u8-URL. */
    private final String hlsScheme;

    public MediaMtxProperties(
            @Value("${app.mediamtx.api-url:http://localhost:9997}") String apiUrl,
            @Value("${app.mediamtx.host:localhost}") String host,
            @Value("${app.mediamtx.srt-port:8890}") int srtPort,
            @Value("${app.mediamtx.rtmp-port:1935}") int rtmpPort,
            @Value("${app.mediamtx.hls-port:8888}") int hlsPort,
            @Value("${app.mediamtx.webrtc-port:8889}") int webrtcPort,
            @Value("${app.mediamtx.rtsp-port:8554}") int rtspPort,
            @Value("${app.mediamtx.hls-scheme:http}") String hlsScheme) {
        this.apiUrl = apiUrl == null ? "http://localhost:9997" : apiUrl.replaceAll("/+$", "");
        this.host = host;
        this.srtPort = srtPort;
        this.rtmpPort = rtmpPort;
        this.hlsPort = hlsPort;
        this.webrtcPort = webrtcPort;
        this.rtspPort = rtspPort;
        this.hlsScheme = hlsScheme;
    }

    public String apiUrl() {
        return apiUrl;
    }

    public String host() {
        return host;
    }

    public int srtPort() {
        return srtPort;
    }

    public int rtmpPort() {
        return rtmpPort;
    }

    public int hlsPort() {
        return hlsPort;
    }

    public int webrtcPort() {
        return webrtcPort;
    }

    public int rtspPort() {
        return rtspPort;
    }

    public String hlsScheme() {
        return hlsScheme;
    }
}
