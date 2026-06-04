#!/usr/bin/env node
/**
 * Подключается по SSH к серверу и выполняет только npm run db:push (создание/обновление таблиц).
 * Запуск: set SSH_PASSWORD=пароль && node scripts/run-db-push-on-server.mjs
 * Или: fix-db-on-server.bat
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
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

function runRemote(conn, script) {
  return new Promise((resolve, reject) => {
    conn.exec(script, (err, stream) => {
      if (err) return reject(err);
      stream.on("data", (d) => process.stdout.write(d.toString()));
      stream.stderr.on("data", (d) => process.stderr.write(d.toString()));
      stream.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`Exit ${code}`))));
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
    console.error("Set SERVER_USER and SERVER_IP in deploy.config");
    process.exit(1);
  }
  if (!SSH_PASSWORD) {
    console.error("Set SSH_PASSWORD (e.g. run fix-db-on-server.bat and enter password)");
    process.exit(1);
  }

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

  console.log("Running db:push on server...\n");
  await runRemote(conn, `cd ${SERVER_PATH} && npm run db:push`);
  conn.end();
  console.log("\nDone. Tables (users, etc.) are created/updated.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
