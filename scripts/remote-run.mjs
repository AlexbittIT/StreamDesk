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

function runRemote(command) {
  const env = readEnvFiles();
  const host = env.SERVER_IP || process.env.SERVER_IP;
  const port = parseInt(env.SERVER_PORT || process.env.SERVER_PORT || "22", 10);
  const username = env.SERVER_USER || process.env.SERVER_USER;
  const password = process.env.SSH_PASSWORD;

  if (!host || !username || !password) {
    throw new Error("Set SERVER_IP, SERVER_USER, and SSH_PASSWORD.");
  }

  return new Promise((resolve, reject) => {
    const conn = new Client();

    conn
      .on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            reject(err);
            return;
          }

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
            conn.end();
            if (code === 0 || code === null) {
              resolve({ stdout, stderr, code });
            } else {
              reject(new Error(`Remote exit ${code}\n${stderr || stdout}`));
            }
          });
        });
      })
      .on("error", reject)
      .connect({ host, port, username, password, readyTimeout: 60000 });
  });
}

let command = "";
if (process.argv[2] === "--file") {
  const fileArg = process.argv[3];
  if (!fileArg) {
    console.error("Usage: node scripts/remote-run.mjs --file <local-command-file>");
    process.exit(1);
  }
  const filePath = path.resolve(root, fileArg);
  command = fs.readFileSync(filePath, "utf8").trim();
} else {
  command = process.argv.slice(2).join(" ").trim();
}

if (!command) {
  console.error("Usage: node scripts/remote-run.mjs \"<command>\" or --file <local-command-file>");
  process.exit(1);
}

runRemote(command).catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
