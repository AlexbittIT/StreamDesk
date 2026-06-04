import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

function time() {
  return new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

/** Обычный лог (серый/приглушённый) */
export function log(message: string, source = "express") {
  console.log(`${colors.dim}${time()} [${source}]${colors.reset} ${message}`);
}

/** Успех — зелёный */
export function logSuccess(message: string, source = "express") {
  console.log(`${colors.dim}${time()} ${colors.green}[${source}] ${message}${colors.reset}`);
}

/** Предупреждение — жёлтый */
export function logWarn(message: string, source = "express") {
  console.log(`${colors.dim}${time()} ${colors.yellow}[${source}] ${message}${colors.reset}`);
}

/** Ошибка — красный */
export function logError(message: string, source = "express") {
  console.log(`${colors.dim}${time()} ${colors.red}[${source}] ${message}${colors.reset}`);
}

/** Лог HTTP-запроса с цветом по статусу: 2xx зелёный, 4xx жёлтый, 5xx красный */
export function logRequest(line: string, statusCode: number) {
  const c = statusCode >= 500 ? colors.red : statusCode >= 400 ? colors.yellow : colors.green;
  console.log(`${colors.dim}${time()} [express]${colors.reset} ${c}${line}${colors.reset}`);
}

export async function setupVite(app: Express, server: Server) {
  const port = parseInt(process.env.PORT || "5000", 10);
  const serverOptions = {
    middlewareMode: true,
    // HMR отключён — WebSocket вызывал "connection lost" и постоянные перезагрузки страницы
    hmr: false,
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
