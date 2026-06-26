package com.streamdesk.vmix.dto;

/**
 * Тело POST /api/agents/vmix-scheduler/{eventId}/result.
 */
public record AgentResultRequest(
        String agentKey,
        String companyId,
        String workspaceKey,
        String status,
        String message,
        String executedAt
) {
}
