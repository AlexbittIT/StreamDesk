/**
 * Безопасность: хеширование паролей (bcrypt), проверка формата хеша.
 * Не логировать пароли и секреты.
 */
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;
const BCRYPT_PREFIX = "$2";

/** Проверка: хранится ли в БД уже хеш (bcrypt), а не открытый пароль */
export function isPasswordHashed(stored: string | null | undefined): boolean {
  return typeof stored === "string" && stored.startsWith(BCRYPT_PREFIX);
}

/** Хешировать пароль перед сохранением в БД */
export function hashPassword(plain: string): string {
  if (!plain || plain.length > 72) return plain;
  return bcrypt.hashSync(plain, SALT_ROUNDS);
}

/** Сравнить введённый пароль с хранимым (хеш или legacy plain). При совпадении с plain — вернуть хеш для обновления в БД */
export function verifyPassword(
  plain: string,
  stored: string | null | undefined
): { ok: true; updateHash?: string } | { ok: false } {
  if (!stored) return { ok: false };
  if (isPasswordHashed(stored)) {
    const match = bcrypt.compareSync(plain, stored);
    return match ? { ok: true } : { ok: false };
  }
  // Legacy: хранился открытый пароль — сравнить и предложить обновить на хеш
  if (plain === stored) {
    return { ok: true, updateHash: hashPassword(plain) };
  }
  return { ok: false };
}
