package com.streamdesk.access;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.company.CompanyMember;
import com.streamdesk.company.CompanyService;
import com.streamdesk.role.Role;
import com.streamdesk.role.RoleRepository;
import com.streamdesk.user.User;
import com.streamdesk.user.UserService;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Уровни доступа: определение уровня роли и расчёт множеств «свои по компании» / «свои по отделу».
 */
class DataScopeServiceTest {

    private final RoleRepository roleRepository = mock(RoleRepository.class);
    private final CompanyService companyService = mock(CompanyService.class);
    private final UserService userService = mock(UserService.class);
    private final DataScopeService service = new DataScopeService(roleRepository, companyService, userService);

    private static AuthenticatedUser user(String id, String role, String department, List<String> perms) {
        return new AuthenticatedUser(id, id, id, null, null, role, department,
                perms, true, true, "company_member", false);
    }

    private static Role role(String name, String scope) {
        Role r = new Role();
        r.setName(name);
        r.setDisplayName(name);
        r.setDataScope(scope);
        return r;
    }

    @Test
    void adminAlwaysAll() {
        assertEquals(DataScope.ALL, service.resolveScope(user("a", "admin", null, List.of())));
    }

    @Test
    void viewAllPermissionForcesAll() {
        when(roleRepository.findByName("limited")).thenReturn(Optional.of(role("limited", "own")));
        AuthenticatedUser u = user("u", "limited", null, List.of("tasks:view_all"));
        assertEquals(DataScope.ALL, service.resolveScope(u));
    }

    @Test
    void scopeFromRole() {
        when(roleRepository.findByName("dept")).thenReturn(Optional.of(role("dept", "department")));
        when(roleRepository.findByName("mine")).thenReturn(Optional.of(role("mine", "own")));
        assertEquals(DataScope.DEPARTMENT, service.resolveScope(user("u", "dept", null, List.of())));
        assertEquals(DataScope.OWN, service.resolveScope(user("u", "mine", null, List.of())));
    }

    @Test
    void missingOrLegacyRoleDefaultsToAll() {
        when(roleRepository.findByName("legacy")).thenReturn(Optional.empty());
        assertEquals(DataScope.ALL, service.resolveScope(user("u", "legacy", null, List.of())));

        when(roleRepository.findByName("nofield")).thenReturn(Optional.of(role("nofield", null)));
        assertEquals(DataScope.ALL, service.resolveScope(user("u", "nofield", null, List.of())));
    }

    @Test
    void nullUserIsMostRestrictive() {
        assertEquals(DataScope.OWN, service.resolveScope(null));
    }

    @Test
    void companyPeersIncludeOnlyActiveMembersAndSelf() {
        AuthenticatedUser u = user("self", "member", null, List.of());
        when(companyService.getUserCompanyIds(u)).thenReturn(List.of("c1"));
        when(companyService.getCompanyMembers("c1")).thenReturn(List.of(
                member("self", "active"),
                member("peer", "active"),
                member("gone", "removed")));
        Set<String> peers = service.companyPeerUserIds(u);
        assertTrue(peers.contains("self"));
        assertTrue(peers.contains("peer"));
        assertFalse(peers.contains("gone"));
    }

    @Test
    void departmentPeersMatchSameDepartmentWithinCompany() {
        AuthenticatedUser u = user("self", "member", "Video", List.of());
        when(companyService.getUserCompanyIds(u)).thenReturn(List.of("c1"));
        when(companyService.getCompanyMembers("c1")).thenReturn(List.of(
                member("self", "active"),
                member("video2", "active"),
                member("audio1", "active"),
                member("outsider", "active")));
        when(userService.getAllUsers()).thenReturn(List.of(
                appUser("self", "Video"),
                appUser("video2", "video"),   // регистр не важен
                appUser("audio1", "Audio"),
                appUser("outsider", null)));
        Set<String> peers = service.departmentPeerUserIds(u);
        assertEquals(Set.of("self", "video2"), peers);
    }

    @Test
    void departmentScopeWithoutDepartmentSeesOnlySelf() {
        AuthenticatedUser u = user("self", "member", "  ", List.of());
        Set<String> peers = service.departmentPeerUserIds(u);
        assertEquals(Set.of("self"), peers);
    }

    private static CompanyMember member(String userId, String status) {
        CompanyMember m = new CompanyMember();
        m.setUserId(userId);
        m.setStatus(status);
        return m;
    }

    private static User appUser(String id, String department) {
        User u = new User();
        u.setId(id);
        u.setDepartment(department);
        return u;
    }
}
