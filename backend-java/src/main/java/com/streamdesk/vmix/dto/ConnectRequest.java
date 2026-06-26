package com.streamdesk.vmix.dto;

/**
 * Тело POST /api/vmix/connect.
 */
public record ConnectRequest(String host, String port) {
}
