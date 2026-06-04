#!/usr/bin/env node

import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import archiver from "archiver";
import { Client } from "ssh2";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const EXCLUDE_DIRS = new Set([
  "node_modules",
  ".git",
  "attached_assets",
  "design-website",
  "uploads",
  "dist",
]);
const EXCLUDE_FILES = new Set([".env", "deploy.config"]);

function readDeployConfig() {
  const env = { ...process.env };
  for (const file of [path.join(root, ".env"), path.join(root, "deploy.config")]) {
    try {
      const content = fs.readFileSync(file, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
        if (key.startsWith("SERVER_")) env[key] = value;
      }
    } catch (_) {}
  }
  return env;
}

function* walkDir(dir, base = "") {
  const entries = fs.readdirSync(path.join(dir, base), { withFileTypes: true });
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const relNorm = rel.replace(/\\/g, "/");
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name) || relNorm.includes("/node_modules/")) continue;
      yield* walkDir(dir, rel);
      continue;
    }
    if (EXCLUDE_FILES.has(entry.name) || entry.name.endsWith(".log")) continue;
    if (/[/\\]node_modules[/\\]/.test(rel) || relNorm.startsWith("node_modules/")) continue;
    yield rel;
  }
}

async function createZip(rootDir) {
  const zipPath = path.join(os.tmpdir(), `streamdesk-existing-${Date.now()}.zip`);
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  const output = fs.createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  await new Promise((resolve, reject) => {
    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);

    for (const rel of walkDir(rootDir)) {
      archive.file(path.join(rootDir, rel), { name: rel.replace(/\\/g, "/") });
    }

    archive.finalize();
  });

  return zipPath;
}

function runRemote(conn, command) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      let stdout = "";
      let stderr = "";
      stream.on("data", (data) => {
        const text = data.toString();
        stdout += text;
        process.stdout.write(text);
      });
      stream.stderr.on("data", (data) => {
        const text = data.toString();
        stderr += text;
        process.stderr.write(text);
      });
      stream.on("close", (code) => {
        if (code === 0) resolve({ stdout, stderr });
        else reject(new Error(`Remote exit ${code}\n${stderr || stdout}`));
      });
    });
  });
}

function sftpPut(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.fastPut(localPath, remotePath, (putErr) => {
        if (putErr) reject(putErr);
        else resolve();
      });
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

  if (!SERVER_USER || !SERVER_IP || !SERVER_PATH) {
    throw new Error("Set SERVER_USER, SERVER_IP, SERVER_PATH and optionally SERVER_PORT.");
  }
  if (!SSH_PASSWORD) {
    throw new Error("Set SSH_PASSWORD before running this script.");
  }

  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn.on("ready", resolve);
    conn.on("error", reject);
    conn.connect({
      host: SERVER_IP,
      port: SERVER_PORT,
      username: SERVER_USER,
      password: SSH_PASSWORD,
    });
  });

  const zipPath = await createZip(root);
  const remoteZip = `${SERVER_PATH}/deploy.zip`;

  try {
    console.log(`Uploading ${path.basename(zipPath)} to ${SERVER_USER}@${SERVER_IP}:${SERVER_PATH} ...`);
    await runRemote(conn, `mkdir -p ${SERVER_PATH}`);
    await sftpPut(conn, zipPath, remoteZip);

    const remoteScript = `
set -e
cd ${SERVER_PATH}
if [ -f .env ]; then
  cp .env ".env.backup-$(date +%Y%m%d-%H%M%S)"
fi
unzip -o -q deploy.zip
rm -f deploy.zip
npm install --production=false
npx drizzle-kit push --force
npm run build
if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe streamdesk >/dev/null 2>&1; then
    pm2 restart streamdesk
  else
    pm2 start ecosystem.config.cjs
  fi
  pm2 save 2>/dev/null || true
fi
node test-db-connection.js
pm2 list || true
`.trim();

    await runRemote(conn, remoteScript);
  } finally {
    conn.end();
    try {
      fs.unlinkSync(zipPath);
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
