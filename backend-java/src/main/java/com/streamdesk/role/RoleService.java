package com.streamdesk.role;

import com.streamdesk.config.ApiException;
import com.streamdesk.role.dto.RoleRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Логика ролей — перенос /api/roles из backend/routes.ts. Системные роли (isSystem) защищены.
 */
@Service
public class RoleService {

    private final RoleRepository repository;

    public RoleService(RoleRepository repository) {
        this.repository = repository;
    }

    public List<Role> list() {
        return repository.findAllByOrderByName();
    }

    public Role getById(String id) {
        return repository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Role not found"));
    }

    @Transactional
    public Role create(RoleRequest req) {
        if (isBlank(req.name()) || isBlank(req.displayName())) {
            throw ApiException.badRequest("Invalid role data");
        }
        Role role = new Role();
        role.setName(req.name());
        role.setDisplayName(req.displayName());
        role.setDescription(req.description());
        if (req.permissions() != null) {
            role.setPermissions(req.permissions());
        }
        if (!isBlank(req.color())) {
            role.setColor(req.color());
        }
        if (req.isSystem() != null) {
            role.setIsSystem(req.isSystem());
        }
        return repository.save(role);
    }

    @Transactional
    public Role update(String id, RoleRequest req) {
        Role role = getById(id);
        if (Boolean.TRUE.equals(role.getIsSystem())) {
            throw ApiException.forbidden("Cannot modify system role");
        }
        if (req.name() != null) {
            role.setName(req.name());
        }
        if (req.displayName() != null) {
            role.setDisplayName(req.displayName());
        }
        if (req.description() != null) {
            role.setDescription(req.description());
        }
        if (req.permissions() != null) {
            role.setPermissions(req.permissions());
        }
        if (req.color() != null) {
            role.setColor(req.color());
        }
        return repository.save(role);
    }

    @Transactional
    public void delete(String id) {
        Role role = getById(id);
        if (Boolean.TRUE.equals(role.getIsSystem())) {
            throw ApiException.forbidden("Cannot delete system role");
        }
        repository.deleteById(id);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
