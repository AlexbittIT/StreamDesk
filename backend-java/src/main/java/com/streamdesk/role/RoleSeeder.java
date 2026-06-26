package com.streamdesk.role;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Сидер базовых ролей. Создаёт стандартный набор (Администратор / Менеджер / Сотрудник)
 * с уровнями видимости данных, ЕСЛИ таблица ролей пуста.
 *
 * Нужен, потому что в Java-бэкенде роли больше нигде не заводятся автоматически: без него
 * вкладка «Роли» в админке остаётся пустой и уровень видимости не на чем настроить.
 *
 * Идемпотентен: при наличии хотя бы одной роли ничего не делает — существующие/кастомные
 * роли не трогаются.
 */
@Component
public class RoleSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(RoleSeeder.class);

    private final RoleRepository roleRepository;

    public RoleSeeder(RoleRepository roleRepository) {
        this.roleRepository = roleRepository;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (roleRepository.count() > 0) {
            return;
        }

        List<Object> all = List.of(
                "tasks:view", "tasks:create", "tasks:edit", "tasks:delete", "tasks:assign",
                "equipment:view", "equipment:create", "equipment:edit", "equipment:delete", "equipment:reserve",
                "events:view", "events:create", "events:edit", "events:delete",
                "streams:view", "streams:manage",
                "systems:view", "systems:manage",
                "users:view", "users:manage", "roles:manage",
                "admin:panel", "settings:manage");

        List<Object> managerPerms = List.of(
                "tasks:view", "tasks:create", "tasks:edit", "tasks:delete", "tasks:assign",
                "equipment:view", "equipment:create", "equipment:edit", "equipment:reserve",
                "events:view", "events:create", "events:edit", "events:delete",
                "streams:view", "streams:manage",
                "systems:view",
                "users:view", "admin:panel");

        List<Object> employeePerms = List.of(
                "tasks:view", "tasks:create",
                "equipment:view", "equipment:reserve",
                "events:view", "events:create",
                "streams:view", "systems:view");

        // Администратор и менеджер по умолчанию видят всё по компании; рядовой сотрудник — только своё.
        roleRepository.save(role("admin", "Администратор",
                "Полный доступ к рабочему пространству компании", all, "#EF4444", "all"));
        roleRepository.save(role("manager", "Менеджер",
                "Управление задачами, событиями и оборудованием", managerPerms, "#3B82F6", "all"));
        roleRepository.save(role("employee", "Сотрудник",
                "Базовый доступ: свои задачи и назначенные события", employeePerms, "#10B981", "own"));

        log.info("RoleSeeder: создан набор ролей по умолчанию (admin/manager/employee) с уровнями видимости");
    }

    private static Role role(String name, String displayName, String description,
                             List<Object> permissions, String color, String dataScope) {
        Role role = new Role();
        role.setName(name);
        role.setDisplayName(displayName);
        role.setDescription(description);
        role.setPermissions(permissions);
        role.setColor(color);
        role.setDataScope(dataScope);
        role.setIsSystem(true);
        return role;
    }
}
