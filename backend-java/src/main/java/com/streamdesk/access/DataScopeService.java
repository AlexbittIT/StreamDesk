package com.streamdesk.access;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.company.CompanyMember;
import com.streamdesk.company.CompanyService;
import com.streamdesk.role.Role;
import com.streamdesk.role.RoleRepository;
import com.streamdesk.user.User;
import com.streamdesk.user.UserService;
import org.springframework.stereotype.Service;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Область видимости данных (уровни доступа): свои / свой отдел / все.
 *
 * Источник правды об уровне — поле {@code data_scope} роли пользователя. Разделение между
 * компаниями применяется ВСЕГДА (даже на уровне «все»), независимо от уровня видимости.
 *
 * Сервис ничего не знает о конкретных сущностях — он отдаёт примитивы (уровень, множества
 * id «своих по компании» и «своих по отделу»), на основе которых сервисы задач/событий/др.
 * решают доступ к своим записям.
 */
@Service
public class DataScopeService {

    private final RoleRepository roleRepository;
    private final CompanyService companyService;
    private final UserService userService;

    public DataScopeService(RoleRepository roleRepository,
                            CompanyService companyService,
                            UserService userService) {
        this.roleRepository = roleRepository;
        this.companyService = companyService;
        this.userService = userService;
    }

    /**
     * Уровень видимости пользователя. Админ и право {@code *:view_all} всегда дают ALL
     * (обратная совместимость). Старые роли без поля {@code data_scope} тоже трактуются как ALL.
     */
    public DataScope resolveScope(AuthenticatedUser user) {
        if (user == null) {
            return DataScope.OWN;
        }
        if (user.isAdmin()) {
            return DataScope.ALL;
        }
        List<String> perms = user.permissions();
        if (perms != null && perms.stream().anyMatch(p -> p != null && p.endsWith(":view_all"))) {
            return DataScope.ALL;
        }
        if (user.role() == null || user.role().isBlank()) {
            return DataScope.ALL;
        }
        Role role = roleRepository.findByName(user.role()).orElse(null);
        if (role == null) {
            return DataScope.ALL;
        }
        return DataScope.parse(role.getDataScope());
    }

    /**
     * Множество id пользователей, видимых текущему по компании: все активные участники компаний
     * пользователя (включая его самого). Используется как «барьер компании»: чьи записи в принципе
     * могут быть видны, прежде чем сузить уровнем own/department.
     */
    public Set<String> companyPeerUserIds(AuthenticatedUser user) {
        Set<String> result = new HashSet<>();
        if (user == null || user.id() == null) {
            return result;
        }
        result.add(user.id());
        for (String companyId : companyService.getUserCompanyIds(user)) {
            for (CompanyMember member : companyService.getCompanyMembers(companyId)) {
                if ("active".equals(member.getStatus()) && member.getUserId() != null) {
                    result.add(member.getUserId());
                }
            }
        }
        return result;
    }

    /**
     * Множество id пользователей одного отдела с текущим — среди «своих по компании».
     * Если у пользователя не задан отдел, множество вырождается до него самого (уровень «отдел»
     * не должен раскрывать всех «безотдельных» сотрудников).
     */
    public Set<String> departmentPeerUserIds(AuthenticatedUser user) {
        Set<String> result = new HashSet<>();
        if (user == null || user.id() == null) {
            return result;
        }
        result.add(user.id());
        String department = normalizeDept(user.department());
        if (department == null) {
            return result; // нет отдела → видит только себя на уровне «отдел»
        }
        Set<String> companyPeers = companyPeerUserIds(user);
        for (User u : userService.getAllUsers()) {
            if (u.getId() != null
                    && companyPeers.contains(u.getId())
                    && department.equals(normalizeDept(u.getDepartment()))) {
                result.add(u.getId());
            }
        }
        return result;
    }

    /** Видны ли текущему пользователю записи, «принадлежащие» владельцам из {@code ownerIds}. */
    public boolean isVisible(AuthenticatedUser user, Set<String> visibleOwnerIds, String... ownerIds) {
        if (ownerIds == null) {
            return false;
        }
        for (String ownerId : ownerIds) {
            if (ownerId != null && visibleOwnerIds.contains(ownerId)) {
                return true;
            }
        }
        return false;
    }

    private static String normalizeDept(String dept) {
        if (dept == null) {
            return null;
        }
        String trimmed = dept.trim();
        return trimmed.isEmpty() ? null : trimmed.toLowerCase();
    }
}
