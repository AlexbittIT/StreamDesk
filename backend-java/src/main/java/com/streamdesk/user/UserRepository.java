package com.streamdesk.user;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/**
 * Репозиторий пользователей — замена методов getUser* из IStorage (backend/database.ts).
 * Spring Data JPA сам генерирует SQL по именам методов, писать запросы не нужно.
 */
public interface UserRepository extends JpaRepository<User, String> {

    // аналог getUserByUsername
    Optional<User> findByUsername(String username);

    // аналог getUserByTelegramId
    Optional<User> findByTelegramId(String telegramId);

    // аналог getUsers() — только активные, по имени
    List<User> findByActiveTrueOrderByName();
}