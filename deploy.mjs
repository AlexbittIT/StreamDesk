#!/usr/bin/env node
/**
 * Автодеплой StreamDesk: сборка → выгрузка на сервер → перезапуск.
 * Запуск: npm run deploy
 * Настройки: .env (SERVER_USER, SERVER_IP, SERVER_PATH) или deploy.config
 */

import { spawn, execSync } from "child_process";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname);

function readEnv() {
  const env = {};
  const files = [
    path.join(root, ".env"),
    path.join(root, "deploy.config"),
  ];
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.replace(/^\s+|\s+$/g, "");
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
        if (key.startsWith("SERVER_")) env[key] = val;
      }
    } catch (_) {}
  }
  return env;
}

function findRsync() {
  if (process.platform !== "win32") return "rsync";
  try {
    execSync("rsync --version", { stdio: "ignore" });
    return "rsync";
  } catch (_) {}
  const candidates = [
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs", "Git", "usr", "bin", "rsync.exe"),
    "C:\\Program Files\\Git\\usr\\bin\\rsync.exe",
    "C:\\Program Files (x86)\\Git\\usr\\bin\\rsync.exe",
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
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

/** Деплой через scp (Windows без rsync): robocopy → zip → scp → unzip на сервере */
async function deployViaScp(rootDir, user, host, remotePath, runFn) {
  const tmpDir = path.join(os.tmpdir(), `streamdesk-deploy-${Date.now()}`);
  const zipPath = path.join(os.tmpdir(), `streamdesk-deploy-${Date.now()}.zip`);
  const excludeDirs = ["node_modules", ".git", "client\\node_modules", "attached_assets", "design-website"];
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    const robocopyArgs = [
      rootDir,
      tmpDir,
      "/E",
      "/NFL", "/NDL", "/NJH", "/NJS", "/nc", "/ns", "/np",
      ...excludeDirs.flatMap((d) => ["/XD", d]),
      "/XF", ".env", "*.log", "deploy.config",
    ];
    const rc = await new Promise((res) => {
      const p = spawn("robocopy", robocopyArgs, { stdio: "inherit", cwd: rootDir });
      p.on("exit", (code) => res(code <= 7 ? 0 : code));
    });
    if (rc !== 0) throw new Error("robocopy failed");
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    await runFn("powershell", [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path "${tmpDir}\\*" -DestinationPath "${zipPath}" -Force`,
    ], { cwd: rootDir });
    await runFn("scp", ["-o", "StrictHostKeyChecking=no", zipPath, `${user}@${host}:${remotePath}/deploy.zip`]);
    await runFn("ssh", [
      "-o", "StrictHostKeyChecking=no",
      `${user}@${host}`,
      `cd ${remotePath} && unzip -o -q deploy.zip && rm -f deploy.zip && chmod +x deploy-to-server.sh && ./deploy-to-server.sh`,
    ]);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch (_) {}
    try { fs.unlinkSync(zipPath); } catch (_) {}
  }
}

async function main() {
  const env = readEnv();
  const SERVER_USER = env.SERVER_USER || process.env.SERVER_USER;
  const SERVER_IP = env.SERVER_IP || process.env.SERVER_IP;
  const SERVER_PATH = env.SERVER_PATH || process.env.SERVER_PATH;

  if (!SERVER_USER || !SERVER_IP || !SERVER_PATH) {
    console.error(`
Настройте деплой один раз — добавьте в .env или в файл deploy.config:

  SERVER_USER=ваш_пользователь
  SERVER_IP=194.58.112.174
  SERVER_PATH=/var/www/streamdesk

Пример deploy.config в корне проекта:
  SERVER_USER=otis-server
  SERVER_IP=194.58.112.174
  SERVER_PATH=/var/www/streamdesk
`);
    process.exit(1);
  }

  const target = `${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}`;
  console.log("Деплой:", target, "\n");

  console.log("1/3 Сборка проекта...");
  await run("npm", ["run", "build"]);

  const rsyncExclude = [
    "node_modules",
    ".git",
    "client/node_modules",
    ".env",
    "*.log",
    ".DS_Store",
    "Thumbs.db",
    "attached_assets",
    "deploy.config",
    "design-website",
  ].flatMap((x) => ["--exclude", x]);

  console.log("2/3 Синхронизация на сервер...");
  const rsyncCmd = findRsync();
  if (rsyncCmd) {
    const sourcePath = (root + path.sep).replace(/\\/g, "/");
    await run(rsyncCmd, [
      "-avz",
      "--delete",
      ...rsyncExclude,
      sourcePath,
      target + "/",
    ]);
  } else if (process.platform === "win32") {
    await deployViaScp(root, SERVER_USER, SERVER_IP, SERVER_PATH, run);
  } else {
    console.error("rsync не найден. Установите rsync для вашей ОС.");
    process.exit(1);
  }

  console.log("3/3 Перезапуск на сервере...");
  await run("ssh", [
    `${SERVER_USER}@${SERVER_IP}`,
    `cd ${SERVER_PATH} && chmod +x deploy-to-server.sh && ./deploy-to-server.sh`,
  ]);

  console.log("\nДеплой завершён.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
