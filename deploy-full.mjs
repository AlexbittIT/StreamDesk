#!/usr/bin/env node
/**
 * Полный деплой на сервер одним запуском: настройка (PostgreSQL, .env, Node, PM2) + сборка + загрузка + запуск.
 * Запуск: set SSH_PASSWORD=пароль && node deploy-full.mjs
 * Или: Деплой на сервер.bat (запросит пароль).
 * Требуется deploy.config (или .env) с SERVER_USER, SERVER_IP, SERVER_PORT, SERVER_PATH.
 */

import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import crypto from "crypto";
import archiver from "archiver";
import { Client } from "ssh2";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname);

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

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      cwd: opts.cwd || root,
      ...opts,
    });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`Exit ${code}`))));
  });
}

function runRemote(conn, script) {
  return new Promise((resolve, reject) => {
    conn.exec(script, (err, stream) => {
      if (err) return reject(err);
      stream.on("data", (d) => process.stdout.write(d.toString()));
      stream.stderr.on("data", (d) => process.stderr.write(d.toString()));
      stream.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`Remote exit ${code}`))));
    });
  });
}

function sftpPut(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      const readStream = fs.createReadStream(localPath);
      const writeStream = sftp.createWriteStream(remotePath);
      writeStream.on("close", resolve);
      writeStream.on("error", reject);
      readStream.pipe(writeStream);
    });
  });
}

const EXCLUDE_DIRS = new Set(["node_modules", ".git", "attached_assets", "design-website"]);
const EXCLUDE_FILES = new Set([".env", "deploy.config"]);

function* walkDir(dir, base = "") {
  const entries = fs.readdirSync(path.join(dir, base), { withFileTypes: true });
  for (const e of entries) {
    const rel = base ? base + "/" + e.name : e.name;
    const relNorm = rel.replace(/\\/g, "/");
    if (e.isDirectory()) {
      if (EXCLUDE_DIRS.has(e.name) || relNorm.includes("/node_modules/")) continue;
      yield* walkDir(dir, rel);
    } else {
      if (EXCLUDE_FILES.has(e.name) || e.name.endsWith(".log")) continue;
      if (/[/\\]node_modules[/\\]/.test(rel) || relNorm.startsWith("node_modules/")) continue;
      yield rel;
    }
  }
}

async function createZip(rootDir) {
  const zipPath = path.join(os.tmpdir(), `streamdesk-full-${Date.now()}.zip`);
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  const out = fs.createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });
  await new Promise((resolve, reject) => {
    out.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(out);
    for (const rel of walkDir(rootDir)) {
      const full = path.join(rootDir, rel);
      const name = rel.replace(/\\/g, "/");
      archive.file(full, { name });
    }
    archive.finalize();
  });
  return zipPath;
}

async function main() {
  const env = readDeployConfig();
  const SERVER_USER = env.SERVER_USER || process.env.SERVER_USER;
  const SERVER_IP = env.SERVER_IP || process.env.SERVER_IP;
  const SERVER_PORT = parseInt(env.SERVER_PORT || process.env.SERVER_PORT || "22", 10);
  const SERVER_PATH = (env.SERVER_PATH || process.env.SERVER_PATH || "/var/www/streamdesk").replace(/\/$/, "");
  const SSH_PASSWORD = process.env.SSH_PASSWORD;

  if (!SERVER_USER || !SERVER_IP) {
    console.error("Задайте SERVER_USER и SERVER_IP в deploy.config (скопируйте из deploy.config.example).");
    process.exit(1);
  }
  if (!SSH_PASSWORD) {
    console.error("Задайте пароль сервера: set SSH_PASSWORD=ваш_пароль");
    console.error("Или запустите Деплой на сервер.bat — он запросит пароль.");
    process.exit(1);
  }

  const dbPass = crypto.randomBytes(16).toString("hex");
  const sessionSecret = crypto.randomBytes(32).toString("hex");
  const envContent = [
    "DATABASE_URL=postgresql://streamdesk_user:" + dbPass + "@localhost:5432/streamdesk",
    "PORT=5000",
    "NODE_ENV=production",
    "SESSION_SECRET=" + sessionSecret,
    "ALLOW_FALLBACK_ADMIN=false",
  ].join("\n");
  const envB64 = Buffer.from(envContent, "utf8").toString("base64");

  const setupScript = `
set -e
export DEBIAN_FRONTEND=noninteractive
echo "=== PostgreSQL ==="
if ! command -v psql &>/dev/null; then
  apt-get update -qq && apt-get install -y postgresql postgresql-contrib
  systemctl start postgresql || true
  systemctl enable postgresql || true
fi
systemctl start postgresql 2>/dev/null || true
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='streamdesk_user'" | grep -q 1 || \\
  sudo -u postgres psql -c "CREATE USER streamdesk_user WITH PASSWORD '${dbPass}';"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='streamdesk'" | grep -q 1 || \\
  sudo -u postgres psql -c "CREATE DATABASE streamdesk OWNER streamdesk_user;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE streamdesk TO streamdesk_user;" 2>/dev/null || true
echo "=== Каталог и .env ==="
mkdir -p "${SERVER_PATH}"
echo '${envB64}' | base64 -d > "${SERVER_PATH}/.env"
chmod 600 "${SERVER_PATH}/.env"
chown -R ${SERVER_USER}:${SERVER_USER} "${SERVER_PATH}" 2>/dev/null || true
echo "=== unzip (для деплоя) ==="
apt-get install -y unzip 2>/dev/null || true
echo "=== Node.js ==="
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
if ! command -v pm2 &>/dev/null; then
  npm install -g pm2
fi
echo "=== Настройка сервера готова ==="
`.trim();

  console.log("\n1/4 Подключение к серверу и настройка (PostgreSQL, .env, Node, PM2)...\n");
  const conn = new Client();

  await new Promise((resolve, reject) => {
    conn.on("ready", () => resolve());
    conn.on("error", reject);
    conn.connect({
      host: SERVER_IP,
      port: SERVER_PORT,
      username: SERVER_USER,
      password: SSH_PASSWORD,
    });
  });

  await runRemote(conn, setupScript);

  console.log("\n2/4 Сборка проекта...\n");
  await run("npm", ["run", "build"]);

  console.log("\n3/4 Упаковка и загрузка на сервер...\n");
  const zipPath = await createZip(root);
  await sftpPut(conn, zipPath, `${SERVER_PATH}/deploy.zip`);
  try {
    fs.unlinkSync(zipPath);
  } catch (_) {}

  console.log("\n4/4 Установка зависимостей и запуск на сервере...\n");
  await runRemote(
    conn,
    `cd ${SERVER_PATH} && unzip -o -q deploy.zip && rm -f deploy.zip && chmod +x deploy-to-server.sh && ./deploy-to-server.sh`
  );

  conn.end();

  const url = SERVER_IP.includes(":") ? `http://[${SERVER_IP}]:5000` : `http://${SERVER_IP}:5000`;
  console.log("\n========================================");
  console.log("  Готово. Откройте в браузере:");
  console.log("  " + url);
  console.log("  Логин админа при первом входе: admin / admin123 (смените в настройках).");
  console.log("========================================\n");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
