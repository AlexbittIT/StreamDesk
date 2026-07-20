package com.streamdesk.maps.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Ответственный за зону — в списке карт отдаётся сразу с именем, чтобы карточка могла
 * показать стопку аватаров без отдельного запроса к {@code /api/users}
 * (он доступен не всем ролям).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record MapAssignee(String id, String name, String avatar) {
}
