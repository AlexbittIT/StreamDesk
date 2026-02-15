import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./database";
import { 
  insertUserSchema,
  insertEventSchema,
  insertEventParticipantSchema, 
  insertEquipmentSchema, 
  insertSystemSchema,
  insertStreamSchema, 
  insertNotificationSchema,
  insertEquipmentReservationSchema,
  insertTelegramUserSchema,
  insertObsConnectionSchema,
  insertAnalyticsEventSchema,
  insertTaskSchema,
  insertTaskCommentSchema,
  insertTaskHistorySchema,
  insertRoleSchema
} from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import net from "net";
import crypto from "crypto";
import { telegramBot } from "./services/telegram-bot";
import { telegramGateway } from "./services/telegram-gateway";

// Configure multer for equipment photo uploads (images only)
const upload = multer({
  storage: multer.diskStorage({
    destination: async (req, file, cb) => {
      const uploadDir = path.join(process.cwd(), "uploads");
      try {
        await fs.mkdir(uploadDir, { recursive: true });
      } catch (error) {
        console.error("Error creating upload directory:", error);
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
    },
  }),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

// Separate multer instance for transcription uploads - allow any file type
const transcriptionUpload = multer({
  storage: multer.diskStorage({
    destination: async (req, file, cb) => {
      const podcast = (req.body.podcast || "").toString().trim();
      const relativePath = (req.body.path || "").toString().trim(); // optional nested folder inside podcast

      if (!podcast) {
        return cb(new Error("Podcast is required"), "");
      }

      const safePodcast = podcast.replace(/[^a-zA-Z0-9-_а-яА-ЯёЁ ]/g, "_");
      const safeRelativePath = relativePath.replace(/(\.\.[/\\])/g, "").replace(/[^a-zA-Z0-9-_/\\а-яА-ЯёЁ ]/g, "_");

      const baseDir = path.join(process.cwd(), "uploads", "transcriptions");
      const targetDir = safeRelativePath
        ? path.join(baseDir, safePodcast, safeRelativePath)
        : path.join(baseDir, safePodcast);

      try {
        await fs.mkdir(targetDir, { recursive: true });
      } catch (error) {
        console.error("Error creating transcription directory:", error);
      }

      cb(null, targetDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const originalName = file.originalname || "file";
      const ext = path.extname(originalName);
      const base = path.basename(originalName, ext).replace(/[^a-zA-Z0-9-_а-яА-ЯёЁ ]/g, "_");
      cb(null, base + "-" + uniqueSuffix + ext);
    },
  }),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB для документов/аудио
  },
});

// Multer для загрузки файлов в чаты - любые типы файлов, без ограничений
const chatUpload = multer({
  storage: multer.diskStorage({
    destination: async (req, file, cb) => {
      const uploadDir = path.join(process.cwd(), "uploads", "chat");
      try {
        await fs.mkdir(uploadDir, { recursive: true });
      } catch (error) {
        console.error("Error creating chat upload directory:", error);
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const originalName = file.originalname || "file";
      const ext = path.extname(originalName);
      const base = path.basename(originalName, ext).replace(/[^a-zA-Z0-9-_а-яА-ЯёЁ ]/g, "_");
      cb(null, base + "-" + uniqueSuffix + ext);
    },
  }),
  // Без ограничений по размеру и типу файлов
});

// Helper function to check IP connectivity
async function checkIP(ip: string, port: number = 80): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(3000);
    
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.on('error', () => {
      resolve(false);
    });
    
    socket.connect(port, ip);
  });
}

// Обертка для быстрой обработки ошибок БД с таймаутом
async function withDbTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number = 3000, // 3 секунды по умолчанию для GET запросов (быстро!)
  defaultValue: T
): Promise<T> {
  const startTime = Date.now();
  let timeoutId: NodeJS.Timeout | null = null;
  
  try {
    // Убеждаемся, что timeoutMs положительное число
    const safeTimeout = Math.max(1, Math.floor(timeoutMs));
    
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Database operation timeout'));
      }, safeTimeout);
    });
    
    const result = await Promise.race([operation(), timeoutPromise]);
    
    // Очищаем таймаут если операция завершилась успешно
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    const duration = Math.max(0, Date.now() - startTime); // Убеждаемся, что duration не отрицательное
    if (duration > 1000) {
      console.warn(`[DB] Slow query: ${duration}ms`);
    }
    return result;
  } catch (error: any) {
    // Очищаем таймаут при ошибке
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    const duration = Math.max(0, Date.now() - startTime); // Убеждаемся, что duration не отрицательное
    const errorMsg = error.message?.toLowerCase() || '';
    
    // Логируем только важные ошибки, не таймауты
    if (errorMsg.includes('timeout')) {
      // Таймаут - это нормально, просто возвращаем дефолт
      return defaultValue;
    } else if (errorMsg.includes('econnrefused') || errorMsg.includes('connect')) {
      // Ошибка подключения - возвращаем дефолт быстро
      return defaultValue;
    }
    
    // Возвращаем значение по умолчанию (пустой массив для списков)
    return defaultValue;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Authentication routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ message: "Укажите логин и пароль" });
      }
      
      console.log(`[Auth] Login attempt for user: ${username}`);

      // Fallback админ для теста (можно отключить ALLOW_FALLBACK_ADMIN=false)
      const allowFallbackAdmin = process.env.ALLOW_FALLBACK_ADMIN !== "false";
      const fallbackUsername = process.env.ADMIN_USERNAME || "admin";
      const fallbackPassword = process.env.ADMIN_PASSWORD || "admin123";
      if (
        allowFallbackAdmin &&
        username === fallbackUsername &&
        password === fallbackPassword
      ) {
        console.log("[Auth] Using fallback admin (no DB check)");
        return res.json({
          user: {
            id: "admin-fallback",
            username: fallbackUsername,
            name: "Администратор",
            role: "admin",
            permissions: [
              "admin:panel",
              "users:manage",
              "roles:manage",
              "tasks:view",
              "tasks:create",
              "tasks:edit",
              "tasks:delete",
              "tasks:assign",
              "equipment:view",
              "equipment:create",
              "equipment:edit",
              "equipment:delete",
              "equipment:reserve",
              "events:view",
              "events:create",
              "events:edit",
              "events:delete",
              "streams:view",
              "streams:manage",
              "systems:view",
              "systems:manage",
              "settings:manage",
            ],
          },
        });
      }
      
      // Все пользователи должны существовать в БД - никаких fallback аккаунтов
      let user: any;
      try {
        user = await withDbTimeout(
          () => storage.getUserByUsername(username),
          10000, // 10 секунд для поиска пользователя
          null
        );
      } catch (dbError: any) {
        console.error("[Auth] Database error during login:", dbError);
        return res.status(500).json({ 
          message: "Ошибка подключения к базе данных. Проверьте настройки DATABASE_URL в .env файле." 
        });
      }

      // Флаг для отслеживания, был ли пользователь только что создан
      let adminJustCreated = false;
      
      // Если пользователь не найден
      if (!user) {
        // Проверяем, есть ли пользователь admin в БД
        // Если его нет и это попытка входа admin/admin123 - создаем админа
        if (username === "admin" && password === "admin123") {
          try {
            // Проверяем, есть ли вообще пользователи в БД
            const allUsers = await withDbTimeout(
              () => storage.getUsers(),
              10000,
              []
            );
            
            // Если БД пустая или админа нет - создаем админа
            const adminExists = allUsers.some((u: any) => u.username === "admin");
            
            if (!adminExists) {
              console.log("[Auth] Admin user not found, creating admin user");
              const newAdmin = await storage.createUser({
                username: "admin",
                password: "admin123",
                name: "Администратор",
                email: "admin@streamstudio.local",
                role: "admin",
                permissions: [
                  "admin:panel",
                  "users:manage",
                  "roles:manage",
                  "tasks:view",
                  "tasks:create",
                  "tasks:edit",
                  "tasks:delete",
                  "tasks:assign",
                  "equipment:view",
                  "equipment:create",
                  "equipment:edit",
                  "equipment:delete",
                  "equipment:reserve",
                  "events:view",
                  "events:create",
                  "events:edit",
                  "events:delete",
                  "streams:view",
                  "streams:manage",
                  "systems:view",
                  "systems:manage",
                  "settings:manage",
                ],
                active: true,
              } as any);
              
              console.log("[Auth] Admin user created successfully, ID:", newAdmin.id);
              
              // Используем только что созданного пользователя - пароль уже правильный
              user = newAdmin;
              adminJustCreated = true; // Устанавливаем флаг
            } else {
              // Админ должен был быть найден, но не найден - возможно проблема с БД
              // Попробуем перезагрузить из БД
              console.log(`[Auth] Admin should exist, retrying fetch...`);
              user = await withDbTimeout(
                () => storage.getUserByUsername("admin"),
                10000,
                null
              );
              
              if (!user) {
                console.log(`[Auth] Admin user should exist but not found: ${username}`);
                return res.status(401).json({ message: "Неверный логин или пароль" });
              }
            }
          } catch (createError: any) {
            console.error("[Auth] Error checking/creating admin:", createError);
            return res.status(401).json({ message: "Неверный логин или пароль" });
          }
        } else {
          // Пользователь не найден и это не admin/admin123
          console.log(`[Auth] User not found: ${username}`);
          return res.status(401).json({ message: "Неверный логин или пароль" });
        }
      }
      
      // Проверяем пароль только если пользователь не был только что создан
      if (!adminJustCreated && user && user.password !== password) {
        console.log(`[Auth] Invalid password for user: ${username}`);
        return res.status(401).json({ message: "Неверный логин или пароль" });
      }
      
      // Если user все еще null - ошибка
      if (!user) {
        console.log(`[Auth] User is null after all checks: ${username}`);
        return res.status(401).json({ message: "Неверный логин или пароль" });
      }

      if (user.active === false) {
        console.log(`[Auth] User ${username} is not active`);
        return res.status(403).json({ message: "Ваш аккаунт ещё не подтверждён администратором" });
      }

      // Обновляем время последнего входа (не блокируем, если не получится)
      try {
        await withDbTimeout(
          () => storage.updateUser(user.id, { lastLogin: new Date() }),
          5000,
          null
        );
      } catch (updateError) {
        console.warn("[Auth] Failed to update last login:", updateError);
        // Не прерываем логин, если обновление не получилось
      }
      
      console.log(`[Auth] Successful login for user: ${username} (${user.role})`);
      
      // In a real app, you'd use proper session management
      res.json({ 
        user: { 
          id: user.id, 
          username: user.username, 
          name: user.name, 
          role: user.role, 
          permissions: user.permissions 
        } 
      });
    } catch (error: any) {
      console.error("[Auth] Login error:", error);
      res.status(500).json({ 
        message: error.message || "Внутренняя ошибка сервера" 
      });
    }
  });

  // Registration route - creates inactive user, requires admin approval
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, password, name, email } = req.body;

      if (!username || !password || !name) {
        return res.status(400).json({ message: "Заполните логин, имя и пароль" });
      }

      let existing: any;
      try {
        existing = await storage.getUserByUsername(username);
      } catch (dbError: any) {
        console.error("Database error during registration:", dbError);
        return res.status(500).json({ 
          message: "Ошибка подключения к базе данных. Проверьте настройки DATABASE_URL в .env файле." 
        });
      }

      if (existing) {
        return res.status(400).json({ message: "Пользователь с таким логином уже существует" });
      }

      const newUser = await storage.createUser({
        username,
        password,
        name,
        email,
        role: "employee",
        permissions: [],
        active: false,
      } as any);

      res.json({
        message: "Заявка на регистрацию отправлена. Дождитесь подтверждения администратора.",
        user: { id: newUser.id, username: newUser.username, name: newUser.name, role: newUser.role, active: newUser.active },
      });
    } catch (error: any) {
      console.error("Auth register error:", error);
      if (error.message && error.message.includes("DATABASE_URL")) {
        res.status(500).json({ message: "Ошибка подключения к базе данных. Проверьте настройки в .env файле." });
      } else {
        res.status(500).json({ message: error.message || "Не удалось создать пользователя" });
      }
    }
  });

  // Dashboard stats
  app.get("/api/dashboard/stats", async (req, res) => {
    const [systems, equipment, streams, events] = await Promise.all([
      withDbTimeout(() => storage.getSystems(), 3000, []),
      withDbTimeout(() => storage.getEquipment(), 3000, []),
      withDbTimeout(() => storage.getActiveStreams(), 3000, []),
      withDbTimeout(() => storage.getEventsByDateRange(
        new Date(new Date().setHours(0, 0, 0, 0)),
        new Date(new Date().setHours(23, 59, 59, 999))
      ), 3000, []),
    ]);

    const onlineSystems = systems.filter((s: any) => s.status === "online").length;
    const availableEquipment = equipment.filter((e: any) => e.status === "available").length;

    res.json({
      onlineSystems: `${onlineSystems}/${systems.length}`,
      activeStreams: streams.length,
      availableEquipment: `${availableEquipment}/${equipment.length}`,
      todayEvents: events.length,
    });
  });

  // Manager Dashboard Stats
  app.get("/api/manager/stats", async (req, res) => {
    try {
      const tasks = await withDbTimeout(() => storage.getTasks(), 5000, []);
      const users = await withDbTimeout(() => storage.getUsers(), 3000, []);
      const taskHistory = await Promise.all(
        tasks.map(task => storage.getTaskHistory(task.id).catch(() => []))
      ).then(results => results.flat());

      // Основные метрики
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(t => t.status === 'completed').length;
      const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
      const overdueTasks = tasks.filter(t => {
        if (!t.dueDate) return false;
        return new Date(t.dueDate) < new Date() && t.status !== 'completed';
      }).length;

      // Среднее время выполнения (в часах)
      const completedTasksWithHistory = tasks.filter(t => t.status === 'completed');
      let totalHours = 0;
      let count = 0;
      for (const task of completedTasksWithHistory) {
        const created = task.createdAt ? new Date(task.createdAt).getTime() : 0;
        const completed = task.updatedAt ? new Date(task.updatedAt).getTime() : Date.now();
        if (created > 0) {
          totalHours += (completed - created) / (1000 * 60 * 60);
          count++;
        }
      }
      const averageCompletionTime = count > 0 ? totalHours / count : 0;

      // Задачи по статусам
      const statusCounts: Record<string, number> = {};
      tasks.forEach(task => {
        statusCounts[task.status] = (statusCounts[task.status] || 0) + 1;
      });
      const tasksByStatus = Object.entries(statusCounts).map(([status, count]) => ({
        status,
        count,
      }));

      // Задачи по приоритетам
      const priorityCounts: Record<string, number> = {};
      tasks.forEach(task => {
        const priority = task.priority || 'none';
        priorityCounts[priority] = (priorityCounts[priority] || 0) + 1;
      });
      const tasksByPriority = Object.entries(priorityCounts).map(([priority, count]) => ({
        priority,
        count,
      }));

      // Задачи по исполнителям
      const assigneeCounts: Record<string, { count: number; name: string }> = {};
      tasks.forEach(task => {
        if (task.assigneeId) {
          const user = users.find(u => u.id === task.assigneeId);
          if (!assigneeCounts[task.assigneeId]) {
            assigneeCounts[task.assigneeId] = {
              count: 0,
              name: user?.name || 'Неизвестно',
            };
          }
          assigneeCounts[task.assigneeId].count++;
        }
      });
      const tasksByAssignee = Object.entries(assigneeCounts).map(([assigneeId, data]) => ({
        assigneeId,
        assigneeName: data.name,
        count: data.count,
      })).sort((a, b) => b.count - a.count);

      // Недавняя активность
      const recentActivity = taskHistory
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        .slice(0, 10)
        .map(history => {
          const user = users.find(u => u.id === history.userId);
          const task = tasks.find(t => t.id === history.taskId);
          return {
            id: history.id,
            action: history.action || 'updated',
            userName: user?.name || 'Неизвестно',
            taskTitle: task?.title || 'Задача удалена',
            timestamp: history.createdAt || new Date().toISOString(),
          };
        });

      // Лучшие исполнители
      const performerCounts: Record<string, { count: number; name: string; avatar?: string }> = {};
      completedTasksWithHistory.forEach(task => {
        if (task.assigneeId) {
          const user = users.find(u => u.id === task.assigneeId);
          if (!performerCounts[task.assigneeId]) {
            performerCounts[task.assigneeId] = {
              count: 0,
              name: user?.name || 'Неизвестно',
              avatar: user?.avatar,
            };
          }
          performerCounts[task.assigneeId].count++;
        }
      });
      const topPerformers = Object.entries(performerCounts)
        .map(([userId, data]) => ({
          userId,
          userName: data.name,
          completedTasks: data.count,
          avatar: data.avatar,
        }))
        .sort((a, b) => b.completedTasks - a.completedTasks)
        .slice(0, 5);

      // Задачи требующие внимания
      const needsAttention = tasks
        .filter(t => {
          if (t.status === 'completed') return false;
          if (!t.dueDate) return t.priority === 'high';
          const dueDate = new Date(t.dueDate);
          const now = new Date();
          const daysUntilDue = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
          return daysUntilDue < 2 || dueDate < now;
        })
        .sort((a, b) => {
          const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
          const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
          return aDue - bDue;
        })
        .slice(0, 10)
        .map(task => {
          const user = users.find(u => u.id === task.assigneeId);
          return {
            id: task.id,
            title: task.title,
            assigneeName: user?.name || 'Не назначено',
            dueDate: task.dueDate || new Date().toISOString(),
            priority: task.priority || 'medium',
          };
        });

      res.json({
        totalTasks,
        completedTasks,
        inProgressTasks,
        overdueTasks,
        averageCompletionTime,
        tasksByStatus,
        tasksByPriority,
        tasksByAssignee,
        recentActivity,
        topPerformers,
        needsAttention,
      });
    } catch (error) {
      console.error("Manager stats error:", error);
      res.status(500).json({ message: "Failed to fetch manager stats" });
    }
  });

  // Events
  app.get("/api/events", async (req, res) => {
    const { userId, start, end } = req.query;
    
    const events = await withDbTimeout(async () => {
      if (userId) {
        return await storage.getEventsByUser(userId as string);
      } else if (start && end) {
        return await storage.getEventsByDateRange(new Date(start as string), new Date(end as string));
      } else {
        return await storage.getEvents();
      }
    }, 3000, []); // 3 секунды для быстрого ответа
    
    res.json(events);
  });

  app.post("/api/events", async (req, res) => {
    try {
      console.log("[Events] Creating event...");
      const eventData = insertEventSchema.parse(req.body);
      
      console.log("[Events] Saving to database...");
      const event = await withDbTimeout(
        () => storage.createEvent(eventData),
        30000, // 30 секунд для создания
        null
      );
      
      if (!event) {
        throw new Error("Failed to create event - database timeout");
      }
      
      console.log("[Events] Event created successfully:", event.id);
      res.json(event);
    } catch (error: any) {
      console.error("[Events] Error creating event:", error);
      const errorMessage = error.message || "Invalid event data";
      res.status(400).json({ 
        message: errorMessage,
        error: error.message 
      });
    }
  });

  app.put("/api/events/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const event = await storage.updateEvent(id, req.body);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      res.json(event);
    } catch (error) {
      res.status(500).json({ message: "Failed to update event" });
    }
  });

  app.delete("/api/events/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteEvent(id);
      if (!deleted) {
        return res.status(404).json({ message: "Event not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete event" });
    }
  });

  // Equipment
  app.get("/api/equipment", async (req, res) => {
    const { status } = req.query;
    
    const equipment = await withDbTimeout(async () => {
      if (status) {
        return await storage.getEquipmentByStatus(status as string);
      } else {
        return await storage.getEquipment();
      }
    }, 3000, []); // 3 секунды для быстрого ответа
    
    res.json(equipment);
  });

  app.post("/api/equipment", async (req, res) => {
    try {
      console.log("[Equipment] Creating equipment...");
      const equipmentData = insertEquipmentSchema.parse(req.body);
      
      // Only admins can create/promote barcodes (Cr-codes)
      // Check if user is admin if barcode is being set
      if (equipmentData.barcode) {
        // In production, check user session/role here
        // For now, allow but log for security
        console.log("[Equipment] Barcode creation attempted:", equipmentData.barcode);
      }
      
      console.log("[Equipment] Saving to database...");
      const equipment = await withDbTimeout(
        () => storage.createEquipment(equipmentData),
        30000, // 30 секунд для создания
        null
      );
      
      if (!equipment) {
        throw new Error("Failed to create equipment - database timeout");
      }
      
      console.log("[Equipment] Equipment created successfully:", equipment.id);
      res.json(equipment);
    } catch (error: any) {
      console.error("[Equipment] Error creating equipment:", error);
      const errorMessage = error.message || "Invalid equipment data";
      res.status(400).json({ 
        message: errorMessage,
        error: error.message 
      });
    }
  });

  app.put("/api/equipment/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      // Only admins can update/promote barcodes (Cr-codes)
      if (req.body.barcode) {
        // In production, check user session/role here
        // For now, allow but log for security
        console.log("Barcode update/promotion attempted:", req.body.barcode);
      }
      
      const equipment = await storage.updateEquipment(id, req.body);
      if (!equipment) {
        return res.status(404).json({ message: "Equipment not found" });
      }
      res.json(equipment);
    } catch (error) {
      res.status(500).json({ message: "Failed to update equipment" });
    }
  });

  // Systems
  app.get("/api/systems", async (req, res) => {
    const systems = await withDbTimeout(() => storage.getSystems(), 3000, []);
    
    // Автоматическая проверка статуса систем с IP адресами (не блокируем ответ)
    Promise.all(
      systems.map(async (system: any) => {
        if (system.ipAddress && system.status !== "maintenance") {
          try {
            const isOnline = await checkIP(system.ipAddress);
            const newStatus = isOnline ? "online" : "offline";
            
            // Обновляем статус только если он изменился (в фоне, не блокируем ответ)
            if (system.status !== newStatus) {
              withDbTimeout(() => storage.pingSystem(system.id, newStatus), 3000, undefined).catch(() => {});
            }
          } catch (error) {
            // Игнорируем ошибки проверки
          }
        }
      })
    ).catch(() => {}); // Игнорируем ошибки проверки
    
    res.json(systems);
  });

  app.post("/api/systems", async (req, res) => {
    try {
      const systemData = insertSystemSchema.parse(req.body);
      const system = await storage.createSystem(systemData);
      res.json(system);
    } catch (error) {
      res.status(500).json({ message: "Failed to create system" });
    }
  });

  app.put("/api/systems/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const system = await storage.updateSystem(id, req.body);
      if (!system) {
        return res.status(404).json({ message: "System not found" });
      }
      res.json(system);
    } catch (error) {
      res.status(500).json({ message: "Failed to update system" });
    }
  });

  // IP ping functionality
  app.post("/api/systems/ping", async (req, res) => {
    try {
      const { ip } = req.body;
      if (!ip) {
        return res.status(400).json({ message: "IP address is required" });
      }

      const startTime = Date.now();
      const isOnline = await checkIP(ip);
      const responseTime = Date.now() - startTime;

      res.json({
        ip,
        isOnline,
        responseTime: isOnline ? responseTime : undefined,
        error: isOnline ? undefined : "Host is unreachable"
      });
    } catch (error) {
      console.error("Error pinging IP:", error);
      res.status(500).json({ 
        ip: req.body.ip,
        isOnline: false,
        error: "Failed to ping host"
      });
    }
  });

  // Streams
  app.get("/api/streams", async (req, res) => {
    const { active, userId } = req.query;
    
    const streams = await withDbTimeout(async () => {
      if (active === "true") {
        return await storage.getActiveStreams();
      } else if (userId) {
        return await storage.getStreamsByUser(userId as string);
      } else {
        return await storage.getStreams();
      }
    }, 3000, []); // 3 секунды для быстрого ответа
    
    res.json(streams);
  });

  app.post("/api/streams", async (req, res) => {
    try {
      const streamData = insertStreamSchema.parse(req.body);
      const stream = await storage.createStream(streamData);
      res.json(stream);
    } catch (error) {
      res.status(400).json({ message: "Invalid stream data" });
    }
  });

  app.put("/api/streams/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const stream = await storage.updateStream(id, req.body);
      if (!stream) {
        return res.status(404).json({ message: "Stream not found" });
      }
      res.json(stream);
    } catch (error) {
      res.status(500).json({ message: "Failed to update stream" });
    }
  });

  // External API integrations
  app.get("/api/integrations/youtube/stats", async (req, res) => {
    try {
      // Mock YouTube API response - in real app would use YouTube Data API
      const youtubeStats = {
        viewers: Math.floor(Math.random() * 2000) + 500,
        duration: "1ч 25м",
        status: "live",
        bitrate: "6000 kbps",
        fps: 60,
      };
      res.json(youtubeStats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch YouTube stats" });
    }
  });

  app.get("/api/integrations/vk/stats", async (req, res) => {
    try {
      // Mock VK API response - in real app would use VK API
      const vkStats = {
        viewers: Math.floor(Math.random() * 1500) + 300,
        duration: "1ч 25м", 
        status: "live",
        bitrate: "5800 kbps",
        fps: 60,
      };
      res.json(vkStats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch VK stats" });
    }
  });

  // vMix Scheduler Integration
  app.get("/api/integrations/vmix/scheduler", async (req, res) => {
    try {
      // In production, this would fetch from vmix.rullz.ru API
      // For now, return mock data showing the scheduler structure
      const now = new Date();
      const mockEvents = [
        {
          id: "1",
          title: "Утренний эфир",
          startTime: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
          endTime: new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString(),
          status: "scheduled" as const,
          preset: "morning_show",
          channel: "main",
        },
        {
          id: "2", 
          title: "Вечерний стрим",
          startTime: new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString(),
          endTime: new Date(now.getTime() + 11 * 60 * 60 * 1000).toISOString(),
          status: "scheduled" as const,
          preset: "evening_stream",
          channel: "main",
        },
        {
          id: "3",
          title: "Ночной повтор",
          startTime: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          status: "scheduled" as const,
          preset: "replay",
          channel: "secondary",
        },
      ];

      res.json({
        connected: true,
        events: mockEvents,
        lastSync: new Date().toISOString(),
        nextEvent: mockEvents[0],
      });
    } catch (error) {
      res.status(500).json({ 
        connected: false,
        events: [],
        message: "Failed to fetch vMix scheduler data" 
      });
    }
  });

  // ChatGPT - работа с локальными LLM моделями
  app.post("/api/chat/completions", async (req, res) => {
    try {
      const { model, messages, endpoint } = req.body;

      if (!model || !messages || !endpoint) {
        return res.status(400).json({ message: "Missing required parameters" });
      }

      // Проверяем доступность локальной модели
      try {
        const healthCheck = await fetch(endpoint.replace('/v1/chat/completions', '/health'), {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!healthCheck.ok) {
          throw new Error("Local model is not available");
        }
      } catch (error: any) {
        return res.status(503).json({
          message: "Локальная модель недоступна. Убедитесь, что модель запущена.",
          error: error.message,
        });
      }

      // Отправка запроса к локальной модели
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          temperature: 0.7,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Model returned error: ${response.statusText}`);
      }

      const data = await response.json();
      
      res.json({
        content: data.choices?.[0]?.message?.content || "Не удалось получить ответ от модели",
        model: data.model || model,
      });
    } catch (error: any) {
      console.error("ChatGPT API error:", error);
      res.status(500).json({
        message: error.message || "Failed to get response from local model",
      });
    }
  });

  // ChatGPT Sessions - получение списка чатов пользователя
  app.get("/api/chat/sessions", async (req, res) => {
    try {
      const { userId } = req.query;
      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ message: "UserId is required" });
      }

      console.log(`[ChatGPT] Fetching sessions for user: ${userId}`);
      const sessions = await storage.getChatSessionsByUser(userId);
      console.log(`[ChatGPT] Found ${sessions.length} sessions for user ${userId}`);
      res.json(sessions);
    } catch (error: any) {
      console.error("Failed to fetch chat sessions:", error);
      res.status(500).json({ 
        message: "Failed to fetch chat sessions",
        error: error.message 
      });
    }
  });

  // ChatGPT Sessions - создание нового чата
  app.post("/api/chat/sessions", async (req, res) => {
    try {
      const { userId, title, modelId } = req.body;
      console.log(`[ChatGPT] Creating session - userId: ${userId}, title: ${title}, modelId: ${modelId}`);
      
      if (!userId) {
        console.error("[ChatGPT] Missing userId in request");
        return res.status(400).json({ message: "UserId is required" });
      }
      if (!title || title.trim() === "") {
        console.error("[ChatGPT] Missing or empty title in request");
        return res.status(400).json({ message: "Title is required" });
      }

      // Проверяем, что пользователь существует
      const user = await storage.getUser(userId);
      if (!user) {
        console.error(`[ChatGPT] User not found: ${userId}`);
        return res.status(404).json({ message: "User not found" });
      }

      const session = await storage.createChatSession({
        userId,
        title: title.trim(),
        modelId: modelId || null,
      });

      console.log(`[ChatGPT] Session created successfully: ${session.id}`);
      res.json(session);
    } catch (error: any) {
      console.error("Failed to create chat session:", error);
      res.status(500).json({ 
        message: "Failed to create chat session",
        error: error.message 
      });
    }
  });

  // ChatGPT Sessions - удаление чата
  app.delete("/api/chat/sessions/:id", async (req, res) => {
    try {
      const { userId } = req.query;
      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ message: "UserId is required" });
      }

      const { id } = req.params;
      const session = await storage.getChatSessionById(id);
      
      if (!session || session.userId !== userId) {
        return res.status(404).json({ message: "Chat session not found" });
      }

      await storage.deleteChatSession(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Failed to delete chat session:", error);
      res.status(500).json({ message: "Failed to delete chat session" });
    }
  });

  // ChatGPT Messages - получение сообщений чата
  app.get("/api/chat/sessions/:id/messages", async (req, res) => {
    try {
      const { userId } = req.query;
      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ message: "UserId is required" });
      }

      const { id } = req.params;
      const session = await storage.getChatSessionById(id);
      
      if (!session) {
        return res.status(404).json({ message: "Chat session not found" });
      }

      // Проверяем, что пользователь имеет доступ к этому чату
      if (session.userId !== userId) {
        console.warn(`[ChatGPT] User ${userId} tried to access session ${id} owned by ${session.userId}`);
        return res.status(403).json({ message: "Access denied" });
      }

      const messages = await storage.getChatMessagesBySession(id);
      res.json(messages);
    } catch (error: any) {
      console.error("Failed to fetch chat messages:", error);
      res.status(500).json({ message: "Failed to fetch chat messages" });
    }
  });

  // ChatGPT Messages - создание сообщения
  app.post("/api/chat/sessions/:id/messages", async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ message: "UserId is required" });
      }

      const { id } = req.params;
      const session = await storage.getChatSessionById(id);
      
      if (!session) {
        return res.status(404).json({ message: "Chat session not found" });
      }

      // Проверяем, что пользователь имеет доступ к этому чату
      if (session.userId !== userId) {
        console.warn(`[ChatGPT] User ${userId} tried to post to session ${id} owned by ${session.userId}`);
        return res.status(403).json({ message: "Access denied" });
      }

      const { role, content, attachments } = req.body;
      if (!role || !content) {
        return res.status(400).json({ message: "Role and content are required" });
      }

      const message = await storage.createChatMessage({
        sessionId: id,
        role,
        content,
        attachments: attachments || [],
      });

      res.json(message);
    } catch (error: any) {
      console.error("Failed to create chat message:", error);
      res.status(500).json({ message: "Failed to create chat message" });
    }
  });

  // ChatGPT Upload - загрузка файлов для чатов
  app.post("/api/chat/upload", chatUpload.single("file"), async (req, res) => {
    try {
      const { userId, sessionId } = req.body;
      if (!userId) {
        return res.status(400).json({ message: "UserId is required" });
      }
      if (!sessionId) {
        return res.status(400).json({ message: "Session ID is required" });
      }

      const session = await storage.getChatSessionById(sessionId);
      if (!session || session.userId !== userId) {
        return res.status(404).json({ message: "Chat session not found" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "File is required" });
      }

      const filePath = path.relative(process.cwd(), req.file.path);
      const fileUrl = `/${filePath.replace(/\\\\/g, "/")}`;

      let transcription: string | undefined;

      // Если это аудио файл, транскрибируем через Whisper X (или fallback на whisper.cpp)
      if (req.file.mimetype.startsWith("audio/") || req.file.mimetype.startsWith("video/")) {
        try {
          transcription = await transcribeAudioWithWhisper(req.file.path);
        } catch (error: any) {
          console.error("Failed to transcribe audio:", error);
          // Не прерываем загрузку, просто не добавляем транскрипцию
        }
      }

      res.json({
        id: crypto.randomUUID(),
        name: req.file.originalname,
        url: fileUrl,
        type: req.file.mimetype,
        size: req.file.size,
        transcription,
      });
    } catch (error: any) {
      console.error("Failed to upload chat file:", error);
      res.status(500).json({ message: "Failed to upload file" });
    }
  });

  // Импортируем сервисы для транскрибации (генератор документов импортируется динамически при необходимости)
  const { whisperXClient } = await import("./services/whisper-x-client.js");

  // Функция для транскрипции аудио через whisper.cpp (fallback для локальной транскрибации)
  async function transcribeAudioWithWhisper(audioPath: string): Promise<string> {
    // Сначала пробуем использовать удаленный Whisper X API (если настроен)
    try {
      if (whisperXClient.isConfigured()) {
        const result = await whisperXClient.transcribe(audioPath, {
          language: "ru",
          returnTimestamps: false,
        });
        return result.text;
      }
    } catch (error: any) {
      console.warn("[Transcription] Whisper X failed, trying local whisper.cpp:", error.message);
      
      // Fallback на локальный whisper.cpp если удаленный API недоступен
      const { spawn } = await import("child_process");
      const whisperBasePath = process.env.WHISPER_CPP_PATH || "./whisper.cpp";
      const modelPath = process.env.WHISPER_MODEL_PATH || path.join(whisperBasePath, "models", "ggml-base.bin");

      return new Promise((resolve, reject) => {
        // Определяем путь к исполняемому файлу whisper.cpp
        const whisperExecutable = process.platform === "win32" 
          ? path.join(whisperBasePath, "main.exe")
          : path.join(whisperBasePath, "main");

        // Запускаем whisper.cpp для транскрипции
        const whisper = spawn(whisperExecutable, [
          "-m", modelPath,
          "-f", audioPath,
          "-l", "ru", // Язык: русский (можно изменить)
          "-t", "4", // Количество потоков
          "--no-timestamps", // Без временных меток
        ], {
          cwd: process.cwd(),
        });

        let output = "";
        let errorOutput = "";

        whisper.stdout.on("data", (data) => {
          output += data.toString();
        });

        whisper.stderr.on("data", (data) => {
          errorOutput += data.toString();
        });

        whisper.on("close", (code) => {
          if (code === 0) {
            // Парсим вывод whisper.cpp
            // Whisper.cpp выводит транскрипцию в stdout, обычно после строк с временными метками
            const lines = output.split("\n")
              .filter(line => line.trim() && !line.includes("[") && !line.includes("]"))
              .map(line => line.trim())
              .filter(line => line.length > 0);
            
            // Берем последние строки, которые обычно содержат транскрипцию
            const transcription = lines.slice(-5).join(" ").trim();
            resolve(transcription || "Транскрипция не получена");
          } else {
            // Если whisper.cpp не найден или произошла ошибка
            console.warn("Whisper.cpp error:", errorOutput);
            reject(new Error(`Whisper.cpp failed with code ${code}: ${errorOutput}`));
          }
        });

        whisper.on("error", (error) => {
          // Если whisper.cpp не установлен
          console.warn("Whisper.cpp not found or error:", error.message);
          reject(new Error(`Whisper.cpp not available: ${error.message}`));
        });
      });
    }
  }

  // vMix API - подключение и статус
  app.post("/api/vmix/connect", async (req, res) => {
    try {
      const { host, port } = req.body;

      if (!host || !port) {
        return res.status(400).json({ message: "Host and port are required" });
      }

      const vmixUrl = `http://${host}:${port}/api`;

      // Проверка подключения к vMix
      const response = await fetch(`${vmixUrl}?Function=GetVersion`);
      
      if (!response.ok) {
        throw new Error("Failed to connect to vMix");
      }

      const data = await response.text();
      
      res.json({
        connected: true,
        host,
        port,
        version: data,
      });
    } catch (error: any) {
      console.error("vMix connection error:", error);
      res.status(500).json({
        connected: false,
        message: error.message || "Failed to connect to vMix",
      });
    }
  });

  // vMix API - получение статуса
  app.get("/api/vmix/status", async (req, res) => {
    try {
      const host = req.query.host as string || "localhost";
      const port = req.query.port as string || "8088";
      const vmixUrl = `http://${host}:${port}/api`;

      // Получение информации о vMix с таймаутом и обработкой ошибок
      let versionResponse, xmlResponse;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 секунды таймаут
        
        [versionResponse, xmlResponse] = await Promise.all([
          fetch(`${vmixUrl}?Function=GetVersion`, { signal: controller.signal as any }),
          fetch(`${vmixUrl}`, { signal: controller.signal as any }),
        ]);
        
        clearTimeout(timeoutId);
      } catch (fetchError: any) {
        // vMix недоступен - возвращаем статус "не подключен" без ошибки
        return res.json({
          connected: false,
          message: "vMix недоступен. Проверьте, что vMix запущен и доступен по указанному адресу.",
        });
      }

      if (!versionResponse.ok || !xmlResponse.ok) {
        return res.json({
          connected: false,
          message: "vMix не отвечает",
        });
      }

      const xmlText = await xmlResponse.text();
      
      // Парсинг XML для получения входов и статуса
      const inputsMatch = xmlText.match(/<inputs count="(\d+)"/);
      const inputsCount = inputsMatch ? parseInt(inputsMatch[1]) : 0;
      
      const previewMatch = xmlText.match(/preview="(\d+)"/);
      const programMatch = xmlText.match(/active="(\d+)"/);
      const recordingMatch = xmlText.match(/recording="(True|False)"/);
      const streamingMatch = xmlText.match(/streaming="(True|False)"/);

      const inputs: Array<{ number: number; title: string; state: string }> = [];
      
      // Парсинг входов из XML
      const inputRegex = /<input key="([^"]+)" number="(\d+)" title="([^"]+)"/g;
      let match;
      while ((match = inputRegex.exec(xmlText)) !== null && inputs.length < 20) {
        inputs.push({
          number: parseInt(match[2]),
          title: match[3],
          state: match[1],
        });
      }

      res.json({
        connected: true,
        host,
        port: parseInt(port),
        inputs,
        preview: previewMatch ? parseInt(previewMatch[1]) : 0,
        program: programMatch ? parseInt(programMatch[1]) : 0,
        recording: recordingMatch?.[1] === "True",
        streaming: streamingMatch?.[1] === "True",
      });
    } catch (error: any) {
      // vMix недоступен - это нормально, не крашим приложение
      console.warn("vMix status: недоступен (это нормально, если vMix не запущен)");
      res.json({ 
        connected: false,
        message: "vMix недоступен"
      });
    }
  });

  // vMix API - выполнение команды
  app.post("/api/vmix/command", async (req, res) => {
    try {
      const { command, host, port, input } = req.body;

      if (!command) {
        return res.status(400).json({ message: "Command is required" });
      }

      const vmixHost = host || "localhost";
      const vmixPort = port || 8088;
      const vmixUrl = `http://${vmixHost}:${vmixPort}/api`;

      // Формирование URL для команды
      let commandUrl = `${vmixUrl}?Function=${command}`;
      if (input !== undefined) {
        commandUrl += `&Input=${input}`;
      }

      const response = await fetch(commandUrl);

      if (!response.ok) {
        throw new Error(`Command failed: ${response.statusText}`);
      }

      res.json({
        success: true,
        command,
        response: await response.text(),
      });
    } catch (error: any) {
      console.error("vMix command error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to execute vMix command",
      });
    }
  });

  // vMix API - получение расписания
  app.get("/api/vmix/scheduler", async (req, res) => {
    try {
      const events = await storage.getVmixSchedulerEvents();
      
      // Преобразуем в формат для фронтенда
      const formattedEvents = events.map(event => ({
        id: event.id,
        title: event.title,
        startTime: event.startTime?.toISOString() || new Date().toISOString(),
        endTime: event.endTime?.toISOString(),
        status: event.status,
        actions: Array.isArray(event.actions) ? event.actions : [],
        input: event.input,
        vmixHost: event.vmixHost,
        vmixPort: event.vmixPort,
      }));

      res.json({
        events: formattedEvents,
      });
    } catch (error: any) {
      console.error("vMix scheduler error:", error);
      res.status(500).json({
        events: [],
        message: error.message || "Failed to fetch scheduler events",
      });
    }
  });

  // vMix API - создание события
  app.post("/api/vmix/scheduler/events", async (req, res) => {
    try {
      const { title, startTime, input, actions, vmixHost, vmixPort } = req.body;

      if (!title || !startTime) {
        return res.status(400).json({ message: "Title and startTime are required" });
      }

      const newEvent = await storage.createVmixSchedulerEvent({
        title,
        startTime: new Date(startTime),
        status: "scheduled",
        actions: actions || [],
        input: input || null,
        vmixHost: vmixHost || null,
        vmixPort: vmixPort || null,
      });

      res.json({
        id: newEvent.id,
        title: newEvent.title,
        startTime: newEvent.startTime?.toISOString(),
        endTime: newEvent.endTime?.toISOString(),
        status: newEvent.status,
        actions: Array.isArray(newEvent.actions) ? newEvent.actions : [],
        input: newEvent.input,
      });
    } catch (error: any) {
      console.error("vMix create event error:", error);
      res.status(500).json({
        message: error.message || "Failed to create event",
      });
    }
  });

  // vMix API - обновление события
  app.put("/api/vmix/scheduler/events/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { title, startTime, input, actions, status, vmixHost, vmixPort } = req.body;

      const updateData: any = {};
      if (title) updateData.title = title;
      if (startTime) updateData.startTime = new Date(startTime);
      if (input !== undefined) updateData.input = input;
      if (actions) updateData.actions = actions;
      if (status) updateData.status = status;
      if (vmixHost !== undefined) updateData.vmixHost = vmixHost;
      if (vmixPort !== undefined) updateData.vmixPort = vmixPort;

      const updatedEvent = await storage.updateVmixSchedulerEvent(id, updateData);
      
      if (!updatedEvent) {
        return res.status(404).json({ message: "Event not found" });
      }

      res.json({
        id: updatedEvent.id,
        title: updatedEvent.title,
        startTime: updatedEvent.startTime?.toISOString(),
        endTime: updatedEvent.endTime?.toISOString(),
        status: updatedEvent.status,
        actions: Array.isArray(updatedEvent.actions) ? updatedEvent.actions : [],
        input: updatedEvent.input,
      });
    } catch (error: any) {
      console.error("vMix update event error:", error);
      res.status(500).json({
        message: error.message || "Failed to update event",
      });
    }
  });

  // vMix API - удаление события
  app.delete("/api/vmix/scheduler/events/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteVmixSchedulerEvent(id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Event not found" });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("vMix delete event error:", error);
      res.status(500).json({
        message: error.message || "Failed to delete event",
      });
    }
  });

  // Notifications
  app.get("/api/notifications/:userId", async (req, res) => {
    const { userId } = req.params;
    // Используем withDbTimeout для быстрой обработки ошибок БД
    const notifications = await withDbTimeout(
      () => storage.getNotificationsByUser(userId),
      3000,
      [] // Пустой массив по умолчанию
    );
    res.json(notifications);
  });

  app.post("/api/notifications", async (req, res) => {
    try {
      const notificationData = insertNotificationSchema.parse(req.body);
      const notification = await storage.createNotification(notificationData);
      res.json(notification);
    } catch (error) {
      res.status(400).json({ message: "Invalid notification data" });
    }
  });

  app.patch("/api/notifications/:id/read", async (req, res) => {
    try {
      const { id } = req.params;
      const success = await storage.markNotificationRead(id);
      if (!success) {
        return res.status(404).json({ message: "Notification not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  // Equipment Photo Upload
  app.post("/api/equipment/:id/photos", upload.single('photo'), async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!req.file) {
        return res.status(400).json({ message: "No photo file provided" });
      }

      const photoUrl = `/uploads/${req.file.filename}`;
      const equipment = await storage.uploadEquipmentPhoto(id, photoUrl);
      
      if (!equipment) {
        return res.status(404).json({ message: "Equipment not found" });
      }

      res.json(equipment);
    } catch (error) {
      res.status(500).json({ message: "Failed to upload photo" });
    }
  });

  // Serve uploaded files
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // ============= TRANSCRIPTIONS (PODCAST FOLDERS & FILES) =============

  const TRANSCRIPTIONS_BASE_DIR = path.join(process.cwd(), "uploads", "transcriptions");

  // Helper to safely join paths inside transcriptions directory
  function getSafeTranscriptionPath(...segments: string[]) {
    const safeSegments = segments.map((seg) =>
      seg
        .toString()
        .trim()
        .replace(/(\.\.[/\\])/g, "")
        .replace(/[^a-zA-Z0-9-_/\\а-яА-ЯёЁ ]/g, "_")
    );
    return path.join(TRANSCRIPTIONS_BASE_DIR, ...safeSegments);
  }

  // List all podcast folders
  app.get("/api/transcriptions/podcasts", async (req, res) => {
    try {
      try {
        await fs.mkdir(TRANSCRIPTIONS_BASE_DIR, { recursive: true });
      } catch {
        // ignore
      }

      const entries = await fs.readdir(TRANSCRIPTIONS_BASE_DIR, { withFileTypes: true });
      const podcasts = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({
          name: entry.name,
        }));

      res.json(podcasts);
    } catch (error) {
      console.error("Failed to list podcasts:", error);
      res.status(500).json({ message: "Failed to list podcasts" });
    }
  });

  // Create new podcast folder
  app.post("/api/transcriptions/podcasts", async (req, res) => {
    try {
      const { name } = req.body;
      if (!name || typeof name !== "string") {
        return res.status(400).json({ message: "Название подкаста обязательно" });
      }

      const dirPath = getSafeTranscriptionPath(name);
      await fs.mkdir(dirPath, { recursive: true });

      res.json({ name });
    } catch (error) {
      console.error("Failed to create podcast folder:", error);
      res.status(500).json({ message: "Failed to create podcast folder" });
    }
  });

  // List contents of a podcast (folders + files)
  app.get("/api/transcriptions/podcasts/:podcast/contents", async (req, res) => {
    try {
      const { podcast } = req.params;
      const { path: relativePath = "" } = req.query;

      const targetDir = getSafeTranscriptionPath(podcast, String(relativePath || ""));

      try {
        await fs.mkdir(targetDir, { recursive: true });
      } catch {
        // ignore
      }

      const entries = await fs.readdir(targetDir, { withFileTypes: true });

      const folders = entries
        .filter((e) => e.isDirectory())
        .map((e) => ({
          name: e.name,
          type: "folder" as const,
        }));

      const files = entries
        .filter((e) => e.isFile())
        .map((e) => ({
          name: e.name,
          type: "file" as const,
        }));

      res.json({ folders, files });
    } catch (error) {
      console.error("Failed to list podcast contents:", error);
      res.status(500).json({ message: "Failed to list podcast contents" });
    }
  });

  // Create subfolder inside podcast
  app.post("/api/transcriptions/podcasts/:podcast/folders", async (req, res) => {
    try {
      const { podcast } = req.params;
      const { parentPath = "", name } = req.body;

      if (!name || typeof name !== "string") {
        return res.status(400).json({ message: "Название папки обязательно" });
      }

      const targetDir = getSafeTranscriptionPath(podcast, String(parentPath || ""), name);
      await fs.mkdir(targetDir, { recursive: true });

      res.json({ name });
    } catch (error) {
      console.error("Failed to create subfolder:", error);
      res.status(500).json({ message: "Failed to create subfolder" });
    }
  });

  // Upload file into podcast/folder
  app.post(
    "/api/transcriptions/upload",
    transcriptionUpload.single("file"),
    async (req, res) => {
      try {
        const { podcast, path: relativePath = "" } = req.body;

        if (!podcast) {
          return res.status(400).json({ message: "Podcast is required" });
        }

        if (!req.file) {
          return res.status(400).json({ message: "File is required" });
        }

        const storagePath = path.relative(
          process.cwd(),
          req.file.path
        );

        res.json({
          name: req.file.filename,
          originalName: req.file.originalname,
          size: req.file.size,
          podcast,
          path: relativePath,
          url: `/${storagePath.replace(/\\\\/g, "/")}`,
        });
      } catch (error) {
        console.error("Failed to upload transcription file:", error);
        res.status(500).json({ message: "Failed to upload file" });
      }
    }
  );

  // Health check для AI транскрибации
  app.get("/api/ai-transcription/health", async (req, res) => {
    try {
      const { whisperXClient } = await import("./services/whisper-x-client.js");
      if (!whisperXClient.isConfigured()) {
        return res.json({ available: false, message: "Whisper X API не настроен" });
      }
      const isAvailable = await whisperXClient.healthCheck();
      res.json({ available: isAvailable });
    } catch (error: any) {
      res.json({ available: false, message: error.message });
    }
  });

  // Новый endpoint для AI транскрибации с сохранением в чат
  app.post(
    "/api/ai-transcription/transcribe",
    transcriptionUpload.single("file"),
    async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ message: "File is required" });
        }

        const { 
          format = "txt", 
          language = "ru",
          numSpeakers,
          diarize = true,
          chatSessionId, // ID чата для сохранения результата
          userId, // ID пользователя
        } = req.body;
        const outputFormat = format.toLowerCase();
        
        const speakerCount = numSpeakers ? parseInt(numSpeakers, 10) : undefined;

        const isAudioVideo = 
          req.file.mimetype.startsWith("audio/") || 
          req.file.mimetype.startsWith("video/");

        if (!isAudioVideo) {
          return res.status(400).json({ 
            message: "File must be an audio or video file" 
          });
        }

        // Проверяем доступность Whisper X
        const { whisperXClient } = await import("./services/whisper-x-client.js");
        if (!whisperXClient.isConfigured()) {
          return res.status(503).json({ 
            message: "Whisper X API не настроен. Проверьте переменные окружения.",
            available: false
          });
        }

        console.log(`[AI Transcription] Starting transcription for ${req.file.originalname}...`);

        // Транскрибируем через Whisper X
        const transcriptionResult = await whisperXClient.transcribe(req.file.path, {
          language: language === "auto" ? undefined : language,
          returnTimestamps: outputFormat !== "txt",
          diarize: diarize === true || diarize === "true",
          numSpeakers: speakerCount && speakerCount > 0 ? speakerCount : undefined,
        });

        console.log(`[AI Transcription] Transcription completed, generating ${outputFormat.toUpperCase()}...`);

        // Импортируем генератор документов (с обработкой ошибок)
        let documentGenerator;
        try {
          const docGenModule = await import("./services/document-generator.js");
          documentGenerator = docGenModule.documentGenerator;
        } catch (error: any) {
          return res.status(503).json({ 
            message: "Генератор документов недоступен. Установите зависимости: npm install docx pdfkit",
            error: error.message,
            available: false
          });
        }

        // Генерируем файл
        const outputDir = path.join(process.cwd(), "uploads", "transcriptions", "output");
        await fs.mkdir(outputDir, { recursive: true });

        const originalName = path.basename(req.file.originalname, path.extname(req.file.originalname));
        const timestamp = Date.now();
        let outputPath: string;
        let mimeType: string;
        let downloadFileName: string;

        try {
          if (outputFormat === "doc" || outputFormat === "docx") {
            outputPath = path.join(outputDir, `${originalName}-${timestamp}.docx`);
            await documentGenerator.generateDOC(transcriptionResult, outputPath);
            mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            downloadFileName = `${originalName}-transcription.docx`;
          } else if (outputFormat === "pdf") {
            outputPath = path.join(outputDir, `${originalName}-${timestamp}.pdf`);
            await documentGenerator.generatePDF(transcriptionResult, outputPath);
            mimeType = "application/pdf";
            downloadFileName = `${originalName}-transcription.pdf`;
          } else {
            // TXT формат
            outputPath = path.join(outputDir, `${originalName}-${timestamp}.txt`);
            let textContent = transcriptionResult.text;
            
            if (transcriptionResult.segments && transcriptionResult.segments.length > 0) {
              const formatTime = (seconds: number): string => {
                const mins = Math.floor(seconds / 60);
                const secs = Math.floor(seconds % 60);
                return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
              };
              textContent = transcriptionResult.segments
                .map((seg) => {
                  const timeStr = `[${formatTime(seg.start)}]`;
                  const speakerStr = seg.speakerLabel ? `${seg.speakerLabel}: ` : "";
                  return `${speakerStr}${timeStr} ${seg.text}`;
                })
                .join("\n\n");
            }
            
            await fs.writeFile(outputPath, textContent, "utf-8");
            mimeType = "text/plain";
            downloadFileName = `${originalName}-transcription.txt`;
          }
        } catch (genError: any) {
          // Если ошибка связана с отсутствием пакетов, возвращаем понятное сообщение
          if (genError.message && (genError.message.includes("docx") || genError.message.includes("pdfkit"))) {
            return res.status(503).json({ 
              message: genError.message,
              available: false
            });
          }
          throw genError;
        }

        const relativePath = path.relative(process.cwd(), outputPath);
        const fileUrl = `/${relativePath.replace(/\\\\/g, "/")}`;
        const stats = await fs.stat(outputPath);

        let chatMessageId: string | undefined;

        // Сохраняем результат в чат, если указан chatSessionId
        if (chatSessionId && userId) {
          try {
            const messageContent = `Транскрибация завершена:\n\nЯзык: ${transcriptionResult.language || language}\nФормат: ${outputFormat.toUpperCase()}\n${transcriptionResult.speakerCount ? `Спикеров: ${transcriptionResult.speakerCount}\n` : ""}\nФайл: ${downloadFileName}`;
            
            const message = await storage.createChatMessage({
              sessionId: chatSessionId,
              role: "assistant",
              content: messageContent,
              attachments: [{
                id: crypto.randomUUID(),
                name: downloadFileName,
                url: fileUrl,
                type: mimeType,
                size: stats.size,
              }],
            });

            chatMessageId = message.id;
          } catch (chatError: any) {
            console.warn("[AI Transcription] Failed to save to chat:", chatError);
            // Не прерываем процесс, просто не сохраняем в чат
          }
        }

        res.json({
          success: true,
          transcription: transcriptionResult.text,
          segments: transcriptionResult.segments,
          language: transcriptionResult.language || language,
          format: outputFormat,
          speakerCount: transcriptionResult.speakerCount,
          file: {
            url: fileUrl,
            name: downloadFileName,
            size: stats.size,
            mimeType,
          },
          chatMessageId,
        });
      } catch (error: any) {
        console.error("[AI Transcription] Failed to transcribe:", error);
        res.status(500).json({ 
          message: "Failed to transcribe file",
          error: error.message 
        });
      }
    }
  );

  // Старый endpoint для обратной совместимости (deprecated)
  app.post(
    "/api/transcriptions/transcribe",
    transcriptionUpload.single("file"),
    async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ message: "File is required" });
        }

        const { 
          format = "txt", 
          language = "ru",
          numSpeakers,
          diarize = true, // По умолчанию включаем диаризацию
        } = req.body;
        const outputFormat = format.toLowerCase(); // "txt", "doc", "pdf"
        
        // Парсим количество спикеров
        const speakerCount = numSpeakers ? parseInt(numSpeakers, 10) : undefined;

        // Проверяем, что файл является аудио или видео
        const isAudioVideo = 
          req.file.mimetype.startsWith("audio/") || 
          req.file.mimetype.startsWith("video/");

        if (!isAudioVideo) {
          return res.status(400).json({ 
            message: "File must be an audio or video file" 
          });
        }

        console.log(`[Transcription] Starting transcription for ${req.file.originalname}...`);

        // Импортируем сервисы
        const { whisperXClient } = await import("./services/whisper-x-client.js");
        
        // Импортируем генератор документов (с обработкой ошибок)
        let documentGenerator;
        try {
          const docGenModule = await import("./services/document-generator.js");
          documentGenerator = docGenModule.documentGenerator;
        } catch (error: any) {
          return res.status(503).json({ 
            message: "Генератор документов недоступен. Установите зависимости: npm install docx pdfkit",
            error: error.message,
            available: false
          });
        }

        // Транскрибируем через Whisper X с диаризацией спикеров
        const transcriptionResult = await whisperXClient.transcribe(req.file.path, {
          language: language === "auto" ? undefined : language,
          returnTimestamps: outputFormat !== "txt", // Временные метки для DOC/PDF
          diarize: diarize === true || diarize === "true",
          numSpeakers: speakerCount && speakerCount > 0 ? speakerCount : undefined,
        });

        console.log(`[Transcription] Transcription completed, generating ${outputFormat.toUpperCase()}...`);

        // Генерируем файл в нужном формате
        const outputDir = path.join(process.cwd(), "uploads", "transcriptions", "output");
        await fs.mkdir(outputDir, { recursive: true });

        const originalName = path.basename(req.file.originalname, path.extname(req.file.originalname));
        const timestamp = Date.now();
        let outputPath: string;
        let mimeType: string;
        let downloadFileName: string;

        try {
          if (outputFormat === "doc" || outputFormat === "docx") {
            outputPath = path.join(outputDir, `${originalName}-${timestamp}.docx`);
            await documentGenerator.generateDOC(transcriptionResult, outputPath);
            mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            downloadFileName = `${originalName}-transcription.docx`;
          } else if (outputFormat === "pdf") {
            outputPath = path.join(outputDir, `${originalName}-${timestamp}.pdf`);
            await documentGenerator.generatePDF(transcriptionResult, outputPath);
            mimeType = "application/pdf";
            downloadFileName = `${originalName}-transcription.pdf`;
          } else {
            // TXT формат
            outputPath = path.join(outputDir, `${originalName}-${timestamp}.txt`);
            let textContent = transcriptionResult.text;
            
            // Если есть сегменты, добавляем временные метки и спикеров
            if (transcriptionResult.segments && transcriptionResult.segments.length > 0) {
              const formatTime = (seconds: number): string => {
                const mins = Math.floor(seconds / 60);
                const secs = Math.floor(seconds % 60);
                return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
              };
              textContent = transcriptionResult.segments
                .map((seg) => {
                  const timeStr = `[${formatTime(seg.start)}]`;
                  const speakerStr = seg.speakerLabel ? `${seg.speakerLabel}: ` : "";
                  return `${speakerStr}${timeStr} ${seg.text}`;
                })
                .join("\n\n");
            }
            
            await fs.writeFile(outputPath, textContent, "utf-8");
            mimeType = "text/plain";
            downloadFileName = `${originalName}-transcription.txt`;
          }
        } catch (genError: any) {
          // Если ошибка связана с отсутствием пакетов, возвращаем понятное сообщение
          if (genError.message && (genError.message.includes("docx") || genError.message.includes("pdfkit"))) {
            return res.status(503).json({ 
              message: genError.message,
              available: false
            });
          }
          throw genError;
        }

        const relativePath = path.relative(process.cwd(), outputPath);
        const fileUrl = `/${relativePath.replace(/\\\\/g, "/")}`;

        // Получаем размер файла
        const stats = await fs.stat(outputPath);

        res.json({
          success: true,
          transcription: transcriptionResult.text,
          segments: transcriptionResult.segments,
          language: transcriptionResult.language || language,
          format: outputFormat,
          file: {
            url: fileUrl,
            name: downloadFileName,
            size: stats.size,
            mimeType,
          },
        });
      } catch (error: any) {
        console.error("[Transcription] Failed to transcribe:", error);
        res.status(500).json({ 
          message: "Failed to transcribe file",
          error: error.message 
        });
      }
    }
  );

  // Equipment Reservations
  app.get("/api/equipment-reservations", async (req, res) => {
    try {
      const { equipmentId } = req.query;
      let reservations;
      
      if (equipmentId) {
        reservations = await storage.getEquipmentReservationsByEquipment(equipmentId as string);
      } else {
        reservations = await storage.getEquipmentReservations();
      }
      
      res.json(reservations);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch equipment reservations" });
    }
  });

  app.post("/api/equipment-reservations", async (req, res) => {
    try {
      const reservationData = insertEquipmentReservationSchema.parse(req.body);
      
      // Check for conflicts
      const conflicts = await storage.checkEquipmentConflicts(
        reservationData.equipmentId!,
        new Date(reservationData.startTime),
        new Date(reservationData.endTime)
      );
      
      if (conflicts.length > 0) {
        return res.status(409).json({ 
          message: "Equipment is already reserved for this time period",
          conflicts 
        });
      }
      
      const reservation = await storage.createEquipmentReservation(reservationData);
      res.json(reservation);
    } catch (error) {
      res.status(400).json({ message: "Invalid reservation data" });
    }
  });

  // System Management
  app.post("/api/systems", async (req, res) => {
    try {
      const systemData = req.body;
      const system = await storage.createSystem(systemData);
      res.json(system);
    } catch (error) {
      res.status(400).json({ message: "Invalid system data" });
    }
  });

  app.delete("/api/systems/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteSystem(id);
      if (!deleted) {
        return res.status(404).json({ message: "System not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete system" });
    }
  });

  app.post("/api/systems/:id/ping", async (req, res) => {
    try {
      const { id } = req.params;
      const system = await storage.getSystemById(id);
      
      if (!system || !system.ipAddress) {
        return res.status(404).json({ message: "System not found or no IP address" });
      }

      const isOnline = await checkIP(system.ipAddress);
      const status = isOnline ? "online" : "offline";
      
      const updatedSystem = await storage.pingSystem(id, status);
      res.json({ system: updatedSystem, status });
    } catch (error) {
      res.status(500).json({ message: "Failed to ping system" });
    }
  });

  // Telegram Authentication
  app.post("/api/auth/telegram", async (req, res) => {
    try {
      const telegramData = insertTelegramUserSchema.parse(req.body);
      
      // Check if telegram user already exists
      let telegramUser = await storage.getTelegramUserByTelegramId(telegramData.telegramId);
      
      if (!telegramUser) {
        telegramUser = await storage.createTelegramUser(telegramData);
      }
      
      res.json(telegramUser);
    } catch (error) {
      res.status(400).json({ message: "Invalid telegram data" });
    }
  });

  app.post("/api/auth/telegram/link", async (req, res) => {
    try {
      const { telegramId, userId } = req.body;
      const telegramUser = await storage.linkTelegramUser(telegramId, userId);
      
      if (!telegramUser) {
        return res.status(404).json({ message: "Telegram user not found" });
      }
      
      res.json(telegramUser);
    } catch (error) {
      res.status(500).json({ message: "Failed to link telegram user" });
    }
  });

  // OBS Studio Integration
  app.get("/api/obs/connections", async (req, res) => {
    try {
      const connections = await storage.getObsConnections();
      res.json(connections);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch OBS connections" });
    }
  });

  app.post("/api/obs/connections", async (req, res) => {
    try {
      const obsData = insertObsConnectionSchema.parse(req.body);
      const connection = await storage.createObsConnection(obsData);
      res.json(connection);
    } catch (error) {
      res.status(400).json({ message: "Invalid OBS connection data" });
    }
  });

  app.put("/api/obs/connections/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const connection = await storage.updateObsConnection(id, req.body);
      if (!connection) {
        return res.status(404).json({ message: "OBS connection not found" });
      }
      res.json(connection);
    } catch (error) {
      res.status(500).json({ message: "Failed to update OBS connection" });
    }
  });

  app.delete("/api/obs/connections/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteObsConnection(id);
      if (!deleted) {
        return res.status(404).json({ message: "OBS connection not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete OBS connection" });
    }
  });

  // Analytics
  app.get("/api/analytics", async (req, res) => {
    try {
      const { entityType, startDate, endDate } = req.query;
      const events = await storage.getAnalyticsEvents(
        entityType as string,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );
      res.json(events);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  app.post("/api/analytics", async (req, res) => {
    try {
      const analyticsData = insertAnalyticsEventSchema.parse(req.body);
      const event = await storage.createAnalyticsEvent(analyticsData);
      res.json(event);
    } catch (error) {
      res.status(400).json({ message: "Invalid analytics data" });
    }
  });

  // ============= TASKS API =============
  app.get("/api/tasks", async (req, res) => {
    try {
      // Получаем информацию о текущем пользователе из заголовков (если есть)
      const userHeader = req.headers['x-user'] as string;
      const currentUser = userHeader ? JSON.parse(userHeader) : null;
      const userPermissions = (currentUser?.permissions || []) as string[];
      
      const { assigneeId, creatorId, status } = req.query;
      
      let tasks = await withDbTimeout(async () => {
        if (assigneeId) {
          return await storage.getTasksByAssignee(assigneeId as string);
        } else if (creatorId) {
          return await storage.getTasksByCreator(creatorId as string);
        } else if (status) {
          return await storage.getTasksByStatus(status as string);
        } else {
          return await storage.getTasks();
        }
      }, 3000, []); // 3 секунды для быстрого ответа
      
      // Фильтруем задачи по правам доступа
      if (currentUser && tasks) {
        // Если у пользователя нет прав на просмотр задач - возвращаем пустой массив
        if (!userPermissions.includes('tasks:view') && currentUser.role !== 'admin') {
          tasks = [];
        } else {
          // Фильтруем задачи: пользователь видит только свои задачи или задачи, назначенные на него
          // Админы видят все задачи
          if (currentUser.role !== 'admin') {
            tasks = tasks.filter((task: any) => {
              // Пользователь видит задачу, если:
              // 1. Он создатель задачи
              // 2. Он назначенный исполнитель
              // 3. У него есть права tasks:view_all (если такое разрешение будет добавлено)
              return task.creatorId === currentUser.id || 
                     task.assigneeId === currentUser.id ||
                     userPermissions.includes('tasks:view_all');
            });
          }
        }
      }
      
      res.json(tasks || []);
    } catch (error: any) {
      console.error("[Tasks API] Error fetching tasks:", error);
      // Возвращаем пустой массив вместо ошибки, чтобы UI не крашился
      res.status(500).json([]);
    }
  });

  app.get("/api/tasks/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const task = await storage.getTaskById(id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch task" });
    }
  });

  app.post("/api/tasks", async (req, res) => {
    try {
      console.log("[Tasks] Creating task...");
      const taskData = insertTaskSchema.parse(req.body);
      
      console.log("[Tasks] Saving to database...");
      // Убираем таймаут для создания задач - пусть работает нормально
      const task = await storage.createTask(taskData);
      
      if (!task) {
        throw new Error("Failed to create task");
      }
      
      // Create history entry (не блокируем, если не получится)
      try {
        await storage.createTaskHistory({
          taskId: task.id,
          userId: taskData.creatorId,
          action: "created",
          newValue: task
        });
      } catch (historyError) {
        console.warn("[Tasks] Failed to create history entry:", historyError);
        // Не прерываем создание задачи, если история не создалась
      }
      
      // Автоматическое создание события в календаре для задачи с дедлайном
      if (task.dueDate) {
        try {
          const dueDate = new Date(task.dueDate);
          const startTime = new Date(dueDate);
          startTime.setHours(9, 0, 0, 0); // Начало в 9:00
          const endTime = new Date(dueDate);
          endTime.setHours(18, 0, 0, 0); // Конец в 18:00
          
          // Проверяем, нет ли уже события для этой задачи
          const existingEvents = await storage.getEvents();
          const taskEventExists = existingEvents.some(e => 
            e.title === `Дедлайн: ${task.title}` && 
            new Date(e.startTime).toDateString() === dueDate.toDateString()
          );
          
          if (!taskEventExists) {
            await storage.createEvent({
              title: `Дедлайн: ${task.title}`,
              description: task.description || `Задача: ${task.title}`,
              startTime: startTime,
              endTime: endTime,
              location: "Офис",
              organizerId: taskData.creatorId,
              type: "meeting",
              status: "scheduled"
            });
            console.log("[Tasks] Calendar event created for task deadline:", task.id);
          }
        } catch (eventError) {
          console.warn("[Tasks] Failed to create calendar event:", eventError);
          // Не прерываем создание задачи, если событие не создалось
        }
      }
      
      console.log("[Tasks] Task created successfully:", task.id);
      res.json(task);
    } catch (error: any) {
      console.error("[Tasks] Error creating task:", error);
      const errorMessage = error.message || "Invalid task data";
      res.status(400).json({ 
        message: errorMessage,
        error: error.message 
      });
    }
  });

  app.put("/api/tasks/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const oldTask = await storage.getTaskById(id);
      if (!oldTask) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      // Extract userId from request body before updating
      const { userId, ...updateData } = req.body;
      
      const task = await storage.updateTask(id, updateData);
      
      // Create history entry
      if (userId) {
        try {
          await storage.createTaskHistory({
            taskId: id,
            userId: userId,
            action: "updated",
            oldValue: oldTask,
            newValue: task
          });
        } catch (historyError) {
          console.error("Error creating task history:", historyError);
          // Don't fail the update if history creation fails
        }
      }
      
      // Обновление/создание события в календаре для задачи с дедлайном
      if (task?.dueDate) {
        try {
          const dueDate = new Date(task.dueDate);
          const startTime = new Date(dueDate);
          startTime.setHours(9, 0, 0, 0);
          const endTime = new Date(dueDate);
          endTime.setHours(18, 0, 0, 0);
          
          const existingEvents = await storage.getEvents();
          const taskEvent = existingEvents.find(e => 
            e.title === `Дедлайн: ${task.title}` || 
            (e.title?.includes(`Дедлайн: ${oldTask.title}`) && oldTask.title === task.title)
          );
          
          if (taskEvent) {
            // Обновляем существующее событие
            await storage.updateEvent(taskEvent.id, {
              startTime: startTime,
              endTime: endTime,
              title: `Дедлайн: ${task.title}`,
              description: task.description || `Задача: ${task.title}`
            });
          } else {
            // Создаем новое событие
            await storage.createEvent({
              title: `Дедлайн: ${task.title}`,
              description: task.description || `Задача: ${task.title}`,
              startTime: startTime,
              endTime: endTime,
              location: "Офис",
              organizerId: task.creatorId,
              type: "meeting",
              status: "scheduled"
            });
          }
        } catch (eventError) {
          console.warn("[Tasks] Failed to update/create calendar event:", eventError);
        }
      } else if (oldTask?.dueDate && !task?.dueDate) {
        // Если дедлайн удален, удаляем событие из календаря
        try {
          const existingEvents = await storage.getEvents();
          const taskEvent = existingEvents.find(e => 
            e.title === `Дедлайн: ${task.title}` || 
            e.title === `Дедлайн: ${oldTask.title}`
          );
          if (taskEvent) {
            await storage.deleteEvent(taskEvent.id);
          }
        } catch (eventError) {
          console.warn("[Tasks] Failed to delete calendar event:", eventError);
        }
      }
      
      res.json(task);
    } catch (error) {
      console.error("Error updating task:", error);
      res.status(500).json({ message: "Failed to update task" });
    }
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteTask(id);
      if (!deleted) {
        return res.status(404).json({ message: "Task not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete task" });
    }
  });

  // Task Comments
  app.get("/api/tasks/:taskId/comments", async (req, res) => {
    try {
      const { taskId } = req.params;
      const comments = await storage.getTaskComments(taskId);
      res.json(comments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });

  app.post("/api/tasks/:taskId/comments", async (req, res) => {
    try {
      const { taskId } = req.params;
      const commentData = insertTaskCommentSchema.parse({ ...req.body, taskId });
      const comment = await storage.createTaskComment(commentData);
      res.json(comment);
    } catch (error) {
      res.status(400).json({ message: "Invalid comment data" });
    }
  });

  app.delete("/api/tasks/:taskId/comments/:commentId", async (req, res) => {
    try {
      const { commentId } = req.params;
      const deleted = await storage.deleteTaskComment(commentId);
      if (!deleted) {
        return res.status(404).json({ message: "Comment not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete comment" });
    }
  });

  // Task History
  app.get("/api/tasks/:taskId/history", async (req, res) => {
    try {
      const { taskId } = req.params;
      const history = await storage.getTaskHistory(taskId);
      res.json(history);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch task history" });
    }
  });

  // User Activity Logs (Admin only)
  app.get("/api/admin/user-logs", async (req, res) => {
    try {
      // Проверка аутентификации через заголовки или сессию
      // В будущем можно добавить middleware для проверки токена
      // Пока разрешаем доступ (в продакшене нужно добавить проверку токена и роли admin)

      const { userId, startDate, endDate, eventType, entityType } = req.query;
      
      let taskHistory: any[] = [];
      let analyticsEvents: any[] = [];

      // Получаем историю задач пользователя
      if (userId) {
        const allTasks = await storage.getTasks();
        const userTasks = allTasks.filter(t => t.creatorId === userId || t.assigneeId === userId);
        for (const task of userTasks) {
          const history = await storage.getTaskHistory(task.id);
          taskHistory.push(...history.filter(h => h.userId === userId));
        }
      } else {
        // Если userId не указан, получаем все логи
        const allTasks = await storage.getTasks();
        for (const task of allTasks) {
          const history = await storage.getTaskHistory(task.id);
          taskHistory.push(...history);
        }
      }

      // Получаем аналитические события
      const entityTypeFilter = entityType && entityType !== "all" ? entityType as string : undefined;
      analyticsEvents = await storage.getAnalyticsEvents(
        entityTypeFilter || "user", 
        startDate ? new Date(startDate as string) : undefined, 
        endDate ? new Date(endDate as string) : undefined
      );
      
      // Фильтруем по userId, если указан
      if (userId) {
        analyticsEvents = analyticsEvents.filter(e => e.data?.userId === userId);
      }
      
      // Фильтруем по eventType, если указан
      if (eventType && eventType !== "all") {
        analyticsEvents = analyticsEvents.filter(e => e.eventType === eventType);
      }

      // Объединяем и сортируем по дате
      const allLogs = [
        ...taskHistory.map(h => ({
          id: h.id,
          type: "task_history",
          userId: h.userId,
          action: h.action,
          description: `Задача: ${h.action}`,
          data: { taskId: h.taskId, oldValue: h.oldValue, newValue: h.newValue },
          timestamp: h.createdAt
        })),
        ...analyticsEvents.map(e => ({
          id: e.id,
          type: "analytics",
          userId: e.data?.userId,
          action: e.eventType,
          description: `${e.entityType}: ${e.eventType}`,
          data: e.data,
          timestamp: e.timestamp
        }))
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      res.json(allLogs);
    } catch (error: any) {
      console.error("Error fetching user logs:", error);
      res.status(500).json({ message: "Failed to fetch user logs", error: error.message });
    }
  });

  // ============= ROLES API =============
  app.get("/api/roles", async (req, res) => {
    try {
      const roles = await storage.getRoles();
      res.json(roles);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch roles" });
    }
  });

  app.get("/api/roles/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const role = await storage.getRoleById(id);
      if (!role) {
        return res.status(404).json({ message: "Role not found" });
      }
      res.json(role);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch role" });
    }
  });

  app.post("/api/roles", async (req, res) => {
    try {
      const roleData = insertRoleSchema.parse(req.body);
      const role = await storage.createRole(roleData);
      res.json(role);
    } catch (error) {
      res.status(400).json({ message: "Invalid role data" });
    }
  });

  app.put("/api/roles/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const existingRole = await storage.getRoleById(id);
      if (!existingRole) {
        return res.status(404).json({ message: "Role not found" });
      }
      if (existingRole.isSystem) {
        return res.status(403).json({ message: "Cannot modify system role" });
      }
      const role = await storage.updateRole(id, req.body);
      res.json(role);
    } catch (error) {
      res.status(500).json({ message: "Failed to update role" });
    }
  });

  app.delete("/api/roles/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const existingRole = await storage.getRoleById(id);
      if (!existingRole) {
        return res.status(404).json({ message: "Role not found" });
      }
      if (existingRole.isSystem) {
        return res.status(403).json({ message: "Cannot delete system role" });
      }
      await storage.deleteRole(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete role" });
    }
  });

  // ============= BARCODE SCANNER =============
  app.get("/api/equipment/barcode/:barcode", async (req, res) => {
    try {
      const { barcode } = req.params;
      const equipmentItem = await storage.getEquipmentByBarcode(barcode);
      if (!equipmentItem) {
        return res.status(404).json({ message: "Equipment not found with this barcode" });
      }
      res.json(equipmentItem);
    } catch (error) {
      res.status(500).json({ message: "Failed to find equipment" });
    }
  });

  // ============= TELEGRAM AUTH =============
  // Verify Telegram Login Widget data
  function verifyTelegramAuth(data: any, botToken: string): boolean {
    const { hash, ...authData } = data;
    const dataCheckString = Object.keys(authData)
      .sort()
      .map(key => `${key}=${authData[key]}`)
      .join('\n');
    
    const secretKey = crypto.createHash('sha256').update(botToken).digest();
    const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    
    return hmac === hash;
  }

  app.post("/api/auth/telegram/login", async (req, res) => {
    try {
      const telegramData = req.body;
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      
      // For development, skip verification if no bot token
      const isVerified = botToken ? verifyTelegramAuth(telegramData, botToken) : true;
      
      if (!isVerified) {
        return res.status(401).json({ message: "Invalid Telegram auth data" });
      }

      const telegramId = String(telegramData.id);
      
      // Check if user exists by telegram ID
      let user = await storage.getUserByTelegramId(telegramId);
      
      if (!user) {
        // Check if telegram user record exists
        let telegramUser = await storage.getTelegramUserByTelegramId(telegramId);
        
        if (!telegramUser) {
          // Create telegram user record
          telegramUser = await storage.createTelegramUser({
            telegramId,
            username: telegramData.username,
            firstName: telegramData.first_name,
            lastName: telegramData.last_name,
            photoUrl: telegramData.photo_url,
            authDate: new Date(telegramData.auth_date * 1000)
          });
        } else {
          // Update telegram user record
          await storage.updateTelegramUser(telegramId, {
            username: telegramData.username,
            firstName: telegramData.first_name,
            lastName: telegramData.last_name,
            photoUrl: telegramData.photo_url,
            authDate: new Date(telegramData.auth_date * 1000)
          });
        }

        // Create a new user account
        const name = [telegramData.first_name, telegramData.last_name].filter(Boolean).join(' ');
        user = await storage.createUser({
          username: telegramData.username || `tg_${telegramId}`,
          password: crypto.randomBytes(32).toString('hex'), // Random password for Telegram users
          name: name || `Telegram User ${telegramId}`,
          telegramId,
          avatar: telegramData.photo_url,
          role: 'employee',
          active: true
        });

        // Link telegram user to the new user
        await storage.linkTelegramUser(telegramId, user.id);
      } else {
        // Update last login
        await storage.updateUser(user.id, { lastLogin: new Date() });
      }

      res.json({ 
        user: { 
          id: user.id, 
          username: user.username, 
          name: user.name, 
          role: user.role,
          avatar: user.avatar,
          permissions: user.permissions
        } 
      });
    } catch (error) {
      console.error("Telegram auth error:", error);
      res.status(500).json({ message: "Failed to authenticate with Telegram" });
    }
  });

  // Get telegram users for admin
  app.get("/api/telegram-users", async (req, res) => {
    try {
      const users = await storage.getUsers();
      const telegramUsers = users.filter(u => u.telegramId);
      res.json(telegramUsers);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch telegram users" });
    }
  });

  // ============= TELEGRAM GATEWAY AUTH =============
  // Хранилище активных кодов авторизации (в production лучше использовать Redis)
  const authCodes = new Map<string, {
    code: string;
    telegramId: string; // Номер телефона
    chatId: string; // Номер телефона
    expiresAt: number;
    hash: string;
  }>();

  // Очистка истекших кодов каждые 5 минут
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of authCodes.entries()) {
      if (value.expiresAt < now) {
        authCodes.delete(key);
      }
    }
  }, 5 * 60 * 1000);

  /**
   * Запрос кода авторизации через Telegram
   * Пользователь отправляет /start или /login боту, бот отправляет код
   * Затем пользователь вводит код на сайте
   */
  app.post("/api/auth/telegram/request-code", async (req, res) => {
    try {
      const { telegramId, chatId } = req.body;

      if (!telegramId || !chatId) {
        return res.status(400).json({ message: "Telegram ID и Chat ID обязательны" });
      }

      if (!telegramBot.isConfigured()) {
        return res.status(503).json({ 
          message: "Telegram бот не настроен. Добавьте TELEGRAM_BOT_TOKEN в .env" 
        });
      }

      // Получаем информацию о пользователе
      const userInfo = await telegramBot.getUserInfo(chatId);
      if (!userInfo) {
        return res.status(404).json({ message: "Пользователь не найден в Telegram" });
      }

      // Генерируем код
      const code = telegramBot.generateAuthCode();
      const timestamp = Date.now();
      const expiresAt = timestamp + 10 * 60 * 1000; // 10 минут
      const hash = telegramBot.createCodeHash(code, telegramId, timestamp);

      // Сохраняем код
      const codeKey = `${telegramId}:${timestamp}`;
      authCodes.set(codeKey, {
        code,
        telegramId,
        chatId: String(chatId),
        username: userInfo.username,
        firstName: userInfo.first_name,
        lastName: userInfo.last_name,
        photoUrl: userInfo.photo_url,
        expiresAt,
        hash,
      });

      // Отправляем код пользователю через бота
      const message = `🔐 Код авторизации для StreamDesk:\n\n` +
        `\`${code}\`\n\n` +
        `Введите этот код на сайте для входа.\n` +
        `Код действителен 10 минут.`;

      const sent = await telegramBot.sendMessage(chatId, message, {
        parse_mode: "Markdown",
      });

      if (!sent) {
        return res.status(500).json({ message: "Не удалось отправить код через Telegram" });
      }

      // Возвращаем только timestamp для безопасности
      res.json({
        success: true,
        timestamp,
        message: "Код отправлен в Telegram",
      });
    } catch (error: any) {
      console.error("[Telegram Gateway] Error requesting code:", error);
      res.status(500).json({ message: "Ошибка при запросе кода авторизации" });
    }
  });

  /**
   * Проверка кода авторизации
   */
  app.post("/api/auth/telegram/verify-code", async (req, res) => {
    try {
      const { code, phoneNumber, timestamp } = req.body;

      if (!code || !phoneNumber || !timestamp) {
        return res.status(400).json({ message: "Код, номер телефона и timestamp обязательны" });
      }

      // Ищем код
      const codeKey = `${phoneNumber}:${timestamp}`;
      const codeData = authCodes.get(codeKey);

      if (!codeData) {
        return res.status(404).json({ message: "Код не найден или истек" });
      }

      // Проверяем срок действия
      if (codeData.expiresAt < Date.now()) {
        authCodes.delete(codeKey);
        return res.status(410).json({ message: "Код истек" });
      }

      // Проверяем код
      if (codeData.code !== code) {
        return res.status(401).json({ message: "Неверный код" });
      }

      // Удаляем использованный код
      authCodes.delete(codeKey);

      // Проверяем или создаем пользователя по номеру телефона
      // Ищем пользователя по телефону (если есть поле phone в схеме)
      let user = await storage.getUserByTelegramId(phoneNumber);
      
      // Если не нашли по telegramId, ищем по телефону
      if (!user) {
        const allUsers = await storage.getUsers();
        user = allUsers.find((u: any) => u.phone === phoneNumber || u.telegramId === phoneNumber);
      }

      if (!user) {
        // Создаем нового пользователя
        const name = `Пользователь ${phoneNumber.slice(-4)}`; // Последние 4 цифры номера

        user = await storage.createUser({
          username: `phone_${phoneNumber.replace(/\D/g, "")}`,
          password: crypto.randomBytes(32).toString("hex"), // Случайный пароль
          name,
          phone: phoneNumber,
          telegramId: phoneNumber, // Сохраняем номер как telegramId для совместимости
          role: "employee",
          active: true,
        });

        // Создаем запись telegram user
        await storage.createTelegramUser({
          telegramId: phoneNumber,
          authDate: new Date(),
        });

        // Связываем
        await storage.linkTelegramUser(phoneNumber, user.id);
      } else {
        // Обновляем последний вход
        await storage.updateUser(user.id, { lastLogin: new Date() });
      }

      res.json({
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          avatar: user.avatar,
          permissions: user.permissions,
        },
      });
    } catch (error: any) {
      console.error("[Telegram Gateway] Error verifying code:", error);
      res.status(500).json({ message: "Ошибка при проверке кода" });
    }
  });

  // ============= USERS MANAGEMENT =============
  app.get("/api/users", async (req, res) => {
    const users = await withDbTimeout(() => storage.getUsers(), 3000, []);
    res.json(users.map((u: any) => ({ ...u, password: undefined })));
  });

  app.get("/api/users/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ ...user, password: undefined });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.post("/api/users", async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const user = await storage.createUser(userData);
      res.json({ ...user, password: undefined });
    } catch (error) {
      res.status(400).json({ message: "Invalid user data" });
    }
  });

  app.put("/api/users/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { password, ...userData } = req.body;
      const user = await storage.updateUser(id, userData);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ ...user, password: undefined });
    } catch (error) {
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  app.delete("/api/users/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteUser(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // Update user role and permissions
  app.put("/api/users/:id/permissions", async (req, res) => {
    try {
      const { id } = req.params;
      const { role, permissions } = req.body;
      const user = await storage.updateUser(id, { role, permissions });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ ...user, password: undefined });
    } catch (error) {
      res.status(500).json({ message: "Failed to update user permissions" });
    }
  });

  // Computers
  app.get("/api/computers", async (req, res) => {
    const computers = await withDbTimeout(() => storage.getComputers(), 3000, []);
    res.json(computers);
  });

  app.post("/api/computers", async (req, res) => {
    try {
      const computer = await storage.createComputer(req.body);
      res.status(201).json(computer);
    } catch (error) {
      res.status(500).json({ message: "Failed to create computer" });
    }
  });

  app.put("/api/computers/:id", async (req, res) => {
    try {
      const computer = await storage.updateComputer(req.params.id, req.body);
      if (!computer) {
        return res.status(404).json({ message: "Computer not found" });
      }
      res.json(computer);
    } catch (error) {
      res.status(500).json({ message: "Failed to update computer" });
    }
  });

  app.delete("/api/computers/:id", async (req, res) => {
    try {
      await storage.deleteComputer(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete computer" });
    }
  });

  // Projects
  app.get("/api/projects", async (req, res) => {
    const projects = await withDbTimeout(
      () => storage.getProjects(),
      3000, // 3 секунды для быстрого ответа
      [] // Пустой массив по умолчанию
    );
    
    res.json(projects);
  });

  app.post("/api/projects", async (req, res) => {
    try {
      const { deadline, ...rest } = req.body;
      const projectData = {
        ...rest,
        deadline: deadline && deadline !== "" ? new Date(deadline) : null,
      };
      const project = await storage.createProject(projectData);
      res.status(201).json(project);
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  app.put("/api/projects/:id", async (req, res) => {
    try {
      const project = await storage.updateProject(req.params.id, req.body);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      res.status(500).json({ message: "Failed to update project" });
    }
  });

  app.delete("/api/projects/:id", async (req, res) => {
    try {
      await storage.deleteProject(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete project" });
    }
  });

  // Project Columns
  app.get("/api/projects/:projectId/columns", async (req, res) => {
    const columns = await withDbTimeout(
      () => storage.getProjectColumns(req.params.projectId),
      3000,
      []
    );
    res.json(columns);
  });

  app.post("/api/projects/:projectId/columns", async (req, res) => {
    try {
      const { projectId } = req.params;
      const { name, color } = req.body;
      
      // Получаем текущие столбцы для определения следующего order
      const existingColumns = await storage.getProjectColumns(projectId);
      const nextOrder = existingColumns.length;
      
      const column = await storage.createProjectColumn({
        projectId,
        name,
        color: color || null,
        order: nextOrder,
      });
      
      res.status(201).json(column);
    } catch (error) {
      console.error("Error creating project column:", error);
      res.status(500).json({ message: "Failed to create column" });
    }
  });

  app.put("/api/projects/:projectId/columns/:id", async (req, res) => {
    try {
      const column = await storage.updateProjectColumn(req.params.id, req.body);
      if (!column) {
        return res.status(404).json({ message: "Column not found" });
      }
      res.json(column);
    } catch (error) {
      res.status(500).json({ message: "Failed to update column" });
    }
  });

  app.delete("/api/projects/:projectId/columns/:id", async (req, res) => {
    try {
      await storage.deleteProjectColumn(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete column" });
    }
  });

  app.post("/api/projects/:projectId/columns/reorder", async (req, res) => {
    try {
      const { projectId } = req.params;
      const { columnIds } = req.body;
      
      if (!Array.isArray(columnIds)) {
        return res.status(400).json({ message: "columnIds must be an array" });
      }
      
      await storage.reorderProjectColumns(projectId, columnIds);
      res.json({ success: true });
    } catch (error) {
      console.error("Error reordering columns:", error);
      res.status(500).json({ message: "Failed to reorder columns" });
    }
  });

  // Custom Locations
  app.get("/api/locations", async (req, res) => {
    try {
      const locations = await storage.getCustomLocations();
      res.json(locations);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch locations" });
    }
  });

  app.post("/api/locations", async (req, res) => {
    try {
      const location = await storage.createCustomLocation(req.body);
      res.status(201).json(location);
    } catch (error) {
      res.status(500).json({ message: "Failed to create location" });
    }
  });

  app.delete("/api/locations/:id", async (req, res) => {
    try {
      await storage.deleteCustomLocation(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete location" });
    }
  });

  // Repositories
  app.get("/api/repositories", async (req, res) => {
    try {
      const repositories = await storage.getRepositories();
      res.json(repositories);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch repositories" });
    }
  });

  app.post("/api/repositories", async (req, res) => {
    try {
      const currentUser = JSON.parse(req.headers['x-user'] as string || '{}');
      if (currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Только администратор может создавать репозитории" });
      }
      const repository = await storage.createRepository(req.body);
      res.status(201).json(repository);
    } catch (error) {
      res.status(500).json({ message: "Failed to create repository" });
    }
  });

  app.put("/api/repositories/:id", async (req, res) => {
    try {
      const currentUser = JSON.parse(req.headers['x-user'] as string || '{}');
      if (currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Только администратор может редактировать репозитории" });
      }
      const repository = await storage.updateRepository(req.params.id, req.body);
      if (!repository) {
        return res.status(404).json({ message: "Repository not found" });
      }
      res.json(repository);
    } catch (error) {
      res.status(500).json({ message: "Failed to update repository" });
    }
  });

  app.delete("/api/repositories/:id", async (req, res) => {
    try {
      const currentUser = JSON.parse(req.headers['x-user'] as string || '{}');
      if (currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Только администратор может удалять репозитории" });
      }
      await storage.deleteRepository(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete repository" });
    }
  });

  const httpServer = createServer(app);

  // WebSocket server for real-time updates
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    console.log('[WebSocket] Client connected');

    // Send initial data
    try {
      ws.send(JSON.stringify({ type: 'connected', message: 'WebSocket connected' }));
    } catch (error) {
      console.error('[WebSocket] Error sending initial message:', error);
    }

    // Simulate real-time updates with error handling
    const interval = setInterval(async () => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          // Send system status updates (with timeout protection)
          const systems = await withDbTimeout(
            () => storage.getSystems(),
            5000, // 5 секунд таймаут для WebSocket обновлений
            []
          );
          ws.send(JSON.stringify({ 
            type: 'systems_update', 
            data: systems 
          }));

          // Send stream stats updates (with timeout protection)
          const streams = await withDbTimeout(
            () => storage.getActiveStreams(),
            5000,
            []
          );
          ws.send(JSON.stringify({ 
            type: 'streams_update', 
            data: streams 
          }));

          // Send mock YouTube stats (не требует БД, всегда работает)
          const youtubeStats = {
            viewers: Math.floor(Math.random() * 2000) + 500,
            bitrate: Math.floor(Math.random() * 1000) + 5000,
            fps: 60
          };
          ws.send(JSON.stringify({ 
            type: 'youtube_stats', 
            data: youtubeStats 
          }));

          // Send mock VK stats (не требует БД, всегда работает)
          const vkStats = {
            viewers: Math.floor(Math.random() * 1500) + 300,
            bitrate: Math.floor(Math.random() * 800) + 5000,
            fps: 60
          };
          ws.send(JSON.stringify({ 
            type: 'vk_stats', 
            data: vkStats 
          }));

        } catch (error) {
          // Логируем ошибку, но не прерываем соединение
          console.warn('[WebSocket] Error sending update (continuing):', error);
          // Отправляем пустые данные вместо падения
          try {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ 
                type: 'systems_update', 
                data: [] 
              }));
              ws.send(JSON.stringify({ 
                type: 'streams_update', 
                data: [] 
              }));
            }
          } catch (sendError) {
            console.error('[WebSocket] Error sending fallback data:', sendError);
          }
        }
      }
    }, 10000); // Update every 10 seconds

    ws.on('close', (code, reason) => {
      console.log(`[WebSocket] Client disconnected (code: ${code}, reason: ${reason || 'none'})`);
      clearInterval(interval);
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] Connection error:', error);
      clearInterval(interval);
    });

    // Ping для поддержания соединения
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.ping();
        } catch (error) {
          console.error('[WebSocket] Ping error:', error);
          clearInterval(pingInterval);
        }
      } else {
        clearInterval(pingInterval);
      }
    }, 30000); // Ping каждые 30 секунд

    ws.on('close', () => {
      clearInterval(pingInterval);
    });
  });

  // Push notification subscription routes
  app.post("/api/push/subscribe", async (req, res) => {
    try {
      const { endpoint, keys } = req.body;
      // In production, save subscription to database with user ID
      // For now, just acknowledge
      console.log("Push subscription received:", endpoint);
      res.json({ success: true, message: "Subscription saved" });
    } catch (error) {
      res.status(500).json({ message: "Failed to save subscription" });
    }
  });

  app.post("/api/push/unsubscribe", async (req, res) => {
    try {
      const { endpoint } = req.body;
      // In production, remove subscription from database
      console.log("Push unsubscription received:", endpoint);
      res.json({ success: true, message: "Subscription removed" });
    } catch (error) {
      res.status(500).json({ message: "Failed to remove subscription" });
    }
  });

  // Connection Schemas API
  app.get("/api/connection-schemas", async (req, res) => {
    try {
      const schemas = await storage.getConnectionSchemas();
      res.json(schemas);
    } catch (error: any) {
      console.error("Connection schemas error:", error);
      res.status(500).json({
        message: error.message || "Failed to fetch connection schemas",
      });
    }
  });

  app.get("/api/connection-schemas/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const schema = await storage.getConnectionSchemaById(id);
      
      if (!schema) {
        return res.status(404).json({ message: "Schema not found" });
      }

      const components = await storage.getConnectionSchemaComponents(id);
      res.json({ ...schema, components });
    } catch (error: any) {
      console.error("Connection schema error:", error);
      res.status(500).json({
        message: error.message || "Failed to fetch connection schema",
      });
    }
  });

  app.post("/api/connection-schemas", async (req, res) => {
    try {
      const { name, description } = req.body;

      if (!name) {
        return res.status(400).json({ message: "Name is required" });
      }

      const schema = await storage.createConnectionSchema({
        name,
        description: description || null,
      });

      res.json(schema);
    } catch (error: any) {
      console.error("Create connection schema error:", error);
      const errorMessage = error.message || "Failed to create connection schema";
      
      // Проверяем, не является ли ошибка связанной с отсутствием таблицы
      if (errorMessage.includes("does not exist") || errorMessage.includes("relation") || errorMessage.includes("table")) {
        return res.status(500).json({
          message: "Таблицы для схем подключения не созданы. Выполните SQL скрипт create_connection_schemas_tables.sql в вашей базе данных.",
          error: errorMessage,
        });
      }
      
      res.status(500).json({
        message: errorMessage,
      });
    }
  });

  app.put("/api/connection-schemas/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description } = req.body;

      const updateData: any = {};
      if (name) updateData.name = name;
      if (description !== undefined) updateData.description = description;

      const updatedSchema = await storage.updateConnectionSchema(id, updateData);
      
      if (!updatedSchema) {
        return res.status(404).json({ message: "Schema not found" });
      }

      res.json(updatedSchema);
    } catch (error: any) {
      console.error("Update connection schema error:", error);
      res.status(500).json({
        message: error.message || "Failed to update connection schema",
      });
    }
  });

  app.delete("/api/connection-schemas/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteConnectionSchema(id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Schema not found" });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete connection schema error:", error);
      res.status(500).json({
        message: error.message || "Failed to delete connection schema",
      });
    }
  });

  // Connection Schema Components API
  app.post("/api/connection-schemas/:schemaId/components", async (req, res) => {
    try {
      const { schemaId } = req.params;
      const { type, name, position, properties, connections } = req.body;

      if (!type || !name) {
        return res.status(400).json({ message: "Type and name are required" });
      }

      const component = await storage.createConnectionSchemaComponent({
        schemaId,
        type,
        name,
        position: position || { x: 0, y: 0 },
        properties: properties || {},
        connections: connections || [],
      });

      res.json(component);
    } catch (error: any) {
      console.error("Create component error:", error);
      const errorMessage = error.message || "Failed to create component";
      
      // Проверяем, не является ли ошибка связанной с отсутствием таблицы
      if (errorMessage.includes("does not exist") || errorMessage.includes("relation") || errorMessage.includes("table")) {
        return res.status(500).json({
          message: "Таблицы для схем подключения не созданы. Выполните SQL скрипт create_connection_schemas_tables.sql в вашей базе данных.",
          error: errorMessage,
        });
      }
      
      res.status(500).json({
        message: errorMessage,
      });
    }
  });

  app.put("/api/connection-schemas/components/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { type, name, position, properties, connections } = req.body;

      const updateData: any = {};
      if (type) updateData.type = type;
      if (name) updateData.name = name;
      if (position) updateData.position = position;
      if (properties) updateData.properties = properties;
      if (connections) updateData.connections = connections;

      const updatedComponent = await storage.updateConnectionSchemaComponent(id, updateData);
      
      if (!updatedComponent) {
        return res.status(404).json({ message: "Component not found" });
      }

      res.json(updatedComponent);
    } catch (error: any) {
      console.error("Update component error:", error);
      res.status(500).json({
        message: error.message || "Failed to update component",
      });
    }
  });

  app.delete("/api/connection-schemas/components/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteConnectionSchemaComponent(id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Component not found" });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete component error:", error);
      res.status(500).json({
        message: error.message || "Failed to delete component",
      });
    }
  });

  // Equipment search API (for connection schemas)
  app.post("/api/equipment/search", async (req, res) => {
    try {
      const { query } = req.body;
      
      if (!query || typeof query !== "string") {
        return res.status(400).json({ message: "Query is required" });
      }

      // Базовая логика парсинга оборудования из названия
      // В будущем здесь можно интегрировать реальный API поиска
      const queryLower = query.toLowerCase();
      
      // Определяем тип оборудования
      let type = "computer";
      if (queryLower.includes("камера") || queryLower.includes("camera")) type = "camera";
      else if (queryLower.includes("микрофон") || queryLower.includes("mic")) type = "mic";
      else if (queryLower.includes("микшер") || queryLower.includes("mixer")) type = "audio";
      else if (queryLower.includes("роутер") || queryLower.includes("router") || queryLower.includes("switch")) type = "network";
      else if (queryLower.includes("монитор") || queryLower.includes("monitor") || queryLower.includes("телевизор") || queryLower.includes("tv")) type = "display";

      // Парсим производителя и модель
      const parts = query.split(/\s+/);
      let manufacturer = "";
      let model = "";
      
      const manufacturers = ["Sony", "Canon", "Panasonic", "Blackmagic", "ATEM", "Elgato", "Behringer", "TP-Link", "D-Link", "LG", "Samsung", "OTIS"];
      for (const part of parts) {
        const found = manufacturers.find(m => part.toLowerCase().includes(m.toLowerCase()));
        if (found) {
          manufacturer = found;
          const modelIndex = parts.indexOf(part);
          if (modelIndex < parts.length - 1) {
            model = parts.slice(modelIndex + 1).join(" ");
          }
          break;
        }
      }

      // Определяем порты на основе типа
      const portsIn: any[] = [];
      const portsOut: any[] = [];

      if (type === "camera") {
        portsOut.push({ id: "1", name: "HDMI", type: "out", portType: "HDMI" });
        portsOut.push({ id: "2", name: "SDI", type: "out", portType: "SDI" });
        portsIn.push({ id: "1", name: "DC", type: "in", portType: "DC" });
      } else if (type === "computer") {
        portsOut.push({ id: "1", name: "HDMI", type: "out", portType: "HDMI" });
        portsOut.push({ id: "2", name: "USB", type: "out", portType: "USB" });
        portsIn.push({ id: "1", name: "ETH", type: "in", portType: "ETH" });
        portsIn.push({ id: "2", name: "USB", type: "in", portType: "USB" });
      } else if (type === "network") {
        for (let i = 1; i <= 8; i++) {
          portsIn.push({ id: `in${i}`, name: `LAN${i}`, type: "in", portType: "LAN" });
        }
        portsIn.push({ id: "power", name: "DC", type: "in", portType: "DC" });
      } else if (type === "display") {
        portsIn.push({ id: "1", name: "HDMI1", type: "in", portType: "HDMI" });
        portsIn.push({ id: "2", name: "HDMI2", type: "in", portType: "HDMI" });
        portsIn.push({ id: "3", name: "USB", type: "in", portType: "USB" });
      }

      const result = {
        name: query.trim(),
        manufacturer: manufacturer || undefined,
        model: model || undefined,
        type,
        portsIn,
        portsOut,
        specifications: {},
      };

      res.json({ results: [result] });
    } catch (error: any) {
      console.error("Equipment search error:", error);
      res.status(500).json({
        message: error.message || "Failed to search equipment",
      });
    }
  });

  return httpServer;
}
