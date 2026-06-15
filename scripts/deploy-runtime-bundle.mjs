#!/usr/bin/env node

import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import archiver from "archiver";
import { Client } from "ssh2";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function readEnvFiles() {
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
        env[key] = value;
      }
    } catch (_) {}
  }
  return env;
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

async function createBundle() {
  const bundlePath = path.join(os.tmpdir(), `streamdesk-runtime-${Date.now()}.zip`);
  if (fs.existsSync(bundlePath)) fs.unlinkSync(bundlePath);

  const output = fs.createWriteStream(bundlePath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  await new Promise((resolve, reject) => {
    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);

    const includePaths = [
      "dist",
      "ecosystem.config.cjs",
      "package.json",
      "package-lock.json",
      "backend/templates",
      "scripts/streamdesk-agent.ps1",
      "scripts/streamdesk-agent-linux.sh",
    ];

    for (const rel of includePaths) {
      const abs = path.join(root, rel);
      if (!fs.existsSync(abs)) continue;
      const stat = fs.statSync(abs);
      if (stat.isDirectory()) {
        archive.directory(abs, rel.replace(/\\/g, "/"));
      } else {
        archive.file(abs, { name: rel.replace(/\\/g, "/") });
      }
    }

    archive.finalize();
  });

  return bundlePath;
}

async function main() {
  const env = readEnvFiles();
  const host = env.SERVER_IP || process.env.SERVER_IP;
  const port = parseInt(env.SERVER_PORT || process.env.SERVER_PORT || "22", 10);
  const username = env.SERVER_USER || process.env.SERVER_USER;
  const password = process.env.SSH_PASSWORD;
  const remotePath = (env.SERVER_PATH || process.env.SERVER_PATH || "/var/www/streamdesk").replace(/\/$/, "");

  if (!host || !username || !password || !remotePath) {
    throw new Error("Set SERVER_IP, SERVER_USER, SERVER_PATH, and SSH_PASSWORD.");
  }

  const bundlePath = await createBundle();
  const remoteZip = `${remotePath}/runtime-bundle.zip`;
  const conn = new Client();

  await new Promise((resolve, reject) => {
    conn.on("ready", resolve);
    conn.on("error", reject);
    conn.connect({ host, port, username, password });
  });

  try {
    await runRemote(conn, `mkdir -p ${remotePath}`);
    await sftpPut(conn, bundlePath, remoteZip);
    await runRemote(
      conn,
      `
set -e
cd ${remotePath}
unzip -o -q runtime-bundle.zip
rm -f runtime-bundle.zip
if pm2 describe streamdesk >/dev/null 2>&1; then
  pm2 restart streamdesk
else
  pm2 start ecosystem.config.cjs
fi
pm2 save 2>/dev/null || true
node test-db-connection.js
ss -ltnp | grep 5000 || true
      `.trim(),
    );
  } finally {
    conn.end();
    try {
      fs.unlinkSync(bundlePath);
    } catch (_) {}
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
