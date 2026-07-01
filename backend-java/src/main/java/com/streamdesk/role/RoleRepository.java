package com.streamdesk.role;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/**
 * Репозиторий ролей — замена getRoles/getRoleById/createRole и т.п.
 */
public interface RoleRepository extends JpaRepository<Role, String> {

    // аналог getRoles() — по имени
    List<Role> findAllByOrderByName();

    // роль по имени (users.role хранит name роли) — нужно для определения уровня видимости
    Optional<Role> findByName(String name);
}
