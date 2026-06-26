package com.streamdesk.project.dto;

import java.util.List;

/**
 * Тело POST /api/projects/{projectId}/columns/reorder.
 */
public record ReorderRequest(List<String> columnIds) {
}
