package com.streamdesk.project.dto;

import java.util.List;

/**
 * Тело создания/обновления проекта (/api/projects). deadline — строкой (ISO/epoch).
 */
public record ProjectRequest(
        String name,
        String ownerId,
        String companyId,
        String visibility,
        String client,
        String description,
        String status,
        String category,
        String deadline,
        String assignedTo,
        List<Object> participants,
        Boolean showInTaskManager,
        List<Object> devices,
        String storageLocation,
        String estimatedSize,
        String notes,
        List<Object> columns,
        String yougileBoardId
) {
}
