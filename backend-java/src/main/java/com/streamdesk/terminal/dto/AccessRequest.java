package com.streamdesk.terminal.dto;

import java.util.List;

/**
 * Тело POST /api/terminal/access.
 */
public record AccessRequest(List<String> allowedRoles) {
}
