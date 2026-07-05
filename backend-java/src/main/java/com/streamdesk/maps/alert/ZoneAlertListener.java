package com.streamdesk.maps.alert;

import com.streamdesk.company.CompanyMember;
import com.streamdesk.company.CompanyService;
import com.streamdesk.maps.event.ZoneStatusChangedEvent;
import com.streamdesk.notification.NotificationService;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.Set;

/**
 * Алерт «Проблема» (docs/maps-api.md §6): как только зона переходит в {@code problem}, всем
 * администраторам компании уходит уведомление через существующий модуль нотификаций.
 *
 * <p>Отдельный потребитель того же события {@link ZoneStatusChangedEvent}, что и realtime —
 * ответственности не смешаны. {@code notify(...)} best-effort и не бросает исключений, поэтому
 * сбой уведомления не откатит смену статуса.
 */
@Component
public class ZoneAlertListener {

    /** Роли участника компании, считающиеся администраторами для рассылки алертов. */
    private static final Set<String> ADMIN_ROLES = Set.of("owner", "admin");

    private final CompanyService companyService;
    private final NotificationService notificationService;

    public ZoneAlertListener(CompanyService companyService, NotificationService notificationService) {
        this.companyService = companyService;
        this.notificationService = notificationService;
    }

    @EventListener
    public void onStatusChanged(ZoneStatusChangedEvent e) {
        if (!"problem".equals(e.toStatus())) {
            return;
        }
        String title = "Проблема на площадке";
        String message = "Зона «" + e.zone().getName() + "» на карте «" + e.mapName()
                + "» помечена как проблемная.";
        for (CompanyMember member : companyService.getCompanyMembers(e.companyId())) {
            if ("active".equals(member.getStatus()) && ADMIN_ROLES.contains(member.getRole())) {
                notificationService.notify(member.getUserId(), title, message, "warning");
            }
        }
    }
}
