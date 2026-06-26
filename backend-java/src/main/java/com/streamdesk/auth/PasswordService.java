package com.streamdesk.auth;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

/**
 * Хеширование и проверка паролей — порт backend/auth.ts.
 * BCrypt cost 12 (через PasswordEncoder из SecurityConfig). Поддерживает legacy plain-пароли:
 * при совпадении с открытым паролем возвращает хеш для обновления в БД.
 */
@Service
public class PasswordService {

    private static final String BCRYPT_PREFIX = "$2";
    private static final int MAX_BCRYPT_INPUT = 72;

    private final PasswordEncoder encoder;

    public PasswordService(PasswordEncoder encoder) {
        this.encoder = encoder;
    }

    /** Уже ли в БД лежит bcrypt-хеш, а не открытый пароль. */
    public boolean isPasswordHashed(String stored) {
        return stored != null && stored.startsWith(BCRYPT_PREFIX);
    }

    /** Хешировать пароль перед сохранением. Слишком длинные/пустые возвращаем как есть (как в auth.ts). */
    public String hashPassword(String plain) {
        if (plain == null || plain.isEmpty() || plain.length() > MAX_BCRYPT_INPUT) {
            return plain;
        }
        return encoder.encode(plain);
    }

    /**
     * Сравнить введённый пароль с хранимым (хеш или legacy plain).
     * Если совпало с plain — в результате будет updateHash для апгрейда записи в БД.
     */
    public VerifyResult verifyPassword(String plain, String stored) {
        if (stored == null || stored.isEmpty()) {
            return VerifyResult.failure();
        }
        if (isPasswordHashed(stored)) {
            return encoder.matches(plain, stored) ? VerifyResult.success() : VerifyResult.failure();
        }
        // Legacy: хранился открытый пароль — сравнить и предложить обновить на хеш.
        if (plain != null && plain.equals(stored)) {
            return VerifyResult.successWithUpgrade(hashPassword(plain));
        }
        return VerifyResult.failure();
    }

    /** Результат проверки. updateHash != null означает «обнови хеш в БД». */
    public record VerifyResult(boolean ok, String updateHash) {
        static VerifyResult success() {
            return new VerifyResult(true, null);
        }

        static VerifyResult successWithUpgrade(String hash) {
            return new VerifyResult(true, hash);
        }

        static VerifyResult failure() {
            return new VerifyResult(false, null);
        }
    }
}