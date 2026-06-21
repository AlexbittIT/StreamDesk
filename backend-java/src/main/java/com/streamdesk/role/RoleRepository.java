package com.streamdesk.role;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Репозиторий ролей — замена getRoles/getRoleById/createRole и т.п.
 */
public interface RoleRepository extends JpaRepository<Role, String> {

    // аналог getRoles() — по имени
    List<Role> findAllByOrderByName();
}
