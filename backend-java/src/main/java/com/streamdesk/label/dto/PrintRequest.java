package com.streamdesk.label.dto;

import java.util.List;

/**
 * Тело POST /api/equipment/labels/print.
 */
public record PrintRequest(List<String> equipmentIds) {
}
