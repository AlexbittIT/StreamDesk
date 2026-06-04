#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
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

async function main() {
  const sqlArg = process.argv[2];
  if (!sqlArg) {
    throw new Error("Usage: node scripts/apply-remote-sql.mjs <local-sql-file>");
  }

  const localSqlPath = path.resolve(root, sqlArg);
  if (!fs.existsSync(localSqlPath)) {
    throw new Error(`SQL file not found: ${localSqlPath}`);
  }

  const env = readEnvFiles();
  const host = env.SERVER_IP || process.env.SERVER_IP;
  const port = parseInt(env.SERVER_PORT || process.env.SERVER_PORT || "22", 10);
  const username = env.SERVER_USER || process.env.SERVER_USER;
  const password = process.env.SSH_PASSWORD;
  const remotePath = (env.SERVER_PATH || process.env.SERVER_PATH || "/var/www/streamdesk").replace(/\/$/, "");

  if (!host || !username || !password || !remotePath) {
    throw new Error("Set SERVER_IP, SERVER_USER, SERVER_PATH, and SSH_PASSWORD.");
  }

  const remoteSqlPath = `${remotePath}/${path.basename(localSqlPath)}`;
  const conn = new Client();

  await new Promise((resolve, reject) => {
    conn.on("ready", resolve);
    conn.on("error", reject);
    conn.connect({ host, port, username, password, readyTimeout: 60000 });
  });

  try {
    await runRemote(conn, `mkdir -p ${remotePath}`);
    await sftpPut(conn, localSqlPath, remoteSqlPath);
    const backupPath = `/tmp/streamdesk-pre-schema-update-${Date.now()}.dump`;
    await runRemote(
      conn,
      `
set -e
sudo -u postgres pg_dump -d streamdesk -Fc -f ${backupPath}
sudo -u postgres psql -v ON_ERROR_STOP=1 -d streamdesk -f ${remoteSqlPath}
rm -f ${remoteSqlPath}
      `.trim(),
    );
  } finally {
    conn.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
