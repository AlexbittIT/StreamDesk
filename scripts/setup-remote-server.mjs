#!/usr/bin/env node
/**
 * Один раз настраивает сервер: PostgreSQL, пользователь и БД, права, .env, Node/PM2.
 * Запуск: set SSH_PASSWORD=ваш_пароль_сервера && node scripts/setup-remote-server.mjs
 * Или с deploy.config: SERVER_USER, SERVER_IP, SERVER_PORT, SERVER_PATH.
 * Пароль сервера — только из переменной SSH_PASSWORD (в файл не писать).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { Client } from "ssh2";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function readDeployConfig() {
  const env = { ...process.env };
  for (const file of [path.join(root, ".env"), path.join(root, "deploy.config")]) {
    try {
      const content = fs.readFileSync(file, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const t = line.replace(/^\s+|\s+$/g, "");
        if (!t || t.startsWith("#")) continue;
        const eq = t.indexOf("=");
        if (eq === -1) continue;
        const key = t.slice(0, eq).trim();
        const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
        if (key.startsWith("SERVER_")) env[key] = val;
      }
    } catch (_) {}
  }
  return env;
}

function generateSecret(bytes = 24) {
  return crypto.randomBytes(bytes).toString("hex");
}

function runRemoteScript(conn, script) {
  return new Promise((resolve, reject) => {
    conn.exec(script, (err, stream) => {
      if (err) return reject(err);
      let out = "";
      let errText = "";
      stream.on("data", (d) => { out += d.toString(); process.stdout.write(d); });
      stream.stderr.on("data", (d) => { errText += d.toString(); process.stderr.write(d); });
      stream.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`exit ${code}: ${errText || out}`))));
    });
  });
}

async function main() {
  const env = readDeployConfig();
  const SERVER_USER = env.SERVER_USER || process.env.SERVER_USER;
  const SERVER_IP = env.SERVER_IP || process.env.SERVER_IP;
  const SERVER_PORT = parseInt(env.SERVER_PORT || process.env.SERVER_PORT || "22", 10);
  const SERVER_PATH = (env.SERVER_PATH || process.env.SERVER_PATH || "/var/www/streamdesk").replace(/\/$/, "");
  const SSH_PASSWORD = process.env.SSH_PASSWORD;

  if (!SERVER_USER || !SERVER_IP) {
    console.error("Задайте SERVER_USER и SERVER_IP в deploy.config или .env");
    process.exit(1);
  }

  const dbPass = generateSecret(16);
  const sessionSecret = generateSecret(32);
  const envContent = [
    "DATABASE_URL=postgresql://streamdesk_user:" + dbPass + "@localhost:5432/streamdesk",
    "PORT=5000",
    "NODE_ENV=production",
    "SESSION_SECRET=" + sessionSecret,
    "ALLOW_FALLBACK_ADMIN=false",
  ].join("\n");
  const envB64 = Buffer.from(envContent, "utf8").toString("base64");

  const remoteScript = `
set -e
export DEBIAN_FRONTEND=noninteractive

echo "=== Установка PostgreSQL (если нет) ==="
if ! command -v psql &>/dev/null; then
  apt-get update -qq
  apt-get install -y postgresql postgresql-contrib
  systemctl start postgresql || true
  systemctl enable postgresql || true
fi
systemctl start postgresql 2>/dev/null || true

echo "=== Пользователь и БД PostgreSQL ==="
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='streamdesk_user'" | grep -q 1 || \\
  sudo -u postgres psql -c "CREATE USER streamdesk_user WITH PASSWORD '${dbPass}';"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='streamdesk'" | grep -q 1 || \\
  sudo -u postgres psql -c "CREATE DATABASE streamdesk OWNER streamdesk_user;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE streamdesk TO streamdesk_user;" 2>/dev/null || true
sudo -u postgres psql -c "ALTER DATABASE streamdesk OWNER TO streamdesk_user;" 2>/dev/null || true

echo "=== Каталог приложения ==="
mkdir -p "${SERVER_PATH}"
chown -R ${SERVER_USER}:${SERVER_USER} "${SERVER_PATH}" 2>/dev/null || true

echo "=== Файл .env ==="
echo '${envB64}' | base64 -d > "${SERVER_PATH}/.env"
chmod 600 "${SERVER_PATH}/.env"
chown ${SERVER_USER}:${SERVER_USER} "${SERVER_PATH}/.env" 2>/dev/null || true

echo "=== Node.js (если нет) ==="
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "=== PM2 (если нет) ==="
if ! command -v pm2 &>/dev/null; then
  npm install -g pm2
fi

echo "=== Готово ==="
`.trim();

  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on("ready", () => {
      runRemoteScript(conn, remoteScript)
        .then(() => {
          console.log("\n--- Сохраните эти данные (пароль БД и SESSION_SECRET) ---");
          console.log("DATABASE_URL=postgresql://streamdesk_user:" + dbPass + "@localhost:5432/streamdesk");
          console.log("SESSION_SECRET=" + sessionSecret);
          console.log("--- Файл .env на сервере уже создан с этими значениями. ---\n");
          conn.end();
          resolve();
        })
        .catch((e) => {
          conn.end();
          reject(e);
        });
    }).on("error", reject);

    const config = {
      host: SERVER_IP,
      port: SERVER_PORT,
      username: SERVER_USER,
      tryKeyboard: true,
    };
    if (SSH_PASSWORD) {
      config.password = SSH_PASSWORD;
    }
    conn.connect(config);
  });
}

main().catch((e) => {
  console.error(e.message || e);
  if (!process.env.SSH_PASSWORD) {
    console.error("\nЗадайте пароль сервера: set SSH_PASSWORD=ваш_пароль (Windows) или SSH_PASSWORD=... ./script (Linux)");
  }
  process.exit(1);
});
