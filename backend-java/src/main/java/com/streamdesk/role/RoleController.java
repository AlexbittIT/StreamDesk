package com.streamdesk.role;

import com.streamdesk.role.dto.RoleRequest;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * REST-контроллер ролей — перенос /api/roles из backend/routes.ts. Пути сохранены.
 */
@RestController
@RequestMapping("/api/roles")
public class RoleController {

    private final RoleService roleService;

    public RoleController(RoleService roleService) {
        this.roleService = roleService;
    }

    @GetMapping
    public List<Role> list() {
        return roleService.list();
    }

    @GetMapping("/{id}")
    public Role get(@PathVariable String id) {
        return roleService.getById(id);
    }

    @PostMapping
    public Role create(@RequestBody RoleRequest req) {
        return roleService.create(req);
    }

    @PutMapping("/{id}")
    public Role update(@PathVariable String id, @RequestBody RoleRequest req) {
        return roleService.update(id, req);
    }

    @DeleteMapping("/{id}")
    public Map<String, Boolean> delete(@PathVariable String id) {
        roleService.delete(id);
        return Map.of("success", true);
    }
}
