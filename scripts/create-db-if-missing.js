#!/usr/bin/env node
/**
 * Создаёт базу данных streamdesk, если её ещё нет.
 * Читает DATABASE_URL из .env (через dotenv). Подключается к postgres и выполняет CREATE DATABASE.
 */
import "dotenv/config";
import postgres from "postgres";

const url = (process.env.DATABASE_URL || "").trim().replace(/^["']|["']$/g, "");
if (!url) {
  console.log("DATABASE_URL не задан — пропуск создания БД.");
  process.exit(0);
}

// Подключаемся к служебной БД postgres, чтобы создать целевую БД
const match = url.match(/\/([^/?]+)(\?|$)/);
const dbName = (match && match[1]) ? match[1] : "streamdesk";
const baseUrl = url.replace(/\/[^/?]*(\?.*)?$/, "/postgres$1");

if (dbName === "postgres") {
  process.exit(0);
}

const sql = postgres(baseUrl, { max: 1 });
try {
  const exists = await sql`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
  if (exists.length > 0) {
    console.log("База данных '%s' уже существует.", dbName);
  } else {
    await sql.unsafe(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
    console.log("База данных '%s' создана.", dbName);
  }
} catch (e) {
  console.warn("Не удалось создать БД (возможно, нет прав или неверный пароль):", e.message);
}
try {
  if (typeof sql.end === "function") await sql.end();
} catch (_) {}
