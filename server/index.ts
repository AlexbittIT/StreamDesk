import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log, logSuccess, logWarn, logError, logRequest } from "./vite";
import { seedDatabase } from "./seed-data";
import { initDatabase, isStubStorage } from "./database";
import { addTerminalLog } from "./terminal-log";
import { triggerYougileSync, startYougileRetryScheduler } from "./yougile-sync";
import { isYouGileConfigured } from "./yougile";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      const isAuthPath = path === "/api/auth/login" || path === "/api/auth/logout";
      if (capturedJsonResponse && !isAuthPath) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }
      logRequest(logLine, res.statusCode);
      addTerminalLog(`[${new Date().toISOString()}] ${logLine}`);
    }
  });

  next();
});

(async () => {
  await initDatabase();

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
  });

  // Seed database with sample data in development (только при реальной БД)
  if (app.get("env") === "development" && !isStubStorage) {
    try {
      await seedDatabase();
      logSuccess("Database seeding completed");
    } catch (error: any) {
      logError(`Database seeding failed: ${error?.message}`);
    }
  }

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Порт из .env (или 5000). Если занят — пробуем следующие (port+1 … port+10).
  const basePort = parseInt(process.env.PORT || '5000', 10);
  const maxTries = 10;

  function tryListen(port: number) {
    server.once('error', (err: any) => {
      const tryNext = port < basePort + maxTries;
      if ((err.code === 'EADDRINUSE' || err.code === 'EACCES') && tryNext) {
        logWarn(`Порт ${port} недоступен (${err.code === 'EACCES' ? 'нет прав / системный' : 'занят'}), пробуем ${port + 1}...`);
        tryListen(port + 1);
      } else if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
        logError(`Порты ${basePort}–${basePort + maxTries - 1} недоступны. Смените PORT в .env (например 5000) или запустите от имени администратора.`);
        process.exit(1);
      } else {
        logError(`Ошибка сервера: ${err.message}`);
        process.exit(1);
      }
    });

    const protocol = process.env.SSL_CERT_PATH && process.env.SSL_KEY_PATH ? "https" : "http";
    server.listen(port, "0.0.0.0", () => {
      server.removeAllListeners("error");
      logSuccess(`Сервер: ${protocol}://localhost:${port} — откройте в браузере`);
      addTerminalLog(`[${new Date().toISOString()}] Server listening ${protocol}://0.0.0.0:${port} NODE_ENV=${process.env.NODE_ENV || "development"}`);
      // YouGile: подтяжка по запросу (очередь), при старте — один запуск в фоне
      if (isYouGileConfigured()) {
        startYougileRetryScheduler();
        triggerYougileSync(); // сразу ставим в очередь, обработается по мере запросов
        const syncIntervalMs = Math.max(Number(process.env.YOUGILE_SYNC_INTERVAL_MS || 120_000), 60_000);
        setInterval(() => {
          if (isYouGileConfigured()) triggerYougileSync();
        }, syncIntervalMs);
      }
    });
  }

  tryListen(basePort);
})();
