package com.streamdesk.system;

import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;

/**
 * Проверка доступности хоста — порт checkIP из backend/routes.ts.
 * TCP-connect к ip:port (по умолчанию 80) с таймаутом 3 секунды.
 */
@Service
public class NetworkService {

    private static final int DEFAULT_PORT = 80;
    private static final int TIMEOUT_MS = 3000;

    public boolean checkIp(String ip) {
        return checkIp(ip, DEFAULT_PORT);
    }

    public boolean checkIp(String ip, int port) {
        if (ip == null || ip.isBlank()) {
            return false;
        }
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(ip.trim(), port), TIMEOUT_MS);
            return true;
        } catch (IOException | IllegalArgumentException e) {
            return false;
        }
    }
}
