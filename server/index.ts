import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { seedDatabase } from "./seed-data";

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
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // Seed database with sample data in development
  if (app.get("env") === "development") {
    try {
      await seedDatabase();
      log("✅ Database seeding completed");
    } catch (error: any) {
      log(`\n❌ Database seeding failed: ${error.message}\n`);
      log(`⚠️  Please check:`);
      log(`   1. PostgreSQL is running`);
      log(`   2. DATABASE_URL in .env file is correct`);
      log(`   3. Database exists and is accessible\n`);
      log(`⚠️  Server will continue, but database operations may fail.\n`);
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

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  
  // Обработка ошибок сервера
  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      log(`❌ Port ${port} is already in use. Try a different port.`);
      process.exit(1);
    } else {
      log(`❌ Server error: ${err.message} (code: ${err.code})`);
      if (err.code !== 'ENOTSUP') {
        throw err;
      }
    }
  });
  
  // Исправление для Windows - используем простой метод listen без параметров объекта
  // Для доступа извне слушаем на всех интерфейсах (0.0.0.0)
  server.listen(port, '0.0.0.0', () => {
    log(`✅ Server running on http://localhost:${port}`);
    log(`✅ Server accessible from network on port ${port}`);
    log(`💡 To access via domain, configure DNS and port forwarding`);
  });
})();
