package com.streamdesk.staff.dto;

import java.util.List;

/**
 * Ответ отчёта GET /api/staff-reservations/available — свободные сотрудники на период.
 */
public record AvailableStaffResponse(
        String start,
        String end,
        String companyId,
        List<StaffMember> available
) {

    /** Краткая карточка свободного сотрудника (без пароля и прочих чувствительных полей). */
    public record StaffMember(
            String id,
            String name,
            String username,
            String position,
            String department
    ) {
    }
}
