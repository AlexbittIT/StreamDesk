package com.streamdesk.vmix.dto;

/**
 * Тело POST /api/vmix/command.
 */
public record CommandRequest(String command, String host, String port, String input) {
}
