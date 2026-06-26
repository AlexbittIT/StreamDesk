package com.streamdesk.user;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * Сервис пользователей — замена методов getUser, createUser, updateUser из IStorage (backend/database.ts).
 */
@Service
public class UserService {

    private final UserRepository repository;

    public UserService(UserRepository repository) {
        this.repository = repository;
    }

    public Optional<User> findById(String id) {
        return repository.findById(id);
    }

    public Optional<User> findByUsername(String username) {
        return repository.findByUsername(username);
    }

    public Optional<User> findByTelegramId(String telegramId) {
        return repository.findByTelegramId(telegramId);
    }

    public List<User> getAllUsers() {
        return repository.findAll();
    }

    /** аналог getUsers() — только активные, по имени. */
    public List<User> getActiveUsers() {
        return repository.findByActiveTrueOrderByName();
    }

    public User save(User user) {
        return repository.save(user);
    }

    public boolean existsById(String id) {
        return repository.existsById(id);
    }

    public void deleteById(String id) {
        repository.deleteById(id);
    }

    /** Есть ли в БД хоть один пользователь с ролью admin (для авто-создания админа на первом логине). */
    public boolean adminExists() {
        return repository.findByUsername("admin").isPresent();
    }

    public void updateLastLogin(String userId) {
        repository.findById(userId).ifPresent(u -> {
            u.setLastLogin(Instant.now());
            repository.save(u);
        });
    }

    /** Уникальна ли почта (без учёта регистра). Пустую почту считаем свободной. */
    public boolean isEmailTaken(String email) {
        if (email == null || email.isBlank()) {
            return false;
        }
        String normalized = email.trim().toLowerCase();
        return repository.findAll().stream()
                .anyMatch(u -> u.getEmail() != null && u.getEmail().trim().toLowerCase().equals(normalized));
    }
}