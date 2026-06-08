import express, { type Express } from "express";
import { createServer as createHttpServer, type Server } from "http";
import { createServer as createHttpsServer } from "https";
import fs from "fs";
import { WebSocketServer, WebSocket } from "ws";
import { storage, isStubStorage } from "./database";
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
import session from "express-session";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { telegramBot } from "./services/telegram-bot";
import { hashPassword, verifyPassword, isPasswordHashed } from "./auth";
import { getTerminalLogs } from "./terminal-log";
import { getTerminalAllowedRoles, setTerminalAllowedRoles, canViewTerminal } from "./terminal-access";

/** Парсит заголовок x-user: поддерживает JSON и Base64 (для кириллицы в имени). */
function parseUserHeader(header: string | undefined): Record<string, unknown> {
  if (!header || typeof header !== "string") return {};
  try {
    const raw = header.trim();
    if (raw.startsWith("{")) return JSON.parse(raw) as Record<string, unknown>;
    const decoded = Buffer.from(raw, "base64").toString("utf-8");
    return (decoded ? JSON.parse(decoded) : {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}
import { telegramGateway } from "./services/telegram-gateway";

function isHttpsRequest(req: any): boolean {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const forwardedSsl = String(req.headers["x-forwarded-ssl"] || "").toLowerCase();
  const urlScheme = String(req.headers["x-url-scheme"] || "").toLowerCase();
  const cfVisitor = String(req.headers["cf-visitor"] || "").toLowerCase();
  const origin = String(req.headers.origin || "").toLowerCase();
  const referer = String(req.headers.referer || "").toLowerCase();

  return Boolean(
    req.secure ||
    forwardedProto === "https" ||
    forwardedSsl === "on" ||
    urlScheme === "https" ||
    cfVisitor.includes('"scheme":"https"') ||
    origin.startsWith("https://") ||
    referer.startsWith("https://")
  );
}

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

      const safePodcast = podcast.replace(/[^\p{L}0-9_\- ]/gu, "_");
      const safeRelativePath = relativePath.replace(/(\.\.[/\\])/g, "").replace(/[^\p{L}0-9_\-/\\ ]/gu, "_");

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
      const base = path.basename(originalName, ext).replace(/[^\p{L}0-9_\- ]/gu, "_");
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
      const base = path.basename(originalName, ext).replace(/[^\p{L}0-9_\- ]/gu, "_");
      cb(null, base + "-" + uniqueSuffix + ext);
    },
  }),
  // Без ограничений по размеру и типу файлов
});

const estimateUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// Multer для фото участников продакшн (продакшн / шоу)
const productionPhotoUpload = multer({
  storage: multer.diskStorage({
    destination: async (req, file, cb) => {
      const uploadDir = path.join(process.cwd(), "uploads", "production");
      try {
        await fs.mkdir(uploadDir, { recursive: true });
      } catch (error) {
        console.error("Error creating production upload directory:", error);
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, "photo-" + uniqueSuffix + path.extname(file.originalname || ".jpg"));
    },
  }),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Multer для аватара пользователя
const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: async (req, file, cb) => {
      const uploadDir = path.join(process.cwd(), "uploads", "avatars");
      try {
        await fs.mkdir(uploadDir, { recursive: true });
      } catch (error) {
        console.error("Error creating avatars directory:", error);
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const userId = (req as any).params?.id || "user";
      const ext = (path.extname(file.originalname || "") || ".jpg").toLowerCase();
      cb(null, userId + "-" + Date.now() + ext);
    },
  }),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
  limits: { fileSize: 2 * 1024 * 1024 },
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
  // За прокси (nginx, cloud) — доверяем X-Forwarded-Proto для определения HTTPS
  app.set("trust proxy", 1);

  // Заголовки безопасности (XSS, clickjacking, MIME sniffing и т.д.)
  app.use(helmet({ contentSecurityPolicy: false })); // CSP можно включить после настройки под фронт

  // HSTS: в production при HTTPS браузер всегда ходит по HTTPS (защита от перехвата логина/пароля)
  app.use((req, res, next) => {
    const isSecure = isHttpsRequest(req);
    if (isSecure && process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    }
    next();
  });

  // В production логин/пароль принимаем только по HTTPS (иначе их видно в Wireshark и т.п.)
  app.use("/api/auth/login", (req, res, next) => {
    if (process.env.NODE_ENV !== "production") return next();
    const isSecure = isHttpsRequest(req);
    if (!isSecure) {
      return res.status(403).json({
        message: "Вход по паролю разрешён только по HTTPS. Используйте https:// в адресе сайта.",
      });
    }
    next();
  });

  // Лимит попыток входа (защита от перебора паролей)
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { message: "Слишком много попыток входа. Попробуйте через 15 минут." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Сессии: только сервер знает, кто вошёл; клиент не может подделать пользователя
  const sessionSecret = process.env.SESSION_SECRET || (process.env.NODE_ENV === "production" ? "" : "dev-secret-change-me");
  if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    console.warn("[Security] В production задайте SESSION_SECRET в .env");
  }
  app.use(
    session({
      secret: sessionSecret || "fallback-not-secure",
      resave: false,
      saveUninitialized: false,
      name: "streamdesk.sid",
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production" ? "auto" : false,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    })
  );

  // Для /api заполняем req.user из сессии (не доверяем заголовок x-user для авторизации)
  app.use("/api", async (req, res, next) => {
    const sid = req.session?.userId;
    if (sid === "admin-fallback") {
      req.user = {
        id: "admin-fallback",
        username: process.env.ADMIN_USERNAME || "admin",
        name: "Администратор",
        email: null,
        phone: null,
        position: null,
        department: null,
        role: "admin",
        permissions: ["admin:panel", "users:manage", "roles:manage", "tasks:view", "tasks:create", "tasks:edit", "tasks:delete", "tasks:assign", "equipment:view", "equipment:create", "equipment:edit", "equipment:delete", "equipment:reserve", "events:view", "events:create", "events:edit", "events:delete", "streams:view", "streams:manage", "systems:view", "systems:manage", "settings:manage"],
        telegramId: null,
        avatar: null,
        active: true,
        lastLogin: null,
        createdAt: new Date(),
      } as any;
    } else if (sid) {
      try {
        const user = await storage.getUser(sid);
        req.user = user ?? null;
      } catch {
        req.user = null;
      }
    } else {
      req.user = null;
    }
    next();
  });

  // Режим заглушки: фронт может показать баннер «данные не сохраняются»
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, stubMode: isStubStorage });
  });

  const inviteOrigin = (req: any) => {
    const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
    const protocol = forwardedProto || (isHttpsRequest(req) ? "https" : req.protocol || "http");
    return `${protocol}://${req.get("host")}`;
  };

  const canManageCompany = async (user: any, companyId: string) => {
    if (!user?.id || !companyId) return false;
    if (user.role === "admin") return true;
    const membership = await storage.getCompanyMembershipByUser(companyId, user.id).catch(() => undefined);
    return Boolean(membership && membership.status === "active" && ["owner", "admin"].includes(membership.role));
  };

  const hasWorkspaceAccess = async (user: any) => {
    if (!user?.id) return false;
    if (user.role === "admin") return true;
    const memberships = await storage.getUserCompanyMemberships(user.id).catch(() => []);
    return (memberships as any[]).some((membership) => membership.status === "active");
  };

  const getUserCompanyIds = async (user: any) => {
    if (!user?.id) return [];
    if (user.role === "admin") {
      const companies = await storage.getCompanies().catch(() => []);
      return (companies as any[]).map((company) => String(company.id));
    }
    const memberships = await storage.getUserCompanyMemberships(user.id).catch(() => []);
    return (memberships as any[])
      .filter((membership) => membership.status === "active")
      .map((membership) => String(membership.companyId));
  };

  const ensureCompanyWorkspaceKey = async (companyId: string) => {
    const company = await storage.getCompanyById(companyId).catch(() => undefined);
    if (!company) return "";
    const settings = company.settings && typeof company.settings === "object" ? company.settings as any : {};
    const monitoring = settings.monitoring && typeof settings.monitoring === "object" ? settings.monitoring : {};
    const current = String(monitoring.workspaceKey || "").trim();
    if (current) return current;
    const workspaceKey = `sd_${crypto.randomBytes(18).toString("hex")}`;
    await storage.updateCompany(companyId, {
      settings: {
        ...settings,
        monitoring: {
          ...monitoring,
          enabled: true,
          workspaceKey,
        },
      },
    } as any).catch(() => undefined);
    return workspaceKey;
  };

  const psString = (value: unknown) => String(value ?? "").replace(/'/g, "''");

  const equipmentInventoryPrefix = (type: unknown) => {
    const normalized = String(type || "").trim().toLowerCase();
    if (/camera|камера/.test(normalized)) return "cam";
    if (/microphone|mic|микрофон/.test(normalized)) return "mic";
    if (/lighting|light|свет/.test(normalized)) return "lgt";
    if (/computer|комп/.test(normalized)) return "pc";
    if (/server|сервер/.test(normalized)) return "srv";
    if (/display|monitor|экран|монитор/.test(normalized)) return "dsp";
    if (/audio|звук/.test(normalized)) return "aud";
    if (/video|видео/.test(normalized)) return "vid";
    if (/network|lan|сеть/.test(normalized)) return "net";
    return "eqp";
  };

  const generateEquipmentInventoryNumber = async (type: unknown) => {
    const prefix = equipmentInventoryPrefix(type);
    const items = await storage.getEquipment().catch(() => []);
    const used = new Set((items as any[]).map((item) => String(item.inventoryNumber || "").toLowerCase()));
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = `${prefix}_${String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0")}`;
      if (!used.has(candidate.toLowerCase())) return candidate;
    }
    return `${prefix}_${Date.now().toString().slice(-6)}`;
  };

  const requirePlatformAdmin = (req: any, res: any) => {
    const user = req.user as any;
    const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
    if (!user?.id || (user.role !== "admin" && !permissions.includes("platform:admin"))) {
      res.status(403).json({ message: "Доступно только владельцу платформы" });
      return null;
    }
    return user;
  };

  app.get("/api/companies/me", async (req, res) => {
    try {
      const currentUser = req.user as any;
      if (!currentUser?.id) return res.status(401).json({ message: "Требуется авторизация" });
      const origin = inviteOrigin(req);
      const memberships = await storage.getUserCompanyMemberships(currentUser.id).catch(() => []);
      const companies = await Promise.all((memberships as any[]).map(async (membership: any) => {
        const company = await storage.getCompanyById(membership.companyId).catch(() => undefined);
        if (!company) return null;
        const [members, canManage] = await Promise.all([
          storage.getCompanyMembers(company.id).catch(() => []),
          canManageCompany(currentUser, company.id),
        ]);
        const invites = canManage ? await storage.getCompanyInvites(company.id).catch(() => []) : [];
        const activeInvite = (invites as any[])
          .filter((invite) => invite.status === "active" && (!invite.expiresAt || new Date(invite.expiresAt).getTime() > Date.now()))
          .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
        const pendingApprovals = canManage
          ? (members as any[]).filter((member) => member.status === "pending").map((member) => ({
              ...member,
              company,
            }))
          : [];
        return {
          company,
          membership,
          members,
          pendingApprovals,
          activeInvite: activeInvite ? { ...activeInvite, url: `${origin}/login?invite=${activeInvite.token}` } : null,
        };
      }));
      const cleanCompanies = companies.filter(Boolean) as any[];
      const allUsers = await storage.getAllUsers().catch(() => []);
      const userById = new Map((allUsers as any[]).map((user) => [user.id, { id: user.id, name: user.name, email: user.email, username: user.username }]));
      const pendingApprovals = cleanCompanies
        .flatMap((item) => item.pendingApprovals || [])
        .map((member) => ({ ...member, user: userById.get(member.userId), company: member.company }));
      res.json({ companies: cleanCompanies, pendingApprovals });
    } catch (error) {
      console.error("[Companies] me error:", error);
      res.status(500).json({ message: "Не удалось загрузить компании" });
    }
  });

  app.post("/api/company-invites", async (req, res) => {
    try {
      const currentUser = req.user as any;
      if (!currentUser?.id) return res.status(401).json({ message: "Требуется авторизация" });
      const companyId = String(req.body?.companyId || "").trim();
      if (!companyId) return res.status(400).json({ message: "companyId обязателен" });
      if (!(await canManageCompany(currentUser, companyId))) {
        return res.status(403).json({ message: "Недостаточно прав для приглашений" });
      }

      const oldInvites = await storage.getCompanyInvites(companyId).catch(() => []);
      await Promise.all((oldInvites as any[])
        .filter((invite) => invite.status === "active")
        .map((invite) => storage.updateCompanyInvite(invite.id, { status: "revoked" } as any).catch(() => undefined)));

      const invite = await storage.createCompanyInvite({
        companyId,
        token: crypto.randomBytes(24).toString("hex"),
        createdBy: currentUser.id,
        role: "member",
        status: "active",
        note: null,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      } as any);

      res.json({ invite, url: `${inviteOrigin(req)}/login?invite=${invite.token}` });
    } catch (error) {
      console.error("[Companies] invite error:", error);
      res.status(500).json({ message: "Не удалось создать приглашение" });
    }
  });

  app.get("/api/company-invites/resolve/:token", async (req, res) => {
    try {
      const invite = await storage.getCompanyInviteByToken(String(req.params.token || ""));
      if (!invite) return res.status(404).json({ message: "Приглашение не найдено" });
      const company = await storage.getCompanyById(invite.companyId).catch(() => undefined);
      const expired = Boolean(invite.expiresAt && new Date(invite.expiresAt).getTime() <= Date.now());
      const valid = invite.status === "active" && !expired && Boolean(company);
      res.json({ invite, company, valid, expired });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось проверить приглашение" });
    }
  });

  app.get("/api/auth/onboarding-state", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.id) return res.status(401).json({ message: "Требуется авторизация" });
      const memberships = await storage.getUserCompanyMemberships(user.id).catch(() => []);
      const rows = await Promise.all((memberships as any[]).map(async (membership) => ({
        membership,
        company: await storage.getCompanyById(membership.companyId).catch(() => null),
      })));
      const activeCompanies = rows.filter((row) => row.company && row.membership.status === "active");
      const pendingCompanies = rows.filter((row) => row.company && row.membership.status !== "active");
      const permissions = Array.isArray(user.permissions) ? user.permissions : [];
      res.json({
        user: {
          id: user.id,
          name: user.name,
          onboardingCompleted: user.onboardingCompleted !== false,
          workspaceMode: user.workspaceMode || "pending",
          permissions,
        },
        isPlatformAdmin: user.role === "admin" && permissions.includes("platform:admin"),
        activeCompanies,
        pendingCompanies,
      });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось загрузить стартовое состояние" });
    }
  });

  app.post("/api/onboarding/personal", async (req, res) => {
    const user = req.user as any;
    if (!user?.id) return res.status(401).json({ message: "Требуется авторизация" });
    const updated = await storage.updateUser(user.id, { active: true, onboardingCompleted: true, workspaceMode: "personal" } as any);
    res.json({ user: { ...updated, password: undefined } });
  });

  app.post("/api/onboarding/company", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.id) return res.status(401).json({ message: "Требуется авторизация" });
      const name = String(req.body?.name || "").trim();
      if (!name) return res.status(400).json({ message: "Укажите название компании" });
      const company = await storage.createCompany({
        name,
        description: req.body?.description ? String(req.body.description).trim() : null,
        ownerId: user.id,
        status: "active",
        settings: { needs: Array.isArray(req.body?.needs) ? req.body.needs : [] },
      } as any);
      await storage.createCompanyMember({
        companyId: company.id,
        userId: user.id,
        role: "owner",
        status: "active",
        joinedAt: new Date(),
      } as any);
      const updated = await storage.updateUser(user.id, { active: true, onboardingCompleted: true, workspaceMode: "company_owner" } as any);
      res.json({ company, user: { ...updated, password: undefined } });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось создать компанию" });
    }
  });

  app.post("/api/onboarding/join", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.id) return res.status(401).json({ message: "Требуется авторизация" });
      const token = String(req.body?.token || "").trim();
      const invite = await storage.getCompanyInviteByToken(token);
      if (!invite) return res.status(404).json({ message: "Приглашение не найдено" });
      if (invite.status !== "active" || (invite.expiresAt && new Date(invite.expiresAt).getTime() <= Date.now())) {
        return res.status(400).json({ message: "Приглашение не активно или срок истёк" });
      }
      const existing = await storage.getCompanyMembershipByUser(invite.companyId, user.id).catch(() => undefined);
      if (existing) {
        const activeMember = existing.status === "active"
          ? existing
          : await storage.updateCompanyMember(existing.id, { status: "active", approvedBy: invite.createdBy, joinedAt: new Date() } as any);
        const updatedUser = await storage.updateUser(user.id, { active: true, onboardingCompleted: true, workspaceMode: "company_member" } as any);
        return res.json({ membership: activeMember || existing, user: { ...updatedUser, password: undefined }, message: "Вы в компании" });
      }
      const membership = await storage.createCompanyMember({
        companyId: invite.companyId,
        userId: user.id,
        role: invite.role || "member",
        status: "active",
        invitedBy: invite.createdBy,
        approvedBy: invite.createdBy,
        joinedAt: new Date(),
      } as any);
      await storage.updateCompanyInvite(invite.id, { usedBy: user.id, usedAt: new Date() } as any).catch(() => undefined);
      const updatedUser = await storage.updateUser(user.id, { active: true, onboardingCompleted: true, workspaceMode: "company_member" } as any);
      res.json({ membership, user: { ...updatedUser, password: undefined }, message: "Вы добавлены в компанию" });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось отправить заявку" });
    }
  });

  app.post("/api/company-members/:memberId/approve", async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = String(req.body?.companyId || "").trim();
      if (!(await canManageCompany(user, companyId))) return res.status(403).json({ message: "Нет прав на подтверждение" });
      const member = await storage.updateCompanyMember(req.params.memberId, {
        status: "active",
        approvedBy: user.id,
        joinedAt: new Date(),
      } as any);
      if (!member) return res.status(404).json({ message: "Заявка не найдена" });
      await storage.updateUser(member.userId, { active: true, onboardingCompleted: true, workspaceMode: "company_member" } as any).catch(() => undefined);
      res.json(member);
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось подтвердить сотрудника" });
    }
  });

  app.post("/api/companies/:companyId/members", async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = String(req.params.companyId || "").trim();
      const userId = String(req.body?.userId || "").trim();
      const role = String(req.body?.role || "member").trim() || "member";
      if (!userId) return res.status(400).json({ message: "Укажите пользователя" });
      if (!(await canManageCompany(user, companyId))) return res.status(403).json({ message: "Нет прав на управление компанией" });
      const targetUser = await storage.getUser(userId);
      if (!targetUser) return res.status(404).json({ message: "Пользователь не найден" });
      const existing = await storage.getCompanyMembershipByUser(companyId, userId).catch(() => undefined);
      const member = existing
        ? await storage.updateCompanyMember(existing.id, { role, status: "active", approvedBy: user.id, joinedAt: new Date() } as any)
        : await storage.createCompanyMember({ companyId, userId, role, status: "active", invitedBy: user.id, approvedBy: user.id, joinedAt: new Date() } as any);
      await storage.updateUser(userId, { active: true, onboardingCompleted: true, workspaceMode: "company_member" } as any).catch(() => undefined);
      res.json(member);
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось добавить пользователя в компанию" });
    }
  });

  // Authentication routes
  app.post("/api/auth/login", loginLimiter, async (req, res) => {
    try {
      const { username, password } = req.body;
      const inviteToken = String(req.body?.invite || req.query?.invite || "").trim();

      if (!username || !password) {
        return res.status(400).json({ message: "Укажите логин и пароль" });
      }

      if (process.env.NODE_ENV !== "production") {
        console.log(`[Auth] Login attempt for user: ${username}`);
      }

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
        req.session.userId = "admin-fallback";
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
            onboardingCompleted: true,
            workspaceMode: "platform_admin",
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
                password: hashPassword("admin123"),
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

      // Проверяем пароль (хеш или legacy plain)
      if (!adminJustCreated && user) {
        const check = verifyPassword(password, user.password);
        if (!check.ok) {
          console.log(`[Auth] Invalid password for user: ${username}`);
          return res.status(401).json({ message: "Неверный логин или пароль" });
        }
        if (check.updateHash) {
          try {
            await withDbTimeout(() => storage.updateUser(user.id, { password: check.updateHash }), 5000, null);
          } catch (_) {}
        }
      }

      if (!user) {
        console.log(`[Auth] User is null after all checks: ${username}`);
        return res.status(401).json({ message: "Неверный логин или пароль" });
      }

      if (user.active === false) {
        const memberships = await storage.getUserCompanyMemberships(user.id).catch(() => []);
        const hasCompanyPath = (memberships as any[]).some((member) => ["active", "pending"].includes(String(member?.status || "")));
        let invite: any = null;
        if (inviteToken) {
          invite = await storage.getCompanyInviteByToken(inviteToken).catch(() => null);
          const inviteExpired = Boolean(invite?.expiresAt && new Date(invite.expiresAt).getTime() <= Date.now());
          if (!invite || invite.status !== "active" || inviteExpired) invite = null;
        }
        let inviteMembership: any = null;
        if (invite) {
          const existing = await storage.getCompanyMembershipByUser(invite.companyId, user.id).catch(() => undefined);
          if (existing) {
            inviteMembership = existing.status === "active"
              ? existing
              : await storage.updateCompanyMember(existing.id, { status: "active", approvedBy: invite.createdBy, joinedAt: new Date() } as any).catch(() => existing);
          } else {
            inviteMembership = await storage.createCompanyMember({
              companyId: invite.companyId,
              userId: user.id,
              role: invite.role || "member",
              status: "active",
              invitedBy: invite.createdBy,
              approvedBy: invite.createdBy,
              joinedAt: new Date(),
            } as any).catch(() => undefined);
          }
          await storage.updateCompanyInvite(invite.id, { usedBy: user.id, usedAt: new Date() } as any).catch(() => undefined);
        }
        if (invite || hasCompanyPath) {
          const activeMembership = inviteMembership?.status === "active"
            ? inviteMembership
            : (memberships as any[]).find((member) => member.status === "active");
          const updatedUser = await storage.updateUser(user.id, {
            active: true,
            onboardingCompleted: Boolean(activeMembership),
            workspaceMode: activeMembership ? "company_member" : "pending",
          } as any).catch(() => null);
          user = updatedUser || { ...user, active: true, onboardingCompleted: Boolean(activeMembership), workspaceMode: activeMembership ? "company_member" : "pending" };
        } else {
          console.log(`[Auth] User ${username} is not active`);
          return res.status(403).json({ message: "Ваш аккаунт ещё не подтверждён администратором. Если у вас есть приглашение в компанию, откройте ссылку-приглашение и войдите ещё раз." });
        }
      }

      try {
        await withDbTimeout(
          () => storage.updateUser(user.id, { lastLogin: new Date() }),
          5000,
          null
        );
      } catch (updateError) {
        console.warn("[Auth] Failed to update last login:", updateError);
      }

      req.session.userId = user.id;
      console.log(`[Auth] Successful login for user: ${username} (${user.role})`);

      res.json({
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          permissions: user.permissions,
          avatar: user.avatar,
          active: user.active,
          onboardingCompleted: user.onboardingCompleted,
          workspaceMode: user.workspaceMode,
        },
      });
    } catch (error: any) {
      console.error("[Auth] Login error:", error);
      res.status(500).json({
        message: error.message || "Внутренняя ошибка сервера",
      });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) console.warn("[Auth] Logout session destroy error:", err);
      res.clearCookie("streamdesk.sid");
      res.json({ ok: true });
    });
  });

  // Registration route - creates inactive user, requires admin approval
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, password, name, email } = req.body;
      const inviteToken = String(req.body?.invite || req.query?.invite || "").trim();

      if (!username || !password || !name) {
        return res.status(400).json({ message: "Заполните логин, имя и пароль" });
      }

      let existing: any;
      try {
        existing = await storage.getUserByUsername(username);
      } catch (dbError: any) {
        console.error("Database error during registration:", dbError);
        const msg = (dbError.message || "").toLowerCase();
        const isConn = /timeout|econnrefused|connection|password|auth/i.test(msg);
        return res.status(500).json({
          message: isConn
            ? "Ошибка подключения к базе данных. Проверьте, что PostgreSQL запущен и в .env указан верный DATABASE_URL (postgresql://USER:PASSWORD@HOST:PORT/DATABASE)."
            : (dbError.message || "Ошибка подключения к базе данных."),
        });
      }

      if (existing) {
        return res.status(400).json({ message: "Пользователь с таким логином уже существует" });
      }

      if (email && String(email).trim()) {
        const normalizedEmail = String(email).trim().toLowerCase();
        const allUsers = await storage.getAllUsers().catch(() => []);
        const emailOwner = (allUsers as any[]).find((user) => String(user.email || "").trim().toLowerCase() === normalizedEmail);
        if (emailOwner) {
          return res.status(400).json({ message: "Пользователь с такой почтой уже существует. Однофамильцы допустимы, но логин и почта должны быть уникальными." });
        }
      }

      let invite: any = null;
      if (inviteToken) {
        invite = await storage.getCompanyInviteByToken(inviteToken).catch(() => null);
        const inviteExpired = Boolean(invite?.expiresAt && new Date(invite.expiresAt).getTime() <= Date.now());
        if (!invite || invite.status !== "active" || inviteExpired) {
          return res.status(400).json({ message: "Приглашение не активно или срок истёк" });
        }
      }

      const newUser = await storage.createUser({
        username: String(username).trim(),
        password: hashPassword(String(password)),
        name: String(name).trim(),
        email: email != null && String(email).trim() !== "" ? String(email).trim() : undefined,
        role: "employee",
        permissions: [],
        active: true,
        onboardingCompleted: Boolean(invite),
        workspaceMode: invite ? "company_member" : "pending",
      } as any);

      if (invite) {
        await storage.createCompanyMember({
          companyId: invite.companyId,
          userId: newUser.id,
          role: invite.role || "member",
          status: "active",
          invitedBy: invite.createdBy,
          approvedBy: invite.createdBy,
          joinedAt: new Date(),
        } as any);
        await storage.updateCompanyInvite(invite.id, { usedBy: newUser.id, usedAt: new Date() } as any).catch(() => undefined);
      }

      req.session.userId = newUser.id;

      // Уведомление всем администраторам о новой заявке
      try {
        const users = await storage.getUsers();
        const admins = users.filter((u: any) => u.role === "admin");
        const message = invite
          ? `${newUser.name} (${newUser.username}) зарегистрировался по приглашению и добавлен в компанию.`
          : `${newUser.name} (${newUser.username}) хочет присоединиться. Подтвердите в админ-панели.`;
        for (const admin of admins) {
          await storage.createNotification({
            userId: admin.id,
            title: "Новая заявка на регистрацию",
            message,
            type: "info",
          });
        }
      } catch (notifErr: any) {
        console.warn("[Auth] Failed to create admin notification:", notifErr?.message);
      }

      res.json({
        message: invite
          ? "Аккаунт создан, вы добавлены в компанию."
          : "Аккаунт создан. Выберите личный режим, создайте компанию или вступите по приглашению.",
        user: { id: newUser.id, username: newUser.username, name: newUser.name, role: newUser.role, permissions: newUser.permissions, active: newUser.active, onboardingCompleted: newUser.onboardingCompleted, workspaceMode: newUser.workspaceMode },
      });
    } catch (error: any) {
      console.error("Auth register error:", error);
      const msg = (error.message || "").toLowerCase();
      const code = error?.code;
      if (code === "23505" || /unique|duplicate key|already exists/i.test(msg)) {
        return res.status(400).json({ message: "Пользователь с таким логином уже существует" });
      }
      if (/relation.*does not exist|table.*does not exist|column.*does not exist/i.test(msg)) {
        return res.status(500).json({
          message: "Схема базы данных устарела. На сервере выполните: npm run db:push (или npx drizzle-kit push), затем перезапустите приложение.",
        });
      }
      const isConn = /timeout|econnrefused|connection|password|auth|database/i.test(msg);
      res.status(500).json({
        message: isConn
          ? "Ошибка подключения к базе данных. Проверьте PostgreSQL и DATABASE_URL в .env (postgresql://USER:PASSWORD@HOST:PORT/DATABASE)."
          : (error.message || "Не удалось создать пользователя"),
      });
    }
  });

  // Dashboard stats
  app.get("/api/dashboard/stats", async (req, res) => {
    if (!(await hasWorkspaceAccess(req.user))) {
      return res.json({ onlineSystems: "0/0", activeStreams: 0, availableEquipment: "0/0", todayEvents: 0 });
    }
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
      const completedTasks = tasks.filter(t => t.status === 'done').length;
      const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
      const overdueTasks = tasks.filter(t => {
        if (!t.dueDate) return false;
        return new Date(t.dueDate) < new Date() && t.status !== 'done';
      }).length;

      // Среднее время выполнения (в часах)
      const completedTasksWithHistory = tasks.filter(t => t.status === 'done');
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

      const statusLabels: Record<string, string> = {
        todo: "К выполнению",
        in_progress: "В работе",
        done: "Готово",
        not_ready: "Бэклог",
        review: "На проверке",
      };
      const statusCounts: Record<string, number> = {};
      tasks.forEach(task => {
        const s = task.status || "todo";
        statusCounts[s] = (statusCounts[s] || 0) + 1;
      });
      const tasksByStatus = Object.entries(statusCounts).map(([status, count]) => ({
        status,
        label: statusLabels[status] || (status.length > 12 ? "Колонка" : status),
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

      // Лучшие исполнители (по выполненным задачам: status === 'done' или последняя колонка YouGile)
      const performerCounts: Record<string, { count: number; name: string; avatar?: string }> = {};
      completedTasksWithHistory.forEach(task => {
        if (task.assigneeId) {
          const user = users.find(u => u.id === task.assigneeId);
          if (!performerCounts[task.assigneeId]) {
            performerCounts[task.assigneeId] = {
              count: 0,
              name: user?.name || "Неизвестно",
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
          if (t.status === 'done') return false;
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

  /** Кто может смотреть Терминал (роли). Для сайдбара и проверки доступа. */
  app.get("/api/terminal/access", (_req, res) => {
    res.json({ allowedRoles: getTerminalAllowedRoles() });
  });

  /** Настройка доступа к Терминалу (только администратор). */
  app.post("/api/terminal/access", async (req, res) => {
    const user = req.user as { role?: string } | undefined;
    if (user?.role !== "admin") {
      return res.status(403).json({ message: "Только администратор может менять доступ к Терминалу" });
    }
    const roles = Array.isArray(req.body?.allowedRoles) ? req.body.allowedRoles : [];
    const normalized = roles.filter((r: unknown) => typeof r === "string" && (r as string).trim());
    setTerminalAllowedRoles(normalized.length ? normalized : ["admin"]);
    res.json({ allowedRoles: getTerminalAllowedRoles() });
  });

  /** Логи сервера — для ролей из «Доступ к Терминалу» (Настройки). */
  app.get("/api/terminal/logs", async (req, res) => {
    const user = req.user as { id?: string; role?: string } | undefined;
    if (!user?.id) {
      return res.status(403).json({ message: "Войдите в систему для просмотра логов" });
    }
    if (!canViewTerminal(user.role)) {
      return res.status(403).json({
        message: "Доступ к Терминалу для вашей роли отключён. Обратитесь к администратору или измените настройку в Настройках → Доступ к Терминалу.",
      });
    }
    const limit = req.query.limit != null ? Math.min(100, Math.max(1, Number(req.query.limit))) : 15;
    const result = getTerminalLogs(0, limit);
    res.json({ lines: result.lines, nextIndex: result.nextIndex });
  });

  // Events
  app.get("/api/events", async (req, res) => {
    if (!(await hasWorkspaceAccess(req.user))) return res.json([]);
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

    // Обогащаем события участниками с именами
    try {
      const users = await storage.getUsers();
      const eventsWithParticipants = await Promise.all(events.map(async (event: any) => {
        const participants = await storage.getEventParticipants(event.id);
        const withNames = participants.map((p: any) => ({
          ...p,
          userName: users.find((u: any) => u.id === p.userId)?.name ?? "?",
        }));
        return { ...event, participants: withNames };
      }));
      return res.json(eventsWithParticipants);
    } catch (e) {
      return res.json(events);
    }
  });

  app.post("/api/events", async (req, res) => {
    try {
      console.log("[Events] Creating event...");
      const body = req.body || {};
      const normalized = {
        ...body,
        startTime: body.startTime instanceof Date ? body.startTime : new Date(body.startTime),
        endTime: body.endTime instanceof Date ? body.endTime : new Date(body.endTime),
      };
      const eventData = insertEventSchema.parse(normalized);

      console.log("[Events] Saving to database...");
      // Без withDbTimeout: чтобы видеть реальную ошибку БД (таймаут, подключение, ограничения)
      const event = await storage.createEvent(eventData);

      if (!event) {
        return res.status(500).json({
          message: "Не удалось создать событие (БД вернула пустой результат)",
          error: "createEvent returned null",
        });
      }

      // Участники: записать в event_participants и уведомить
      const participantIds = req.body?.participants;
      if (Array.isArray(participantIds) && participantIds.length > 0) {
        const title = "Приглашение на событие";
        const message = `Вас пригласили на событие: ${event.title}. Примите или отклоните в календаре.`;
        for (const uid of participantIds) {
          if (uid && typeof uid === "string") {
            try {
              await storage.createEventParticipant({
                eventId: event.id,
                userId: uid,
                role: "participant",
                status: "invited",
              });
              await storage.createNotification({ userId: uid, title, message, type: "info" });
            } catch (e) {
              console.warn("[Events] Participant/notification failed for", uid, e);
            }
          }
        }
      }

      console.log("[Events] Event created successfully:", event.id);
      res.json(event);
    } catch (error: any) {
      const errMsg = error?.message ?? String(error);
      console.error("[Events] Error creating event:", errMsg);
      if (error?.stack) console.error(error.stack);
      // Различаем ошибки валидации (400) и ошибки БД (500)
      const isValidation = errMsg.includes("Invalid") || error?.name === "ZodError";
      const isTimeout = /timeout|ETIMEDOUT|timed out/i.test(errMsg);
      const isConnection = /connect|ECONNREFUSED|ECONNRESET/i.test(errMsg);
      const status = isValidation ? 400 : (isTimeout || isConnection ? 503 : 500);
      const message = isConnection
        ? "База данных недоступна. Проверьте DATABASE_URL и что PostgreSQL запущен."
        : isTimeout
          ? "База данных не ответила вовремя. Проверьте нагрузку и сеть."
          : errMsg || "Не удалось создать событие";
      res.status(status).json({ message, error: errMsg });
    }
  });

  app.put("/api/events/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const body = req.body || {};
      const normalized = { ...body };
      if (body.startTime != null) normalized.startTime = body.startTime instanceof Date ? body.startTime : new Date(body.startTime);
      if (body.endTime != null) normalized.endTime = body.endTime instanceof Date ? body.endTime : new Date(body.endTime);
      delete normalized.participants;
      const event = await storage.updateEvent(id, normalized);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      // Обновить список участников: удалить старых, добавить новых
      const participantIds = req.body?.participants;
      if (Array.isArray(participantIds)) {
        const existing = await storage.getEventParticipants(id);
        for (const p of existing) {
          await storage.deleteEventParticipant(id, p.userId);
        }
        const title = "Приглашение на событие";
        const message = `Вас пригласили на событие: ${event.title}. Примите или отклоните в календаре.`;
        for (const uid of participantIds) {
          if (uid && typeof uid === "string") {
            try {
              await storage.createEventParticipant({
                eventId: id,
                userId: uid,
                role: "participant",
                status: "invited",
              });
              await storage.createNotification({ userId: uid, title, message, type: "info" });
            } catch (e) {
              console.warn("[Events] Participant/notification failed for", uid, e);
            }
          }
        }
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

  app.get("/api/events/:eventId/participants", async (req, res) => {
    try {
      const { eventId } = req.params;
      const participants = await storage.getEventParticipants(eventId);
      const users = await storage.getUsers();
      const withNames = participants.map((p: any) => ({
        ...p,
        userName: users.find((u: any) => u.id === p.userId)?.name ?? "?",
      }));
      res.json(withNames);
    } catch (error) {
      res.status(500).json({ message: "Failed to get participants" });
    }
  });

  app.patch("/api/events/:eventId/participants/:participantId", async (req, res) => {
    try {
      const { participantId } = req.params;
      const { status } = req.body || {};
      if (status !== "accepted" && status !== "declined") {
        return res.status(400).json({ message: "status must be 'accepted' or 'declined'" });
      }
      const updated = await storage.updateEventParticipant(participantId, { status });
      if (!updated) {
        return res.status(404).json({ message: "Participant not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update participant" });
    }
  });

  const labelPrinterConfig = () => ({
    host: String(process.env.LABEL_PRINTER_HOST || "10.90.109.120").trim(),
    port: Number(process.env.LABEL_PRINTER_PORT || 9100),
    widthMm: Number(process.env.LABEL_WIDTH_MM || 40),
    heightMm: Number(process.env.LABEL_HEIGHT_MM || 20),
    gapMm: Number(process.env.LABEL_GAP_MM || 2),
    dpi: Number(process.env.LABEL_PRINTER_DPI || 300),
  });

  const cleanTsplText = (value: unknown, maxLength = 42) =>
    String(value ?? "")
      .replace(/[\r\n\t]+/g, " ")
      .replace(/"/g, "'")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength);

  const cleanTsplBarcode = (value: unknown, fallback: unknown) => {
    const cleaned = String(value ?? "")
      .replace(/[^A-Za-z0-9_.-]+/g, "")
      .slice(0, 64);
    return cleaned || String(fallback ?? "STREAMDESK").replace(/[^A-Za-z0-9_.-]+/g, "").slice(0, 64) || "STREAMDESK";
  };

  const buildInventoryLabelTspl = (items: Array<{ value: unknown; fallback?: unknown }>) => {
    const config = labelPrinterConfig();
    const dotsPerMm = config.dpi / 25.4;
    const dot = (mm: number) => Math.round(mm * dotsPerMm);
    const widthDots = dot(config.widthMm);
    const centerX = Math.round(widthDots / 2);

    return items.map((item) => {
      const barcode = cleanTsplBarcode(item.value, item.fallback);
      const inventory = cleanTsplText(item.value || barcode, 32).replace(/[^\x20-\x7E]+/g, "").trim() || barcode;
      const barcodeX = dot(3.0);
      const barcodeY = dot(2.6);
      const barcodeHeight = dot(10.2);
      const eraseWidth = dot(13.4);
      const eraseHeight = dot(4.3);
      const eraseX = centerX - Math.round(eraseWidth / 2);
      const eraseY = barcodeY + Math.round(barcodeHeight / 2) - Math.round(eraseHeight / 2);
      const brandX = centerX - dot(4.1);
      const brandY = eraseY + dot(0.55);
      const inventoryX = Math.max(dot(1.4), centerX - Math.round(inventory.length * dot(0.86) / 2));

      return [
        `SIZE ${config.widthMm} mm,${config.heightMm} mm`,
        `GAP ${config.gapMm} mm,0 mm`,
        "DIRECTION 1",
        "REFERENCE 0,0",
        "CODEPAGE UTF-8",
        "SPEED 4",
        "DENSITY 10",
        "SET TEAR ON",
        "SET CUTTER OFF",
        "CLS",
        `BARCODE ${barcodeX},${barcodeY},"128",${barcodeHeight},0,0,2,4,"${barcode}"`,
        `ERASE ${eraseX},${eraseY},${eraseWidth},${eraseHeight}`,
        `TEXT ${brandX},${brandY},"0",0,2,2,"ОТИС"`,
        `TEXT ${inventoryX},${dot(15.4)},"0",0,1,1,"${inventory}"`,
        "PRINT 1,1",
        "",
      ].filter(Boolean).join("\r\n");
    }).join("\r\n");
  };

  const buildEquipmentLabelTspl = (items: any[]) =>
    buildInventoryLabelTspl(items.map((item) => ({
      value: item.inventoryNumber || item.barcode || item.serialNumber || item.id,
      fallback: item.id,
    })));

  const buildLabelPrinterCalibrationTspl = () => {
    const config = labelPrinterConfig();
    return [
      `SIZE ${config.widthMm} mm,${config.heightMm} mm`,
      `GAP ${config.gapMm} mm,0 mm`,
      "DIRECTION 1",
      "REFERENCE 0,0",
      "GAPDETECT",
      "FORMFEED",
      "",
    ].join("\r\n");
  };

  const sendToLabelPrinter = (payload: string | Buffer) => new Promise<void>((resolve, reject) => {
    const config = labelPrinterConfig();
    const socket = new net.Socket();
    const buffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, "utf8");
    let settled = false;
    const done = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      error ? reject(error) : resolve();
    };
    const timer = setTimeout(() => {
      socket.destroy();
      done(new Error(`Не удалось подключиться к принтеру ${config.host}:${config.port} за 5 секунд`));
    }, 5000);

    socket.once("error", (error) => done(error));
    socket.connect(config.port, config.host, () => {
      socket.write(buffer, () => {
        socket.end(() => done());
      });
    });
  });

  // Equipment
  app.get("/api/equipment", async (req, res) => {
    if (!(await hasWorkspaceAccess(req.user))) return res.json([]);
    const { status } = req.query;

    const equipment = await withDbTimeout(async () => {
      if (status) {
        return await storage.getEquipmentByStatus(status as string);
      } else {
        return await storage.getEquipment();
      }
    }, 3000, []); // 3 секунды для быстрого ответа

    const list = Array.isArray(equipment) ? equipment : [];
    res.json(status ? list : list.filter((item: any) => item.status !== "archived"));
  });

  app.post("/api/equipment/labels/print", async (req, res) => {
    try {
      if (!(await hasWorkspaceAccess(req.user))) {
        return res.status(403).json({ message: "Нет доступа к складу" });
      }

      const ids = Array.isArray(req.body?.equipmentIds)
        ? req.body.equipmentIds.map((id: unknown) => String(id || "").trim()).filter(Boolean)
        : [];

      if (ids.length === 0) {
        return res.status(400).json({ message: "Выберите оборудование для печати этикеток" });
      }
      if (ids.length > 100) {
        return res.status(400).json({ message: "За один раз можно напечатать до 100 этикеток" });
      }

      const items = (await Promise.all(ids.map((id: string) => storage.getEquipmentById(id).catch(() => undefined))))
        .filter(Boolean) as any[];

      if (items.length === 0) {
        return res.status(404).json({ message: "Оборудование для печати не найдено" });
      }

      const payload = buildEquipmentLabelTspl(items);
      await sendToLabelPrinter(payload);
      const config = labelPrinterConfig();
      console.log(`[LabelPrinter] sent ${items.length} native inventory label(s), ${Buffer.byteLength(payload, "utf8")} bytes to ${config.host}:${config.port}`);
      res.json({
        success: true,
        count: items.length,
        printer: `${config.host}:${config.port}`,
        bytes: Buffer.byteLength(payload, "utf8"),
        mode: "native-tspl",
      });
    } catch (error: any) {
      console.error("[LabelPrinter] print failed:", error?.message || error);
      res.status(500).json({
        message: error?.message || "Не удалось отправить этикетки на принтер",
      });
    }
  });

  app.post("/api/equipment/labels/print-bitmaps", async (req, res) => {
    try {
      if (!(await hasWorkspaceAccess(req.user))) {
        return res.status(403).json({ message: "Нет доступа к складу" });
      }

      const labels = Array.isArray(req.body?.labels) ? req.body.labels : [];
      if (labels.length === 0) {
        return res.status(400).json({ message: "Нет этикеток для печати" });
      }
      if (labels.length > 100) {
        return res.status(400).json({ message: "За один раз можно напечатать до 100 этикеток" });
      }

      const config = labelPrinterConfig();
      const payloadParts: Buffer[] = [];
      let totalBitmapBytes = 0;
      const bitmapRatios: string[] = [];

      for (const label of labels) {
        const widthBytes = Number(label?.widthBytes || 0);
        const heightDots = Number(label?.heightDots || 0);
        const xDots = Math.max(0, Math.min(2000, Math.round(Number(label?.xDots || 0))));
        const yDots = Math.max(0, Math.min(2000, Math.round(Number(label?.yDots || 0))));
        const bitmapBase64 = String(label?.bitmapBase64 || "");
        if (!Number.isFinite(widthBytes) || widthBytes <= 0 || widthBytes > 256) {
          return res.status(400).json({ message: "Некорректная ширина этикетки" });
        }
        if (!Number.isFinite(heightDots) || heightDots <= 0 || heightDots > 1200) {
          return res.status(400).json({ message: "Некорректная высота этикетки" });
        }

        const bitmap = Buffer.from(bitmapBase64, "base64");
        if (bitmap.length !== widthBytes * heightDots) {
          return res.status(400).json({ message: "Некорректный bitmap этикетки" });
        }

        let setBits = 0;
        for (const byte of bitmap) {
          let bits = byte;
          while (bits) {
            bits &= bits - 1;
            setBits += 1;
          }
        }
        bitmapRatios.push((setBits / (bitmap.length * 8)).toFixed(3));
        totalBitmapBytes += bitmap.length;

        const header = [
          `SIZE ${config.widthMm} mm,${config.heightMm} mm`,
          `GAP ${config.gapMm} mm,0 mm`,
          "DIRECTION 1",
          "REFERENCE 0,0",
          "SPEED 4",
          "DENSITY 10",
          "SET TEAR ON",
          "SET CUTTER OFF",
          "CLS",
          `BITMAP ${xDots},${yDots},${widthBytes},${heightDots},0,`,
        ].join("\r\n");

        payloadParts.push(Buffer.from(header, "ascii"));
        payloadParts.push(bitmap);
        payloadParts.push(Buffer.from("\r\nPRINT 1,1\r\n", "ascii"));
      }

      const payload = Buffer.concat(payloadParts);
      await sendToLabelPrinter(payload);
      console.log(`[LabelPrinter] sent ${labels.length} bitmap label(s), ${totalBitmapBytes} bitmap bytes to ${config.host}:${config.port}; setBitRatios=${bitmapRatios.join(",")}`);
      res.json({
        success: true,
        count: labels.length,
        printer: `${config.host}:${config.port}`,
        bytes: payload.length,
        mode: "bitmap-tspl",
      });
    } catch (error: any) {
      console.error("[LabelPrinter] bitmap print failed:", error?.message || error);
      res.status(500).json({
        message: error?.message || "Не удалось отправить PNG-этикетку на принтер",
      });
    }
  });

  app.post("/api/equipment/labels/calibrate", async (req, res) => {
    try {
      if (!(await hasWorkspaceAccess(req.user))) {
        return res.status(403).json({ message: "Нет доступа к складу" });
      }

      const payload = buildLabelPrinterCalibrationTspl();
      await sendToLabelPrinter(payload);
      const config = labelPrinterConfig();
      console.log(`[LabelPrinter] calibration sent, ${Buffer.byteLength(payload, "ascii")} bytes to ${config.host}:${config.port}`);
      res.json({
        success: true,
        printer: `${config.host}:${config.port}`,
        bytes: Buffer.byteLength(payload, "ascii"),
      });
    } catch (error: any) {
      console.error("[LabelPrinter] calibration failed:", error?.message || error);
      res.status(500).json({
        message: error?.message || "Не удалось откалибровать принтер",
      });
    }
  });

  app.post("/api/equipment", async (req, res) => {
    try {
      if (!(await hasWorkspaceAccess(req.user))) {
        return res.status(403).json({ message: "Сначала создайте компанию или вступите по приглашению" });
      }
      console.log("[Equipment] Creating equipment...");
      const body = req.body || {};
      // Приводим пустые строки к undefined для опциональных полей, чтобы схема не падала.
      const name = body.name && String(body.name).trim();
      if (!name) {
        return res.status(400).json({ message: "Укажите название оборудования" });
      }
      const currentUser = req.user as any;
      const companyIds = await getUserCompanyIds(currentUser);
      const incomingSpecs = body.specifications && typeof body.specifications === "object" ? body.specifications as Record<string, unknown> : {};
      const sanitized: Record<string, unknown> = {
        name,
        type: (body.type && String(body.type).trim()) || "other",
        model: body.model && String(body.model).trim() ? String(body.model).trim() : undefined,
        serialNumber: body.serialNumber && String(body.serialNumber).trim() ? String(body.serialNumber).trim() : undefined,
        inventoryNumber: body.inventoryNumber && String(body.inventoryNumber).trim() ? String(body.inventoryNumber).trim() : await generateEquipmentInventoryNumber(body.type || "other"),
        barcode: body.barcode && String(body.barcode).trim() ? String(body.barcode).trim() : undefined,
        specifications: {
          ...incomingSpecs,
          createdByUserId: String((incomingSpecs as any).createdByUserId || currentUser?.id || ""),
          companyId: String((incomingSpecs as any).companyId || companyIds[0] || ""),
        },
        notes: body.notes && String(body.notes).trim() ? String(body.notes).trim() : undefined,
        status: body.status && String(body.status).trim() ? String(body.status).trim() : "available",
        location: body.location && String(body.location).trim() ? String(body.location).trim() : undefined,
        photos: Array.isArray(body.photos) ? body.photos : [],
      };
      if (sanitized.barcode) {
        const existingItems = await storage.getEquipment().catch(() => []);
        const barcode = String(sanitized.barcode).trim();
        const barcodeTaken = (existingItems as any[]).some((item) => String(item.barcode || "").trim().toLowerCase() === barcode.toLowerCase());
        if (barcodeTaken) {
          const fallback = String(sanitized.inventoryNumber || "").trim();
          const fallbackTaken = fallback && (existingItems as any[]).some((item) => String(item.barcode || "").trim().toLowerCase() === fallback.toLowerCase());
          sanitized.barcode = fallback && !fallbackTaken ? fallback : `${fallback || equipmentInventoryPrefix(sanitized.type)}_${Date.now().toString(36)}`;
        }
      }
      const equipmentData = insertEquipmentSchema.parse(sanitized);

      if (equipmentData.barcode) {
        console.log("[Equipment] Barcode creation attempted:", equipmentData.barcode);
      }

      console.log("[Equipment] Saving to database...");
      const equipment = await storage.createEquipment(equipmentData);
      console.log("[Equipment] Equipment created successfully:", equipment.id);
      res.json(equipment);
    } catch (error: any) {
      const msg = error?.message ?? String(error);
      console.error("[Equipment] Error creating equipment:", msg);
      if (error?.stack) console.error(error.stack);
      const isDbError = /timeout|econnrefused|connection|ECONNREFUSED|password|auth/i.test(msg);
      const userMessage = isDbError
        ? "Ошибка подключения к базе данных. Проверьте, что PostgreSQL запущен и DATABASE_URL в .env указан верно (postgresql://USER:PASSWORD@HOST:PORT/DATABASE)."
        : (msg || "Не удалось добавить оборудование");
      res.status(isDbError ? 500 : 400).json({ message: userMessage, error: msg });
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

  app.delete("/api/equipment/:id", async (req, res) => {
    try {
      if (!(await hasWorkspaceAccess(req.user))) return res.status(403).json({ message: "Нет доступа к складу" });
      const { id } = req.params;
      const item = await storage.getEquipmentById(id).catch(() => undefined);
      if (!item) return res.status(404).json({ message: "Оборудование не найдено" });
      const specs = item.specifications && typeof item.specifications === "object" ? item.specifications as any : {};
      const permissions = Array.isArray((req.user as any)?.permissions) ? (req.user as any).permissions : [];
      const userCompanyIds = await getUserCompanyIds(req.user);
      const canDelete =
        (req.user as any)?.role === "admin" ||
        (req.user as any)?.role === "manager" ||
        permissions.includes("equipment:delete") ||
        (specs.createdByUserId && specs.createdByUserId === (req.user as any)?.id) ||
        (specs.companyId && await canManageCompany(req.user, String(specs.companyId))) ||
        (!specs.companyId && userCompanyIds.length > 0);
      if (!canDelete) return res.status(403).json({ message: "Нет прав на удаление оборудования" });
      try {
        const deleted = await storage.deleteEquipment(id);
        if (deleted) return res.json({ success: true, mode: "deleted" });
      } catch (error: any) {
        console.warn("[Equipment] hard delete failed, archiving:", error?.message || error);
      }
      const archived = await storage.updateEquipment(id, {
        status: "archived",
        location: "Архив",
        specifications: {
          ...specs,
          archivedAt: new Date().toISOString(),
          archivedByUserId: (req.user as any)?.id || null,
        },
      } as any);
      res.json({ success: true, mode: "archived", equipment: archived });
    } catch (error: any) {
      console.error("[Equipment] delete failed:", error?.message || error);
      res.status(500).json({ message: error?.message || "Не удалось удалить оборудование" });
    }
  });

  // Systems
  app.get("/api/systems", async (req, res) => {
    try {
      if (!(await hasWorkspaceAccess(req.user))) return res.json([]);
      const systems = await withDbTimeout(() => storage.getSystems(), 5000, []);
      const companyIds = await getUserCompanyIds(req.user);
      const list = (Array.isArray(systems) ? systems : []).filter((system: any) => {
        const spec = system?.specifications && typeof system.specifications === "object" ? system.specifications as any : {};
        return !spec.companyId || companyIds.length === 0 || companyIds.includes(String(spec.companyId));
      }).map((system: any) => {
        const spec = system?.specifications && typeof system.specifications === "object" ? system.specifications as any : {};
        const agent = spec.agent && typeof spec.agent === "object" ? spec.agent : {};
        if (!spec.agentKey && !agent.agentKey) return system;
        const lastPingMs = system.lastPing ? new Date(system.lastPing).getTime() : 0;
        const intervalSec = Math.max(15, Number(agent.intervalSec || 15));
        const staleSec = lastPingMs ? Math.round((Date.now() - lastPingMs) / 1000) : 999999;
        const status = staleSec <= intervalSec * 4 ? "online" : "offline";
        return {
          ...system,
          status,
          specifications: {
            ...spec,
            agent: { ...agent, staleSec },
          },
        };
      });
      Promise.all(
        list.map(async (system: any) => {
          const spec = system?.specifications && typeof system.specifications === "object" ? system.specifications as any : {};
          const agent = spec.agent && typeof spec.agent === "object" ? spec.agent : {};
          if (spec.agentKey || agent.agentKey) {
            if (system.id && system.status !== "maintenance") {
              withDbTimeout(() => storage.updateSystem(system.id, { status: system.status, specifications: system.specifications } as any), 3000, undefined).catch(() => {});
            }
            return;
          }
          if (system?.ipAddress && system.status !== "maintenance") {
            try {
              const isOnline = await checkIP(system.ipAddress);
              const newStatus = isOnline ? "online" : "offline";
              if (system.status !== newStatus) {
                withDbTimeout(() => storage.pingSystem(system.id, newStatus), 3000, undefined).catch(() => {});
              }
            } catch (_) {}
          }
        })
      ).catch(() => {});
      res.json(list);
    } catch (e: any) {
      console.warn("[API] GET /api/systems:", e?.message || e);
      res.json([]);
    }
  });

  app.post("/api/systems", async (req, res) => {
    try {
      const parsed = insertSystemSchema.safeParse(req.body);
      const systemData = parsed.success ? parsed.data : {
        name: req.body?.name ?? "",
        type: req.body?.type ?? "server",
        location: req.body?.location ?? "",
        ipAddress: req.body?.ipAddress ?? undefined,
        status: req.body?.status ?? "offline",
        specifications: req.body?.specifications ?? undefined,
      };
      const system = await storage.createSystem(systemData);
      res.status(201).json(system);
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

  app.get("/api/agents/script/windows", async (_req, res) => {
    try {
      const scriptPath = path.join(process.cwd(), "scripts", "streamdesk-agent.ps1");
      const body = await fs.readFile(scriptPath, "utf8");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.send(body);
    } catch (error) {
      res.status(500).send("StreamDesk agent script is not available");
    }
  });

  app.get("/api/companies/:companyId/agent-download", async (req, res) => {
    try {
      const currentUser = req.user as any;
      const { companyId } = req.params;
      if (!(await canManageCompany(currentUser, companyId))) {
        return res.status(403).json({ message: "Нет прав на скачивание агента" });
      }
      const osName = String(req.query.os || "windows").toLowerCase();
      const deviceType = ["server", "computer", "vmix"].includes(String(req.query.type)) ? String(req.query.type) : "computer";
      if (osName !== "windows") {
        return res.status(400).json({ message: "Пока доступен Windows agent" });
      }
      const workspaceKey = await ensureCompanyWorkspaceKey(companyId);
      const agentKey = `agent_${companyId.slice(0, 8)}_${deviceType}_${crypto.randomBytes(8).toString("hex")}`;
      const autostart = String(req.query.autostart || "1") !== "0";
      const serverUrl = inviteOrigin(req);
      const company = await storage.getCompanyById(companyId).catch(() => undefined);
      const location = `${company?.name || "StreamDesk"} / ${deviceType}`;
      const runnerScript = `
$ErrorActionPreference = 'Stop'
$ServerUrl = '${psString(serverUrl)}'
$AgentDir = Join-Path $env:ProgramData 'StreamDeskAgent'
$AgentScript = Join-Path $AgentDir 'streamdesk-agent.ps1'
$RunnerScript = Join-Path $AgentDir 'run-streamdesk-agent.ps1'
New-Item -ItemType Directory -Force -Path $AgentDir | Out-Null

$MachineGuid = try { (Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Cryptography' -Name MachineGuid -ErrorAction Stop).MachineGuid } catch { $env:COMPUTERNAME }
$Sha = [System.Security.Cryptography.SHA256]::Create()
$MachineHash = [BitConverter]::ToString($Sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes("$env:COMPUTERNAME|$MachineGuid"))).Replace('-', '').Substring(0, 10).ToLowerInvariant()
$AgentKey = '${psString(agentKey)}_' + $env:COMPUTERNAME + '_' + $MachineHash

$env:STREAMDESK_URL = $ServerUrl
$env:STREAMDESK_COMPANY_ID = '${psString(companyId)}'
$env:STREAMDESK_WORKSPACE_KEY = '${psString(workspaceKey)}'
$env:STREAMDESK_AGENT_KEY = $AgentKey
$env:STREAMDESK_AGENT_TYPE = '${psString(deviceType)}'
$env:STREAMDESK_AGENT_LOCATION = '${psString(location)}'
$env:STREAMDESK_AGENT_INTERVAL_SEC = '15'
$env:STREAMDESK_AGENT_HARDWARE_INTERVAL_SEC = '1800'
${deviceType === "vmix" ? "$env:STREAMDESK_VMIX_URL = 'http://127.0.0.1:8088/api'" : ""}

Write-Host 'StreamDesk: installing company-bound agent...'
Invoke-WebRequest -Uri "$ServerUrl/api/agents/script/windows" -OutFile $AgentScript -UseBasicParsing

@'
$MachineGuid = try { (Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Cryptography' -Name MachineGuid -ErrorAction Stop).MachineGuid } catch { $env:COMPUTERNAME }
$Sha = [System.Security.Cryptography.SHA256]::Create()
$MachineHash = [BitConverter]::ToString($Sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes("$env:COMPUTERNAME|$MachineGuid"))).Replace('-', '').Substring(0, 10).ToLowerInvariant()
$AgentKey = '${psString(agentKey)}_' + $env:COMPUTERNAME + '_' + $MachineHash
$env:STREAMDESK_URL = '${psString(serverUrl)}'
$env:STREAMDESK_COMPANY_ID = '${psString(companyId)}'
$env:STREAMDESK_WORKSPACE_KEY = '${psString(workspaceKey)}'
$env:STREAMDESK_AGENT_KEY = $AgentKey
$env:STREAMDESK_AGENT_TYPE = '${psString(deviceType)}'
$env:STREAMDESK_AGENT_LOCATION = '${psString(location)}'
$env:STREAMDESK_AGENT_INTERVAL_SEC = '15'
$env:STREAMDESK_AGENT_HARDWARE_INTERVAL_SEC = '1800'
${deviceType === "vmix" ? "$env:STREAMDESK_VMIX_URL = 'http://127.0.0.1:8088/api'" : ""}
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File '$AgentScript'
'@ | Set-Content -Path $RunnerScript -Encoding UTF8

if (${autostart ? "$true" : "$false"}) {
  try {
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $RunnerScript + '"')
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest
    Register-ScheduledTask -TaskName 'StreamDesk Agent' -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
    Write-Host 'Autostart enabled: StreamDesk Agent scheduled task created.'
  } catch {
    Write-Warning ('Autostart was not enabled: {0}. Agent will run in this window now. Run BAT as administrator later to enable autostart.' -f $_.Exception.Message)
  }
}

Write-Host 'Starting StreamDesk Agent. You can close this window after the computer appears in Monitoring.'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $AgentScript
`.trimStart();
      const encodedScript = Buffer.from(runnerScript, "utf16le").toString("base64");
      const batScript = [
        "@echo off",
        "chcp 65001 >nul",
        "title StreamDesk Agent",
        "echo StreamDesk Agent installer",
        "echo Company-bound file. Do not share it with another company.",
        "echo.",
        `powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encodedScript}`,
        "if errorlevel 1 (",
        "  echo.",
        "  echo StreamDesk Agent failed to start. Run this file as administrator if autostart is enabled.",
        "  pause",
        ")",
        "endlocal",
        "",
      ].join("\r\n");
      const fileName = `streamdesk-agent-${deviceType}-${companyId.slice(0, 8)}.bat`;
      res.setHeader("Content-Type", "application/x-msdownload; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.setHeader("Cache-Control", "no-store");
      res.send(batScript);
    } catch (error: any) {
      console.error("[Agent] download failed:", error?.message || error);
      res.status(500).json({ message: "Не удалось подготовить файл агента" });
    }
  });

  app.post("/api/agents/heartbeat", async (req, res) => {
    try {
      const payload = req.body || {};
      const companyId = String(payload.companyId || "");
      const workspaceKey = String(payload.workspaceKey || "");
      const company = companyId ? await storage.getCompanyById(companyId).catch(() => undefined) : undefined;
      const settings = company?.settings && typeof company.settings === "object" ? company.settings as any : {};
      const expectedKey = String(settings.monitoring?.workspaceKey || "");
      if (!company || !expectedKey || workspaceKey !== expectedKey) {
        return res.status(403).json({ message: "Agent workspace rejected" });
      }
      const agentKey = String(payload.agentKey || "").trim();
      if (!agentKey) return res.status(400).json({ message: "agentKey is required" });
      const systems = await storage.getSystems().catch(() => []);
      const existing = (systems as any[]).find((system) => {
        const spec = system.specifications && typeof system.specifications === "object" ? system.specifications as any : {};
        const agent = spec.agent && typeof spec.agent === "object" ? spec.agent : {};
        return spec.agentKey === agentKey || agent.agentKey === agentKey;
      });
      const now = new Date();
      const previousSpec = existing?.specifications && typeof existing.specifications === "object" ? existing.specifications as any : {};
      const history = Array.isArray(previousSpec.metricsHistory) ? previousSpec.metricsHistory.slice(-359) : [];
      history.push({
        timestamp: now.toISOString(),
        ...(payload.metrics && typeof payload.metrics === "object" ? payload.metrics : {}),
        vmixDroppedFrames: payload.vmix?.droppedFramesTotal ?? payload.vmix?.droppedFrames ?? null,
      });
      const specifications = {
        ...previousSpec,
        companyId,
        workspaceKey,
        agentKey,
        agent: {
          agentKey,
          companyId,
          workspaceKey,
          deviceType: payload.type || "computer",
          version: payload.version || "1.0.0",
          localIps: Array.isArray(payload.localIps) ? payload.localIps : [],
          capabilities: Array.isArray(payload.capabilities) ? payload.capabilities : [],
          intervalSec: payload.intervalSec,
          staleSec: 0,
          sampleLagMs: payload.metrics?.collectedAt ? Math.max(0, now.getTime() - new Date(payload.metrics.collectedAt).getTime()) : null,
        },
        metrics: payload.metrics || {},
        hardware: payload.hardware || previousSpec.hardware || {},
        vmix: payload.vmix || {},
        metricsHistory: history,
      };
      const systemData = {
        name: String(payload.name || payload.hostname || agentKey),
        type: payload.type === "server" ? "server" : "computer",
        location: String(payload.location || company.name || "StreamDesk Agent"),
        ipAddress: String(payload.ipAddress || ""),
        status: "online",
        lastPing: now,
        specifications,
      } as any;
      const system = existing
        ? await storage.updateSystem(existing.id, systemData)
        : await storage.createSystem(systemData);
      const hardware = specifications.hardware && typeof specifications.hardware === "object" ? specifications.hardware as any : {};
      const metrics = specifications.metrics && typeof specifications.metrics === "object" ? specifications.metrics as any : {};
      const cpuName = String(metrics.cpuName || hardware.cpu?.[0]?.name || hardware.cpu?.name || "").trim();
      const gpuNames = [
        ...(Array.isArray(hardware.gpus) ? hardware.gpus : []),
        ...(Array.isArray(hardware.videoControllers) ? hardware.videoControllers : []),
      ]
        .map((gpu: any) => String(gpu?.name || gpu?.caption || gpu?.description || "").trim())
        .filter(Boolean);
      const gpuName = Array.from(new Set(gpuNames)).join(", ");
      const memoryTotalGb = metrics.memoryTotalGb ?? hardware.memory?.totalGb ?? hardware.ram?.totalGb ?? null;
      const diskTotalGb = metrics.diskTotalGb ?? hardware.storage?.totalGb ?? null;
      const equipmentSpecs = {
        companyId,
        source: "streamdesk-agent",
        agentKey,
        systemId: system?.id,
        syncedAt: now.toISOString(),
        hostname: payload.hostname || payload.name,
        ipAddress: payload.ipAddress || "",
        localIps: Array.isArray(payload.localIps) ? payload.localIps : [],
        deviceType: payload.type || "computer",
        metrics,
        hardware,
        cpu: cpuName,
        gpu: gpuName,
        ram: memoryTotalGb ? `${memoryTotalGb} GB` : undefined,
        disk: diskTotalGb ? `${diskTotalGb} GB` : undefined,
        os: metrics.osCaption || hardware.os?.caption || "",
      };
      const equipmentItems = await storage.getEquipment().catch(() => []);
      const existingEquipment = (equipmentItems as any[]).find((item) => {
        const spec = item.specifications && typeof item.specifications === "object" ? item.specifications as any : {};
        return spec.agentKey === agentKey;
      });
      const equipmentData = {
        name: String(payload.name || payload.hostname || "StreamDesk computer"),
        type: "computer",
        model: [cpuName, gpuName, memoryTotalGb ? `${memoryTotalGb}GB RAM` : ""].filter(Boolean).join(" / ").slice(0, 180),
        inventoryNumber: agentKey,
        status: "available",
        location: String(payload.location || company.name || "StreamDesk Agent"),
        specifications: equipmentSpecs,
        notes: "Автоматически синхронизировано агентом StreamDesk.",
      } as any;
      if (existingEquipment) {
        await storage.updateEquipment(existingEquipment.id, equipmentData).catch(() => undefined);
      } else {
        await storage.createEquipment(equipmentData).catch((error: any) => {
          console.warn("[Agent] equipment sync failed:", error?.message || error);
        });
      }
      res.json({ ok: true, systemId: system?.id });
    } catch (error: any) {
      console.error("[Agent] heartbeat failed:", error?.message || error);
      res.status(500).json({ message: "Heartbeat failed" });
    }
  });

  app.get("/api/agents/metrics", async (req, res) => {
    try {
      const system = await storage.getSystemById(String(req.query.systemId || "")).catch(() => undefined);
      if (!system) return res.json({ points: [] });
      const allowedIds = await getUserCompanyIds(req.user);
      const spec = system.specifications && typeof system.specifications === "object" ? system.specifications as any : {};
      if (allowedIds.length && spec.companyId && !allowedIds.includes(String(spec.companyId))) return res.json({ points: [] });
      const limit = Math.max(1, Math.min(1000, Number(req.query.limit || 240)));
      const hours = Math.max(0.1, Math.min(24 * 30, Number(req.query.hours || 24)));
      const since = Date.now() - hours * 60 * 60 * 1000;
      const points = (Array.isArray(spec.metricsHistory) ? spec.metricsHistory : [])
        .filter((point: any) => new Date(point.timestamp || 0).getTime() >= since)
        .slice(-limit);
      res.json({ points });
    } catch (error) {
      res.json({ points: [] });
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
    if (!(await hasWorkspaceAccess(req.user))) return res.json([]);
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
      const msg = (error.message || "").toLowerCase();
      const isDb = /timeout|econnrefused|connection|password|auth|database/i.test(msg);
      res.status(500).json({
        message: isDb
          ? "Ошибка подключения к базе данных. Проверьте PostgreSQL и DATABASE_URL в .env (postgresql://USER:PASSWORD@HOST:PORT/DATABASE)."
          : "Не удалось загрузить список чатов",
        error: error.message,
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

      // Проверяем, что пользователь существует (в stub-режиме разрешаем любой userId для совместимости с localStorage после перезапуска)
      const user = await storage.getUser(userId);
      if (!user && !isStubStorage) {
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

  // vMix API — таймкод (режиссёр задаёт в vMix; читаем из XML состояния)
  app.get("/api/vmix/timecode", async (req, res) => {
    try {
      const host = (req.query.host as string) || "localhost";
      const port = (req.query.port as string) || "8088";
      const vmixUrl = `http://${host}:${port}/api`;
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 3000);
      const xmlResponse = await fetch(vmixUrl, { signal: controller.signal as any });
      if (!xmlResponse.ok) {
        return res.json({ timecode: null, source: "vmix", error: "vMix не отвечает" });
      }
      const xmlText = await xmlResponse.text();
      // vMix XML может содержать время записи/таймкод в разных тегах
      const tcMatch = xmlText.match(/<timecode[^>]*>([^<]+)<\/timecode>/i)
        || xmlText.match(/recordingTimecode="([^"]+)"/)
        || xmlText.match(/timecode="([^"]+)"/);
      const timecode = tcMatch ? tcMatch[1].trim() : null;
      res.json({ timecode, source: "vmix" });
    } catch (e: any) {
      res.json({ timecode: null, source: "vmix", error: e?.message || "vMix недоступен" });
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
  app.get("/api/agents/:agentKey/vmix-scheduler/due", async (req, res) => {
    try {
      const agentKey = String(req.params.agentKey || "").trim();
      const companyId = String(req.query.companyId || "").trim();
      const workspaceKey = String(req.query.workspaceKey || "").trim();
      const includeGlobal = String(req.query.global || "") === "true";
      const lookAheadSec = Math.max(5, Math.min(300, Number(req.query.lookAheadSec || 30)));
      if (!agentKey) return res.status(400).json({ events: [], message: "agentKey is required" });

      const company = companyId ? await storage.getCompanyById(companyId).catch(() => undefined) : undefined;
      const settings = company?.settings && typeof company.settings === "object" ? company.settings as any : {};
      const expectedKey = String(settings.monitoring?.workspaceKey || "");
      if (!company || !expectedKey || workspaceKey !== expectedKey) {
        return res.status(403).json({ events: [], message: "Agent workspace rejected" });
      }

      const now = Date.now();
      const windowEnd = now + lookAheadSec * 1000;
      const events = await storage.getVmixSchedulerEvents();
      const dueEvents = events.filter((event: any) => {
        if (event.status !== "scheduled") return false;
        const startMs = new Date(event.startTime).getTime();
        if (!Number.isFinite(startMs) || startMs < now - 5000 || startMs > windowEnd) return false;
        const target = String(event.vmixHost || "").trim();
        return target === agentKey || (includeGlobal && !target);
      });

      for (const event of dueEvents) {
        await storage.updateVmixSchedulerEvent(event.id, {
          status: "live",
          executedAt: new Date(),
        } as any).catch(() => undefined);
      }

      res.json({
        events: dueEvents.map((event: any) => ({
          id: event.id,
          title: event.title,
          startTime: event.startTime?.toISOString?.() || new Date(event.startTime).toISOString(),
          actions: Array.isArray(event.actions) ? event.actions : [],
          input: event.input,
        })),
      });
    } catch (error: any) {
      console.error("[Agent vMix scheduler] due failed:", error?.message || error);
      res.status(500).json({ events: [], message: error?.message || "Failed to fetch due events" });
    }
  });

  app.post("/api/agents/vmix-scheduler/:eventId/result", async (req, res) => {
    try {
      const { eventId } = req.params;
      const { agentKey, companyId, workspaceKey, status, message, executedAt } = req.body || {};
      const company = companyId ? await storage.getCompanyById(String(companyId)).catch(() => undefined) : undefined;
      const settings = company?.settings && typeof company.settings === "object" ? company.settings as any : {};
      const expectedKey = String(settings.monitoring?.workspaceKey || "");
      if (!company || !expectedKey || String(workspaceKey || "") !== expectedKey) {
        return res.status(403).json({ message: "Agent workspace rejected" });
      }

      const event = await storage.getVmixSchedulerEventById(eventId);
      if (!event) return res.status(404).json({ message: "Event not found" });
      const target = String((event as any).vmixHost || "").trim();
      if (target && target !== String(agentKey || "").trim()) {
        return res.status(403).json({ message: "Event belongs to another agent" });
      }

      const normalizedStatus = status === "completed" ? "completed" : status === "error" ? "error" : "live";
      const updated = await storage.updateVmixSchedulerEvent(eventId, {
        status: normalizedStatus,
        executedAt: executedAt ? new Date(executedAt) : new Date(),
        errorMessage: normalizedStatus === "error" ? String(message || "Agent execution failed") : null,
      } as any);
      res.json({ ok: true, event: updated });
    } catch (error: any) {
      console.error("[Agent vMix scheduler] result failed:", error?.message || error);
      res.status(500).json({ message: error?.message || "Failed to save result" });
    }
  });

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
        vmixHost: newEvent.vmixHost,
        vmixPort: newEvent.vmixPort,
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
      const { title, startTime, input, actions, status, vmixHost, vmixPort, executedAt, errorMessage } = req.body;

      const updateData: any = {};
      if (title) updateData.title = title;
      if (startTime) updateData.startTime = new Date(startTime);
      if (input !== undefined) updateData.input = input;
      if (actions) updateData.actions = actions;
      if (status) updateData.status = status;
      if (vmixHost !== undefined) updateData.vmixHost = vmixHost;
      if (vmixPort !== undefined) updateData.vmixPort = vmixPort;
      if (executedAt !== undefined) updateData.executedAt = executedAt ? new Date(executedAt) : null;
      if (errorMessage !== undefined) updateData.errorMessage = errorMessage;

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
        vmixHost: updatedEvent.vmixHost,
        vmixPort: updatedEvent.vmixPort,
        executedAt: updatedEvent.executedAt?.toISOString(),
        errorMessage: updatedEvent.errorMessage,
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

  // Rooms (аудитории/кабинеты для карт: редактируемые вместимость и уровень доступа)
  type RoomRow = { id: string; name: string; type: string; capacity: number; accessLevel: string; floorId: string };
  const defaultRoomsList: RoomRow[] = [
    { id: "100", name: "100", type: "Кабинет", capacity: 4, accessLevel: "green", floorId: "floor-1" },
    { id: "101", name: "101", type: "Кабинет", capacity: 6, accessLevel: "green", floorId: "floor-1" },
    { id: "102", name: "102", type: "Переговорная", capacity: 8, accessLevel: "green", floorId: "floor-1" },
    { id: "103", name: "103", type: "Переговорная", capacity: 10, accessLevel: "green", floorId: "floor-1" },
    { id: "107", name: "107", type: "Большая лекционная «Север»", capacity: 150, accessLevel: "red", floorId: "floor-1" },
    { id: "109", name: "109", type: "Лекционная", capacity: 80, accessLevel: "yellow", floorId: "floor-1" },
    { id: "110", name: "110", type: "Аудитория", capacity: 40, accessLevel: "yellow", floorId: "floor-1" },
    { id: "111", name: "111", type: "Кабинет", capacity: 2, accessLevel: "red", floorId: "floor-1" },
    { id: "112", name: "112", type: "Студия", capacity: 15, accessLevel: "yellow", floorId: "floor-1" },
    { id: "200", name: "200", type: "Лекционная", capacity: 100, accessLevel: "yellow", floorId: "floor-2" },
    { id: "201", name: "201", type: "Кабинет", capacity: 4, accessLevel: "green", floorId: "floor-2" },
    { id: "202", name: "202", type: "Переговорная", capacity: 12, accessLevel: "green", floorId: "floor-2" },
    { id: "300", name: "300", type: "Конференц-зал", capacity: 200, accessLevel: "red", floorId: "floor-3" },
    { id: "301", name: "301", type: "Кабинет", capacity: 4, accessLevel: "green", floorId: "floor-3" },
  ];
  let roomsStore: RoomRow[] = defaultRoomsList.map((r) => ({ ...r }));
  app.get("/api/rooms", async (_req, res) => {
    res.json(roomsStore);
  });
  app.get("/api/rooms/:id", async (req, res) => {
    const room = roomsStore.find((r) => r.id === req.params.id);
    if (!room) return res.status(404).json({ message: "Room not found" });
    res.json(room);
  });
  app.put("/api/rooms/:id", async (req, res) => {
    const { id } = req.params;
    const { capacity, accessLevel, name, type } = req.body;
    const index = roomsStore.findIndex((r) => r.id === id);
    if (index === -1) return res.status(404).json({ message: "Room not found" });
    if (capacity != null) roomsStore[index].capacity = Number(capacity);
    if (accessLevel != null) roomsStore[index].accessLevel = String(accessLevel);
    if (name != null) roomsStore[index].name = String(name);
    if (type != null) roomsStore[index].type = String(type);
    res.json(roomsStore[index]);
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

  app.put("/api/notifications/:id/read", async (req, res) => {
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

  app.put("/api/notifications/mark-all-read", async (req, res) => {
    try {
      const userId = req.body?.userId;
      if (!userId) {
        return res.status(400).json({ message: "userId required" });
      }
      const count = await storage.markAllNotificationsRead(userId);
      res.json({ success: true, count });
    } catch (error) {
      res.status(500).json({ message: "Failed to mark all as read" });
    }
  });

  app.delete("/api/notifications/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const success = await storage.deleteNotification(id);
      if (!success) {
        return res.status(404).json({ message: "Notification not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete notification" });
    }
  });

  // Equipment Photo Upload
  app.post("/api/equipment/photos/upload", upload.single('photo'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No photo file provided" });
      }

      res.json({ url: `/uploads/${req.file.filename}` });
    } catch (error) {
      res.status(500).json({ message: "Failed to upload photo" });
    }
  });

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
        .replace(/[^\p{L}0-9_\-/\\ .]/gu, "_") // точка разрешена для расширений файлов (.mp3 и т.д.)
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
      console.error("Failed to create podcast:", error);
      res.status(500).json({ message: "Не удалось создать подкаст" });
    }
  });

  // Delete entire podcast (folder and all contents)
  app.delete("/api/transcriptions/podcasts/:podcast", async (req, res) => {
    try {
      const { podcast } = req.params;
      const dirPath = getSafeTranscriptionPath(podcast);
      const realPath = path.resolve(dirPath);
      const realBase = path.resolve(TRANSCRIPTIONS_BASE_DIR);
      if (!realPath.startsWith(realBase) || realPath === realBase) {
        return res.status(400).json({ message: "Недопустимое имя подкаста" });
      }
      const stat = await fs.stat(realPath).catch(() => null);
      if (!stat || !stat.isDirectory()) {
        return res.status(404).json({ message: "Подкаст не найден" });
      }
      await fs.rm(realPath, { recursive: true });
      res.json({ success: true });
    } catch (error: any) {
      console.error("Failed to delete podcast:", error);
      res.status(500).json({ message: error?.message || "Не удалось удалить подкаст" });
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

  // Delete file or folder inside podcast
  app.delete("/api/transcriptions/podcasts/:podcast/contents", async (req, res) => {
    try {
      const { podcast } = req.params;
      const { path: relativePath } = req.query;
      if (relativePath === undefined || relativePath === "") {
        return res.status(400).json({ message: "Укажите path (файл или папку)" });
      }
      const targetPath = getSafeTranscriptionPath(podcast, String(relativePath));
      const basePath = getSafeTranscriptionPath(podcast);
      const realTarget = path.resolve(targetPath);
      const realBase = path.resolve(basePath);
      if (!realTarget.startsWith(realBase)) {
        return res.status(400).json({ message: "Недопустимый путь" });
      }
      const stat = await fs.stat(realTarget).catch(() => null);
      if (!stat) {
        return res.status(404).json({ message: "Файл или папка не найдены" });
      }
      if (stat.isDirectory()) {
        await fs.rm(realTarget, { recursive: true });
      } else {
        await fs.unlink(realTarget);
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("Failed to delete transcription item:", error);
      res.status(500).json({ message: error?.message || "Не удалось удалить" });
    }
  });

  // Upload file into podcast/folder (сохраняем во временную папку, затем переносим — req.body в multer destination может быть ещё пуст)
  const transcriptionUploadTempDir = path.join(process.cwd(), "uploads", "transcriptions", "_upload");
  const transcriptionUploadToTemp = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        fs.mkdir(transcriptionUploadTempDir, { recursive: true }).then(() => cb(null, transcriptionUploadTempDir)).catch((err) => cb(err as any, ""));
      },
      filename: (_, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const originalName = file.originalname || "file";
        const ext = path.extname(originalName);
        const base = path.basename(originalName, ext).replace(/[^\p{L}0-9_\- ]/gu, "_");
        cb(null, base + "-" + uniqueSuffix + ext);
      },
    }),
    limits: { fileSize: 100 * 1024 * 1024 },
  });

  app.post(
    "/api/transcriptions/upload",
    transcriptionUploadToTemp.single("file"),
    async (req, res) => {
      try {
        const podcast = (req.body?.podcast || "").toString().trim();
        const relativePath = (req.body?.path || "").toString().trim();

        if (!podcast) {
          if (req.file) await fs.unlink(req.file.path).catch(() => {});
          return res.status(400).json({ message: "Выберите подкаст (папку) для загрузки" });
        }

        if (!req.file) {
          return res.status(400).json({ message: "Файл не выбран" });
        }

        const safePodcast = podcast.replace(/[^\p{L}0-9_\- ]/gu, "_");
        const safeRelative = relativePath.replace(/(\.\.[/\\])/g, "").replace(/[^\p{L}0-9_\-/\\ ]/gu, "_");
        const targetDir = safeRelative
          ? path.join(TRANSCRIPTIONS_BASE_DIR, safePodcast, safeRelative)
          : path.join(TRANSCRIPTIONS_BASE_DIR, safePodcast);
        await fs.mkdir(targetDir, { recursive: true });
        const targetPath = path.join(targetDir, req.file.filename);
        await fs.rename(req.file.path, targetPath);

        const storagePath = path.relative(process.cwd(), targetPath);
        res.json({
          name: req.file.filename,
          originalName: req.file.originalname,
          size: req.file.size,
          podcast: safePodcast,
          path: relativePath,
          url: `/${storagePath.replace(/\\\\/g, "/")}`,
        });
      } catch (error: any) {
        if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});
        console.error("Failed to upload transcription file:", error);
        res.status(500).json({ message: error?.message || "Не удалось загрузить файл" });
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
      const currentUser = req.user || null;
      const userPermissions = (currentUser?.permissions || []) as string[];

      const { assigneeId, creatorId, status, yougileBoardId } = req.query;

      let tasks = await withDbTimeout(async () => {
        if (yougileBoardId) {
          const boardId = yougileBoardId as string;
          return await storage.getTasksByYougileBoardId(boardId);
        }
        let list: any[];
        if (assigneeId) {
          list = await storage.getTasksByAssignee(assigneeId as string);
        } else if (creatorId) {
          list = await storage.getTasksByCreator(creatorId as string);
        } else if (status) {
          list = await storage.getTasksByStatus(status as string);
        } else {
          list = await storage.getTasks();
        }
        // «Мои задачи»: только локальные задачи (без привязки к YouGile), чтобы задачи из досок YouGile не дублировались
        return list.filter((t: any) => !t.yougileBoardId);
      }, 3000, []); // 3 секунды для быстрого ответа

      // Фильтруем задачи по правам доступа (для доски YouGile не фильтруем по автору — показываем все задачи доски)
      if (currentUser && tasks && !yougileBoardId) {
        if (currentUser.role !== 'admin' && !userPermissions.includes('tasks:view_all')) {
          const companyIds = await getUserCompanyIds(currentUser).catch(() => []);
          const companyIdSet = new Set((companyIds || []).map((id: any) => String(id)));
          const allProjects = await storage.getProjects().catch(() => []);
          const accessibleProjectIds = new Set(
            (allProjects as any[])
              .filter((project) => {
                const participants = Array.isArray(project?.participants) ? project.participants.map(String) : [];
                return (
                  (project.companyId && companyIdSet.has(String(project.companyId))) ||
                  String(project.ownerId || "") === String(currentUser.id) ||
                  String(project.assignedTo || "") === String(currentUser.id) ||
                  participants.includes(String(currentUser.id))
                );
              })
              .map((project) => String(project.id))
          );
          tasks = tasks.filter((task: any) =>
            task.creatorId === currentUser.id ||
            task.assigneeId === currentUser.id ||
            (task.companyId && companyIdSet.has(String(task.companyId))) ||
            (task.projectId && accessibleProjectIds.has(String(task.projectId))) ||
            userPermissions.includes('tasks:view')
          );
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
      const currentUser = req.user as any;
      const body = { ...(req.body || {}) };
      if (!body.creatorId && currentUser?.id) body.creatorId = currentUser.id;
      if (!body.creatorId) {
        return res.status(400).json({
          message: "Для создания задачи необходимо войти в систему",
          error: "creatorId is required",
        });
      }
      for (const key of ["dueDate", "startDate", "completedAt"] as const) {
        if (body[key] === "" || body[key] === undefined) {
          delete body[key];
        } else if (body[key] === null) {
          body[key] = null;
        } else if (typeof body[key] === "string") {
          const date = new Date(body[key]);
          body[key] = Number.isNaN(date.getTime()) ? null : date;
        }
      }
      if (!body.companyId && body.projectId) {
        const project = await storage.getProjectById(String(body.projectId)).catch(() => undefined);
        if ((project as any)?.companyId) body.companyId = (project as any).companyId;
      }
      if (!body.companyId && currentUser?.id) {
        const companyIds = await getUserCompanyIds(currentUser).catch(() => []);
        if (companyIds[0]) body.companyId = companyIds[0];
      }
      const taskData = insertTaskSchema.parse(body);

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

      // Уведомление исполнителю, если задача назначена
      if (task.assigneeId) {
        try {
          await storage.createNotification({
            userId: task.assigneeId,
            title: "Новая задача",
            message: `Вам назначена задача: ${task.title}`,
            type: "info",
          });
        } catch (notifErr) {
          console.warn("[Tasks] Failed to create notification:", notifErr);
        }
      }

      // Синхронизация с YouGile: создаём задачу в той колонке, которую выбрал пользователь (status = id колонки YouGile для досок)
      if (task) {
        try {
          const { isYouGileConfigured, yougileEnqueueCreate, yougileGetColumns, getYouGileDefaultColumnId, getYouGileColumnMap } = await import("./yougile");
          if (isYouGileConfigured()) {
            const taskAny = task as any;
            let yougileColumnId: string | null = null;
            if (taskAny.yougileBoardId) {
              let cols = await storage.getYougileColumns(taskAny.yougileBoardId);
              if (!cols.length) {
                const ygCols = await yougileGetColumns(taskAny.yougileBoardId);
                await storage.upsertYougileColumns(ygCols.map((c: any) => ({ id: c.id, boardId: taskAny.yougileBoardId, title: c.title ?? null, order: c.order ?? 0, color: (c as any).color ?? null })));
                cols = await storage.getYougileColumns(taskAny.yougileBoardId);
              }
              const statusFromClient = taskAny.status;
              if (statusFromClient && typeof statusFromClient === "string" && statusFromClient.length > 0) {
                const exists = cols.some((c: any) => c.id === statusFromClient);
                yougileColumnId = exists ? statusFromClient : (cols[0]?.id ?? null);
              }
              if (!yougileColumnId) yougileColumnId = cols[0]?.id ?? null;
            }
            if (!yougileColumnId) {
              const columnMap = getYouGileColumnMap();
              const status = taskAny.status;
              yougileColumnId = (status && columnMap[status]) ? columnMap[status] : null;
            }
            if (!yougileColumnId) yougileColumnId = await getYouGileDefaultColumnId();
            if (yougileColumnId) {
              const boardId = taskAny.yougileBoardId || "";
              yougileEnqueueCreate(task.id, boardId, {
                title: task.title,
                description: task.description || undefined,
                columnId: yougileColumnId,
                deadline: task.dueDate ? new Date(task.dueDate).getTime() : undefined,
              }, async (ygTask) => {
                await storage.updateTask(task.id, { yougileTaskId: ygTask.id, yougileBoardId: boardId || ygTask.boardId });
              });
            }
          }
        } catch (ygErr: any) {
          console.warn("[Tasks] YouGile sync on create failed:", ygErr?.message || ygErr);
        }
      }

      console.log("[Tasks] Task created successfully:", task.id);
      res.json(task);
    } catch (error: any) {
      const errMsg = error?.message ?? String(error);
      console.error("[Tasks] Error creating task:", errMsg);
      if (error?.stack) console.error(error.stack);
      const isZod = error?.name === "ZodError" || errMsg.includes("Invalid");
      const message = isZod
        ? "Проверьте поля: название обязательно; статус и приоритет — из списка"
        : (errMsg || "Не удалось создать задачу");
      res.status(400).json({
        message,
        error: errMsg
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
      for (const key of ["dueDate", "startDate", "completedAt"] as const) {
        if (updateData[key] === "" || updateData[key] === undefined) {
          delete updateData[key];
        } else if (updateData[key] === null) {
          updateData[key] = null;
        } else if (typeof updateData[key] === "string") {
          const date = new Date(updateData[key]);
          updateData[key] = Number.isNaN(date.getTime()) ? null : date;
        }
      }
      if (updateData.projectColumnId) {
        const projectId = updateData.projectId || oldTask.projectId;
        if (projectId) {
          const columns = await storage.getProjectColumns(projectId).catch(() => []);
          const exists = (columns as any[]).some((column) => column.id === updateData.projectColumnId);
          if (!exists) delete updateData.projectColumnId;
        } else {
          delete updateData.projectColumnId;
        }
      }

      const task = await storage.updateTask(id, updateData);

      // Уведомление новому исполнителю при смене назначения
      if (updateData.assigneeId != null && updateData.assigneeId !== oldTask.assigneeId && task.assigneeId) {
        try {
          await storage.createNotification({
            userId: task.assigneeId,
            title: "Задача назначена",
            message: `Вам назначена задача: ${task.title}`,
            type: "info",
          });
        } catch (notifErr) {
          console.warn("[Tasks] Failed to create notification:", notifErr);
        }
      }

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

      // Синхронизация с YouGile: ставим в очередь (при лимите API запросы выполнятся позже)
      if (oldTask && (oldTask as any).yougileTaskId) {
        try {
          const { isYouGileConfigured, yougileEnqueueUpdate, getYouGileColumnMap } = await import("./yougile");
          if (isYouGileConfigured()) {
            const payload: { title?: string; description?: string; deadline?: number; columnId?: string } = {
              title: task.title,
              description: task.description ?? undefined,
              deadline: task.dueDate ? new Date(task.dueDate).getTime() : undefined,
            };
            if (updateData.status != null) {
              const taskBoardId = (oldTask as any).yougileBoardId;
              const yougileColumnId = taskBoardId
                ? updateData.status
                : getYouGileColumnMap()[updateData.status];
              if (yougileColumnId) payload.columnId = yougileColumnId;
            }
            yougileEnqueueUpdate((oldTask as any).yougileTaskId, payload);
          }
        } catch (ygErr: any) {
          console.warn("[Tasks] YouGile sync on update failed:", ygErr?.message || ygErr);
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
      const task = await storage.getTaskById(id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      const yougileTaskId = (task as any).yougileTaskId;
      const deleted = await storage.deleteTask(id);
      if (!deleted) {
        return res.status(404).json({ message: "Task not found" });
      }
      if (yougileTaskId) {
        try {
          const { isYouGileConfigured, yougileEnqueueDelete } = await import("./yougile");
          if (isYouGileConfigured()) yougileEnqueueDelete(yougileTaskId);
        } catch (ygErr: any) {
          console.warn("[Tasks] YouGile sync on delete failed:", ygErr?.message || ygErr);
        }
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
      const task = await storage.getTaskById(taskId);
      try {
        await storage.createTaskHistory({
          taskId,
          userId: commentData.userId,
          action: "commented",
          newValue: { commentId: comment.id, content: comment.content?.slice(0, 200) },
        });
      } catch (e) {
        console.warn("[Tasks] Task history (comment) failed:", e);
      }
      if (task?.assigneeId && task.assigneeId !== commentData.userId) {
        try {
          await storage.createNotification({
            userId: task.assigneeId,
            title: "Новый комментарий к задаче",
            message: `Добавлен комментарий к задаче: ${task.title}`,
            type: "info",
          });
        } catch (e) {
          console.warn("[Tasks] Comment notification failed:", e);
        }
      }
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
      const barcode = decodeURIComponent(String(req.params.barcode || "")).trim();
      const normalizeBarcode = (value: unknown) => String(value ?? "").trim().toLowerCase();
      let equipmentItem = await storage.getEquipmentByBarcode(barcode).catch(() => undefined);
      if (!equipmentItem) {
        const items = await storage.getEquipment().catch(() => []);
        const needle = normalizeBarcode(barcode);
        equipmentItem = (items as any[]).find((item) => {
          const candidates = [
            item.barcode,
            item.inventoryNumber,
            item.serialNumber,
            item.id,
          ].map(normalizeBarcode).filter(Boolean);
          return candidates.includes(needle);
        });
      }
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
    const currentUser = req.user as any;
    if (!currentUser?.id) return res.status(401).json({ message: "Требуется авторизация" });
    const permissions = Array.isArray(currentUser.permissions) ? currentUser.permissions : [];
    const allUsers = await withDbTimeout(() => storage.getUsers(), 3000, []);
    if (currentUser.role === "admin" && permissions.includes("platform:admin")) {
      return res.json(allUsers.map((u: any) => ({ ...u, password: undefined })));
    }
    const companyIds = await getUserCompanyIds(currentUser).catch(() => []);
    const visibleIds = new Set<string>([String(currentUser.id)]);
    await Promise.all((companyIds as string[]).map(async (companyId) => {
      const members = await storage.getCompanyMembers(companyId).catch(() => []);
      for (const member of members as any[]) {
        if (member.status === "active" && member.userId) visibleIds.add(String(member.userId));
      }
    }));
    res.json((allUsers as any[])
      .filter((u: any) => visibleIds.has(String(u.id)))
      .map((u: any) => ({ ...u, password: undefined })));
  });

  app.get("/api/platform/users", async (req, res) => {
    try {
      if (!requirePlatformAdmin(req, res)) return;
      const [users, companies, memberships] = await Promise.all([
        storage.getAllUsers(),
        storage.getCompanies().catch(() => []),
        Promise.all((await storage.getCompanies().catch(() => [])).map((company: any) => storage.getCompanyMembers(company.id).catch(() => []))).then((rows) => rows.flat()),
      ]);
      const companyById = new Map((companies as any[]).map((company) => [company.id, company]));
      const byUser = new Map<string, any[]>();
      for (const membership of memberships as any[]) {
        const list = byUser.get(membership.userId) || [];
        list.push({ ...membership, company: companyById.get(membership.companyId) || null });
        byUser.set(membership.userId, list);
      }
      res.json((users as any[]).map((user) => ({
        ...user,
        password: undefined,
        memberships: byUser.get(user.id) || [],
      })));
    } catch (error: any) {
      console.error("[Platform] users error:", error);
      res.status(500).json({ message: error?.message || "Не удалось загрузить пользователей" });
    }
  });

  app.post("/api/platform/users/:id/reset-password", async (req, res) => {
    try {
      if (!requirePlatformAdmin(req, res)) return;
      const { id } = req.params;
      const password = String(req.body?.password || "").trim();
      if (password.length < 6) return res.status(400).json({ message: "Пароль должен быть минимум 6 символов" });
      const user = await storage.updateUser(id, { password: hashPassword(password) } as any);
      if (!user) return res.status(404).json({ message: "Пользователь не найден" });
      res.json({ success: true, user: { ...user, password: undefined } });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось сбросить пароль" });
    }
  });

  app.delete("/api/platform/users/:id", async (req, res) => {
    try {
      const currentUser = requirePlatformAdmin(req, res);
      if (!currentUser) return;
      const { id } = req.params;
      if (String(id) === String(currentUser.id)) {
        return res.status(400).json({ message: "Нельзя удалить свой аккаунт владельца" });
      }
      const target = await storage.getUser(id);
      if (!target) return res.status(404).json({ message: "Пользователь не найден" });
      const targetPermissions = Array.isArray((target as any).permissions) ? (target as any).permissions : [];
      if (target.role === "admin" && targetPermissions.includes("platform:admin")) {
        const allUsers = await storage.getAllUsers().catch(() => []);
        const activePlatformAdmins = (allUsers as any[]).filter((user) => {
          const permissions = Array.isArray(user.permissions) ? user.permissions : [];
          return user.active !== false && user.role === "admin" && permissions.includes("platform:admin");
        });
        if (activePlatformAdmins.length <= 1) {
          return res.status(400).json({ message: "Нельзя удалить последнего владельца платформы" });
        }
      }
      const memberships = await storage.getUserCompanyMemberships(id).catch(() => []);
      await Promise.all((memberships as any[]).map((member) =>
        storage.updateCompanyMember(member.id, { status: "removed", updatedAt: new Date() } as any).catch(() => undefined)
      ));
      await storage.deleteUser(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось удалить пользователя" });
    }
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
      const body = { ...req.body };
      if (body.password) body.password = hashPassword(String(body.password));
      const userData = insertUserSchema.parse(body);
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
      const updateData: any = { ...userData };
      if (password != null && String(password).length > 0) {
        updateData.password = hashPassword(String(password));
      }
      const user = await storage.updateUser(id, updateData);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ ...user, password: undefined });
    } catch (error) {
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  app.post("/api/users/:id/avatar", avatarUpload.single("avatar"), async (req, res) => {
    try {
      const { id } = req.params;
      const currentUser = req.user;
      if (!currentUser) return res.status(401).json({ message: "Требуется авторизация" });
      if (currentUser.id !== id) return res.status(403).json({ message: "Можно изменить только свой аватар" });
      if (!req.file) {
        return res.status(400).json({ message: "Файл не выбран" });
      }
      const avatarUrl = "/uploads/avatars/" + req.file.filename;
      const user = await storage.updateUser(id, { avatar: avatarUrl });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ ...user, password: undefined, avatar: avatarUrl });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось загрузить аватар" });
    }
  });

  app.delete("/api/users/:id", async (req, res) => {
    try {
      if (!requirePlatformAdmin(req, res)) return;
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
    try {
      const computers = await withDbTimeout(() => storage.getComputers(), 5000, []);
      res.json(Array.isArray(computers) ? computers : []);
    } catch (e: any) {
      console.warn("[API] GET /api/computers:", e?.message || e);
      res.json([]);
    }
  });

  app.post("/api/computers", async (req, res) => {
    try {
      const body = req.body || {};
      const data = {
        name: body.name ?? "",
        location: body.location ?? "",
        purpose: body.purpose ?? undefined,
        status: body.status ?? "active",
        ipAddress: body.ipAddress ?? undefined,
        components: body.components ?? undefined,
        notes: body.notes ?? undefined,
      };
      const computer = await storage.createComputer(data as any);
      res.status(201).json(computer);
    } catch (error: any) {
      console.error("[API] POST /api/computers:", error?.message || error);
      res.status(500).json({ message: error?.message || "Failed to create computer" });
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

  // Привязка набора оборудования к проекту (корзина → проект). Обязательны: дата возврата, сотрудник.
  const projectEquipmentBundles: Array<{
    projectId: string;
    equipmentIds: string[];
    sentAt: string;
    returnDate: string;
    assignedByUserId?: string;
    assignedByName: string;
  }> = [];
  app.post("/api/projects/:projectId/equipment-bundle", async (req, res) => {
    try {
      const { projectId } = req.params;
      const { equipmentIds, returnDate, assignedByUserId, assignedByName } = req.body || {};
      if (!Array.isArray(equipmentIds) || equipmentIds.length === 0) {
        return res.status(400).json({ message: "Укажите список оборудования (equipmentIds)" });
      }
      if (!returnDate || typeof returnDate !== "string") {
        return res.status(400).json({ message: "Укажите дату возврата оборудования (returnDate)" });
      }
      const project = await storage.getProjectById(projectId);
      if (!project && !isStubStorage) return res.status(404).json({ message: "Project not found" });
      const name = typeof assignedByName === "string" && assignedByName.trim() ? assignedByName.trim() : "Не указан";
      projectEquipmentBundles.push({
        projectId,
        equipmentIds,
        sentAt: new Date().toISOString(),
        returnDate: String(returnDate).slice(0, 10),
        assignedByUserId: assignedByUserId || undefined,
        assignedByName: name,
      });
      res.json({ success: true, message: "Оборудование привязано к проекту", count: equipmentIds.length });
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Failed to attach equipment to project" });
    }
  });
  app.get("/api/projects/:projectId/equipment-bundles", async (req, res) => {
    const list = projectEquipmentBundles.filter((b) => b.projectId === req.params.projectId);
    res.json(list);
  });

  app.post("/api/equipment-return", async (req, res) => {
    try {
      const { equipmentId, userId: requestUserId } = req.body || {};
      const currentUserId = (req as any).user?.id ?? requestUserId;
      if (!equipmentId || typeof equipmentId !== "string") {
        return res.status(400).json({ message: "Укажите equipmentId" });
      }
      let found = false;
      let bundleAssignedBy: string | undefined;
      for (let i = projectEquipmentBundles.length - 1; i >= 0; i--) {
        const b = projectEquipmentBundles[i];
        const idx = b.equipmentIds.indexOf(equipmentId);
        if (idx !== -1) {
          found = true;
          bundleAssignedBy = b.assignedByUserId;
          const isAdmin = (req as any).user?.role === "admin" || (req as any).user?.role === "tech_director";
          const canReturn = isAdmin || (currentUserId && bundleAssignedBy === currentUserId);
          if (!canReturn) {
            return res.status(403).json({ message: "Вернуть оборудование может только тот, кто отправил его на проект, или администратор." });
          }
          b.equipmentIds.splice(idx, 1);
          if (b.equipmentIds.length === 0) projectEquipmentBundles.splice(i, 1);
          break;
        }
      }
      if (!found) {
        return res.status(404).json({ message: "Оборудование не найдено на проекте или уже возвращено. Обновите страницу." });
      }
      res.json({ success: true, message: "Оборудование возвращено на склад" });
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Не удалось вернуть" });
    }
  });

  // Сводка: какое оборудование на каких проектах (assignedByUserId — чтобы вернуть мог только тот, кто отправил)
  app.get("/api/equipment-on-projects", async (_req, res) => {
    const flat: Array<{ equipmentId: string; projectId: string; projectName?: string; sentAt: string; returnDate: string; assignedByName: string; assignedByUserId?: string }> = [];
    const projectIds = [...new Set(projectEquipmentBundles.map((b) => b.projectId))];
    const projectNames: Record<string, string> = {};
    await Promise.all(projectIds.map(async (id) => {
      try {
        const p = await storage.getProjectById(id);
        if (p?.name) projectNames[id] = p.name;
      } catch (_) {}
    }));
    for (const b of projectEquipmentBundles) {
      for (const equipmentId of b.equipmentIds) {
        flat.push({
          equipmentId,
          projectId: b.projectId,
          projectName: projectNames[b.projectId],
          sentAt: b.sentAt,
          returnDate: b.returnDate,
          assignedByName: b.assignedByName,
          assignedByUserId: b.assignedByUserId,
        });
      }
    }
    res.json(flat);
  });

  // Projects
  app.get("/api/projects", async (req, res) => {
    const currentUser = req.user as any;
    if (!currentUser?.id) return res.json([]);
    const projects = await withDbTimeout(
      () => storage.getProjects(),
      3000, // 3 секунды для быстрого ответа
      [] // Пустой массив по умолчанию
    );
    const permissions = Array.isArray(currentUser.permissions) ? currentUser.permissions : [];
    if (currentUser.role === "admin" && permissions.includes("platform:admin")) {
      return res.json(projects);
    }
    const companyIds = await getUserCompanyIds(currentUser).catch(() => []);
    const companyIdSet = new Set((companyIds || []).map((id: any) => String(id)));
    const userId = String(currentUser.id);
    res.json((projects as any[]).filter((project) => {
      const participants = Array.isArray(project?.participants) ? project.participants.map(String) : [];
      return (
        (project.companyId && companyIdSet.has(String(project.companyId))) ||
        String(project.ownerId || "") === userId ||
        String(project.assignedTo || "") === userId ||
        participants.includes(userId)
      );
    }));
  });

  app.post("/api/projects", async (req, res) => {
    try {
      const currentUser = req.user as any;
      const { deadline, ...rest } = req.body;
      if (!rest.ownerId && currentUser?.id) rest.ownerId = currentUser.id;
      if (!rest.companyId && currentUser?.id) {
        const companyIds = await getUserCompanyIds(currentUser).catch(() => []);
        if (companyIds[0]) rest.companyId = companyIds[0];
      }
      const projectData = {
        ...rest,
        deadline: deadline && deadline !== "" ? new Date(deadline) : null,
      };
      const project = await storage.createProject(projectData);
      res.status(201).json(project);
    } catch (error: any) {
      console.error("Error creating project:", error);
      const msg = (error.message || "").toLowerCase();
      const isDb = /timeout|econnrefused|connection|password|auth|database/i.test(msg);
      res.status(500).json({
        message: isDb
          ? "Ошибка подключения к базе данных. Проверьте PostgreSQL и DATABASE_URL в .env."
          : (error.message || "Не удалось создать проект"),
      });
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

  /** Статистика по задачам проекта (для доски YouGile или по projectId). statusNames — id колонки → название для отображения. */
  app.get("/api/projects/:id/task-stats", async (req, res) => {
    try {
      const project = await storage.getProjectById(req.params.id);
      if (!project) return res.status(404).json({ message: "Проект не найден" });
      const proj = project as any;
      let tasks: any[] = [];
      if (proj.yougileBoardId) {
        tasks = await storage.getTasksByYougileBoardId(proj.yougileBoardId);
      } else {
        const all = await storage.getTasks();
        tasks = all.filter((t: any) => t.projectId === project.id);
      }
      const total = tasks.length;
      let statusNames: Record<string, string> = {};
      let doneColumnId: string | null = null;
      if (proj.yougileBoardId) {
        try {
          const cols = await storage.getYougileColumns(proj.yougileBoardId);
          cols.forEach((c: any) => { statusNames[c.id] = c.title || c.id; });
          const sorted = [...cols].sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
          const lastCol = sorted[sorted.length - 1];
          if (lastCol) doneColumnId = lastCol.id;
        } catch (_) {}
      } else {
        try {
          const cols = await storage.getProjectColumns(project.id);
          cols.forEach((c: any) => { statusNames[c.id] = c.name || c.id; });
          const sorted = [...cols].sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
          const lastCol = sorted[sorted.length - 1];
          if (lastCol) doneColumnId = lastCol.id;
        } catch (_) {}
      }
      const done = doneColumnId
        ? tasks.filter((t: any) => t.status === doneColumnId).length
        : tasks.filter((t: any) => t.status === "done").length;
      const byStatus: Record<string, number> = {};
      const byUser: Record<string, number> = {};
      const byRepository: Record<string, number> = {};
      const byCategory: Record<string, number> = {};
      tasks.forEach((t: any) => {
        const s = t.status || "todo";
        byStatus[s] = (byStatus[s] || 0) + 1;
        if (t.assigneeId) byUser[t.assigneeId] = (byUser[t.assigneeId] || 0) + 1;
        const repo = (t.repository || "").toString().trim();
        if (repo) byRepository[repo] = (byRepository[repo] || 0) + 1;
        const cat = (t.category || "").toString().trim();
        if (cat) byCategory[cat] = (byCategory[cat] || 0) + 1;
      });
      const userIds = Object.keys(byUser);
      const userNames: Record<string, string> = {};
      if (userIds.length > 0) {
        const users = await storage.getUsers();
        users.forEach((u: any) => { if (u.id && userIds.includes(u.id)) userNames[u.id] = u.name || u.username || u.id; });
      }
      const categoryLabels: Record<string, string> = {
        production: "Производство",
        equipment: "Оборудование",
        stream: "Стрим",
        admin: "Администрирование",
        other: "Другое",
      };
      res.json({ total, done, byStatus, statusNames, byUser, byRepository, byCategory, userNames, categoryLabels });
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Ошибка" });
    }
  });

  /** Привязать видеопроект к доске YouGile (доска появится в таск-менеджере, колонки создаются в YouGile) */
  app.post("/api/projects/:id/link-yougile-board", async (req, res) => {
    try {
      const project = await storage.getProjectById(req.params.id);
      if (!project) return res.status(404).json({ message: "Проект не найден" });
      const existing = (project as any).yougileBoardId;
      if (existing) {
        return res.json({ yougileBoardId: existing, message: "Доска уже привязана" });
      }
      const {
        isYouGileConfigured,
        yougileGetProjects,
        yougileCreateProject,
        yougileCreateBoard,
      } = await import("./yougile");
      if (!isYouGileConfigured()) {
        return res.status(400).json({ message: "YouGile не настроен. Настройте в Настройках." });
      }
      let ygProjects = await yougileGetProjects();
      if (!ygProjects.length) {
        const created = await yougileCreateProject("StreamDesk");
        ygProjects = [created];
      }
      const ygProjectId = ygProjects[0].id;
      const board = await yougileCreateBoard(ygProjectId, project.name || "Проект");
      await storage.updateProject(project.id, { yougileBoardId: board.id } as any);
      res.json({ yougileBoardId: board.id, message: "Доска создана в таск-менеджере" });
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Не удалось создать доску YouGile" });
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
      const columnName = String(name || "").trim();
      if (!columnName) {
        return res.status(400).json({ message: "Введите название столбца" });
      }
      const project = await storage.getProjectById(projectId);
      if (!project) {
        return res.status(404).json({ message: "Доска не найдена" });
      }

      // Получаем текущие столбцы для определения следующего order
      const existingColumns = await storage.getProjectColumns(projectId);
      const nextOrder = existingColumns.length;

      const column = await storage.createProjectColumn({
        projectId,
        name: columnName,
        color: color || null,
        order: nextOrder,
      });

      res.status(201).json(column);
    } catch (error: any) {
      console.error("Error creating project column:", error);
      const msg = (error.message || "").toLowerCase();
      const isDb = /timeout|econnrefused|connection|password|auth|database/i.test(msg);
      res.status(500).json({
        message: isDb
          ? "Ошибка подключения к базе данных. Проверьте PostgreSQL и DATABASE_URL в .env."
          : (error.message || "Не удалось создать столбец"),
      });
    }
  });

  app.put("/api/projects/:projectId/columns/:id", async (req, res) => {
    try {
      const updateData: any = {};
      if (req.body?.name !== undefined) {
        const name = String(req.body.name || "").trim();
        if (!name) return res.status(400).json({ message: "Введите название столбца" });
        updateData.name = name;
      }
      if (req.body?.color !== undefined) updateData.color = req.body.color || null;
      if (req.body?.order !== undefined) updateData.order = Number(req.body.order) || 0;
      const column = await storage.updateProjectColumn(req.params.id, updateData);
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
      const currentUser = req.user;
      if (!currentUser) return res.status(401).json({ message: "Требуется авторизация" });
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
      const currentUser = req.user;
      if (!currentUser) return res.status(401).json({ message: "Требуется авторизация" });
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
      const currentUser = req.user;
      if (!currentUser) return res.status(401).json({ message: "Требуется авторизация" });
      if (currentUser.role !== 'admin') {
        return res.status(403).json({ message: "Только администратор может удалять репозитории" });
      }
      await storage.deleteRepository(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete repository" });
    }
  });

  // ——— YouGile API (двусторонняя синхронизация задач, https://ru.yougile.com/api-v2#/) ———
  const {
    isYouGileConfigured,
    yougileGetAuthKey,
    setYouGileApiKey,
    yougileGetProjects,
    yougileGetBoards,
    yougileGetColumns,
    yougileGetTasks,
    yougileGetUsers,
    yougileCreateTask,
    yougileUpdateTask,
    yougileDeleteTask,
    getYouGileColumnMap,
    setYouGileColumnMap,
  } = await import("./yougile");

  /** Получить API-ключ по логину и паролю YouGile (companyId берётся из YOUGILE_COMPANY_ID в .env) и сохранить в файл .yougile-key */
  app.post("/api/yougile/auth/key", async (req, res) => {
    try {
      const companyId = (process.env.YOUGILE_COMPANY_ID || "").trim();
      if (!companyId) {
        return res.status(400).json({ message: "Задайте YOUGILE_COMPANY_ID в .env" });
      }
      const { login, password } = req.body || {};
      if (!login || !password) {
        return res.status(400).json({ message: "Укажите login и password в теле запроса" });
      }
      const { key } = await yougileGetAuthKey(String(login), String(password), companyId);
      if (!key) {
        return res.status(500).json({ message: "YouGile не вернул ключ" });
      }
      setYouGileApiKey(key);
      res.json({ success: true, message: "Ключ сохранён. YouGile готов к работе." });
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Не удалось получить ключ YouGile" });
    }
  });

  app.get("/api/yougile/config", (req, res) => {
    res.json({
      enabled: isYouGileConfigured(),
      companyId: process.env.YOUGILE_COMPANY_ID || null,
      defaultColumnId: process.env.YOUGILE_DEFAULT_COLUMN_ID || null,
    });
  });

  app.get("/api/yougile/status", (req, res) => {
    res.json({ configured: isYouGileConfigured() });
  });

  /** Проекты YouGile — из БД (без запросов к API). При ?sync=1 — сначала синхронизация кэша из YouGile, затем ответ из БД. */
  app.get("/api/yougile/projects", async (req, res) => {
    try {
      if (!isYouGileConfigured()) return res.json([]);
      const forceSync = req.query.sync === "1" || req.query.sync === "true";
      if (forceSync) {
        const { clearYougileCache } = await import("./yougile");
        clearYougileCache();
        const ygProjects = await yougileGetProjects();
        await storage.upsertYougileProjects(ygProjects.map((p: any) => ({ id: p.id, title: p.title ?? null })));
        for (const p of ygProjects) {
          const boards = await yougileGetBoards(p.id);
          await storage.upsertYougileBoards(boards.map((b: any) => ({ id: b.id, projectId: b.projectId || p.id, title: b.title ?? null })));
          for (const b of boards) {
            const cols = await yougileGetColumns(b.id);
            await storage.upsertYougileColumns(cols.map((c: any) => ({ id: c.id, boardId: b.id, title: c.title ?? null, order: c.order ?? 0, color: (c as any).color ?? null })));
          }
        }
        const ygUsers = await yougileGetUsers().catch(() => []);
        await storage.upsertYougileUsers(ygUsers.map((u: any) => ({ id: u.id, email: u.email ?? null, username: u.username ?? null })));
      }
      const list = await storage.getYougileProjects();
      res.json(list.map((p: any) => ({ id: p.id, title: p.title ?? undefined })));
    } catch (e: any) {
      if (!res.headersSent) res.status(500).json({ message: e?.message || "Ошибка YouGile" });
    }
  });

  /** Доски YouGile — из БД. При ?sync=1 — обновление кэша (см. GET /api/yougile/projects?sync=1). */
  app.get("/api/yougile/boards", async (req, res) => {
    try {
      if (!isYouGileConfigured()) return res.status(400).json({ message: "YouGile не настроен" });
      const projectId = req.query.projectId as string | undefined;
      const list = await storage.getYougileBoards(projectId);
      res.json(list.map((b: any) => ({ id: b.id, title: b.title ?? undefined, projectId: b.projectId })));
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Ошибка YouGile API" });
    }
  });

  /** Все доски YouGile — из БД (для таск-менеджера). */
  app.get("/api/yougile/boards-all", async (req, res) => {
    try {
      if (!isYouGileConfigured()) return res.json([]);
      const list = await storage.getYougileBoards();
      res.json(list.map((b: any) => ({ id: b.id, title: b.title || "Без названия", projectId: b.projectId })));
    } catch (e: any) {
      res.json([]);
    }
  });

  /** Синхронизация: для каждой доски YouGile создаётся локальный видеопроект, если его ещё нет (чтобы проекты из YouGile сразу появлялись в видеопроектах). */
  app.post("/api/yougile/sync-projects", async (req, res) => {
    try {
      if (!isYouGileConfigured()) {
        return res.json({ synced: 0, message: "YouGile не настроен" });
      }
      const existing = await storage.getProjects();
      const linkedBoardIds = new Set((existing as any[]).map((p: any) => p.yougileBoardId).filter(Boolean));
      const projects = await yougileGetProjects();
      let created = 0;
      for (const p of projects) {
        const boards = await yougileGetBoards(p.id);
        for (const b of boards) {
          if (linkedBoardIds.has(b.id)) continue;
          await storage.createProject({
            name: (b.title || p.title || "Проект YouGile").trim() || "Проект YouGile",
            status: "planning",
            yougileBoardId: b.id,
          } as any);
          linkedBoardIds.add(b.id);
          created++;
        }
      }
      res.json({ synced: created });
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Ошибка синхронизации" });
    }
  });

  /** Колонки доски YouGile — из БД. При ?sync=1 — подтянуть колонки этой доски из API в БД и вернуть. */
  app.get("/api/yougile/columns", async (req, res) => {
    try {
      if (!isYouGileConfigured()) return res.status(400).json({ message: "YouGile не настроен" });
      const boardId = req.query.boardId as string;
      if (!boardId) return res.status(400).json({ message: "boardId обязателен" });
      const forceSync = req.query.sync === "1" || req.query.sync === "true";
      if (forceSync) {
        const { clearYougileCache } = await import("./yougile");
        clearYougileCache();
        const cols = await yougileGetColumns(boardId);
        await storage.upsertYougileColumns(cols.map((c: any) => ({ id: c.id, boardId, title: c.title ?? null, order: c.order ?? 0, color: (c as any).color ?? null })));
      }
      const list = await storage.getYougileColumns(boardId);
      res.json(list.map((c: any) => ({ id: c.id, title: c.title ?? undefined, boardId: c.boardId, order: c.order ?? 0, color: c.color ?? undefined })));
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Ошибка YouGile API" });
    }
  });

  /** Стикеры/фильтры доски YouGile с типом и опциями: list (выпадающий список), string (ввод текста), user (исполнитель). */
  app.get("/api/yougile/stickers", async (req, res) => {
    try {
      const { yougileGetStringStickerStates, yougileGetStringStickerValues, isYouGileConfigured } = await import("./yougile");
      if (!isYouGileConfigured()) return res.status(400).json({ message: "YouGile не настроен" });
      const boardId = req.query.boardId as string;
      if (!boardId) return res.status(400).json({ message: "boardId обязателен" });
      const list = await yougileGetStringStickerStates(boardId);
      const withOptions = await Promise.all(list.map(async (s: any) => {
        const title = ((s.title ?? s.id) || "").toString().trim();
        let type = (s.type || "").toString().toLowerCase();
        if (!type && /исполнитель|assignee|performer/i.test(title)) type = "user";
        let options = Array.isArray(s.options) ? s.options : undefined;
        if (!options && type !== "user" && s.id) {
          try {
            const values = await yougileGetStringStickerValues(s.id);
            if (values.length > 0) options = values.map((v: any) => ({ id: v.id ?? v.title, title: v.title ?? v.id }));
          } catch {
            /* ignore */
          }
        }
        if (options && options.length > 0 && !type) type = "list";
        if (!type) type = "string";
        return {
          id: s.id,
          title: title || s.id,
          boardId: s.boardId,
          order: s.order ?? 0,
          type,
          options: options && options.length > 0 ? options : undefined,
        };
      }));
      res.json(withOptions);
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Ошибка YouGile API" });
    }
  });

  /** Создать колонку на доске YouGile (для видеопроекта: добавить колонку в таск-менеджер) */
  app.post("/api/yougile/columns", async (req, res) => {
    try {
      const { isYouGileConfigured, yougileCreateColumn } = await import("./yougile");
      if (!isYouGileConfigured()) {
        return res.status(400).json({ message: "YouGile не настроен" });
      }
      const { boardId, title, color } = req.body || {};
      if (!boardId || !title || typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ message: "Укажите boardId и title" });
      }
      const column = await yougileCreateColumn(boardId, title.trim(), color);
      res.status(201).json(column);
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Ошибка создания колонки YouGile" });
    }
  });

  app.get("/api/yougile/column-map", (req, res) => {
    try {
      res.json(getYouGileColumnMap());
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Ошибка чтения маппинга колонок" });
    }
  });

  app.post("/api/yougile/column-map", (req, res) => {
    try {
      const map = req.body && typeof req.body === "object" ? req.body : {};
      const normalized: Record<string, string> = {};
      for (const [k, v] of Object.entries(map)) {
        if (typeof k === "string" && typeof v === "string" && v.trim()) normalized[k.trim()] = v.trim();
      }
      setYouGileColumnMap(normalized);
      res.json(normalized);
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Не удалось сохранить маппинг колонок" });
    }
  });

  /** Преобразует задачу из БД в формат YouGile (для ответов API). */
  function mapDbTaskToYouGileTask(t: any, boardIdToProjectId?: Map<string, string>): Record<string, unknown> {
    const boardId = t.yougileBoardId ?? undefined;
    const projectId = boardId && boardIdToProjectId ? boardIdToProjectId.get(boardId) : undefined;
    return {
      id: t.yougileTaskId || t.id,
      title: t.title,
      description: t.description ?? undefined,
      columnId: t.status ?? undefined,
      boardId,
      projectId,
      deadline: t.dueDate ? new Date(t.dueDate).getTime() : undefined,
      status: t.status,
      tags: t.tags ?? [],
      subtasks: t.subtasks ?? [],
      assigned: [],
    };
  }

  app.get("/api/yougile/tasks/:yougileTaskId", async (req, res) => {
    try {
      const { yougileTaskId } = req.params;
      if (!isYouGileConfigured()) {
        return res.status(400).json({ message: "YouGile не настроен" });
      }
      const task = await storage.getTaskByYougileTaskId(yougileTaskId);
      if (!task) return res.status(404).json({ message: "Задача YouGile не найдена" });
      const boards = await storage.getYougileBoards();
      const boardIdToProjectId = new Map(boards.map((b: any) => [b.id, b.projectId]));
      res.json(mapDbTaskToYouGileTask(task, boardIdToProjectId));
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Ошибка YouGile API" });
    }
  });

  /** Список задач YouGile — из БД (без обращения к API). Синхронизация с YouGile выполняется отдельно через POST /api/yougile/sync. */
  app.get("/api/yougile/tasks", async (req, res) => {
    try {
      if (!isYouGileConfigured()) {
        return res.status(400).json({ message: "YouGile не настроен" });
      }
      const projectId = req.query.projectId as string | undefined;
      const boardId = req.query.boardId as string | undefined;
      const columnId = req.query.columnId as string | undefined;
      const title = req.query.title as string | undefined;
      const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
      const offset = req.query.offset != null ? Number(req.query.offset) : undefined;

      let tasks: any[] = [];
      if (boardId) {
        tasks = await storage.getTasksByYougileBoardId(boardId);
      } else if (projectId) {
        const boards = await storage.getYougileBoards(projectId);
        const seen = new Set<string>();
        for (const b of boards) {
          const byBoard = await storage.getTasksByYougileBoardId(b.id);
          for (const t of byBoard) {
            if (!seen.has(t.id)) {
              seen.add(t.id);
              tasks.push(t);
            }
          }
        }
      } else {
        const all = await storage.getTasks();
        tasks = all.filter((t: any) => t.yougileBoardId);
      }

      if (columnId) tasks = tasks.filter((t: any) => t.status === columnId);
      if (title && title.trim()) {
        const q = title.trim().toLowerCase();
        tasks = tasks.filter((t: any) => (t.title || "").toLowerCase().includes(q));
      }
      const total = tasks.length;
      if (offset != null || limit != null) {
        const off = Math.max(0, offset ?? 0);
        const lim = limit ?? total;
        tasks = tasks.slice(off, off + lim);
      }

      const boards = await storage.getYougileBoards();
      const boardIdToProjectId = new Map(boards.map((b: any) => [b.id, b.projectId]));
      const list = tasks.map((t) => mapDbTaskToYouGileTask(t, boardIdToProjectId));
      res.json(list);
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "Ошибка YouGile API" });
    }
  });

  /** Синхронизация из YouGile в БД (кэш проектов/досок/колонок/пользователей + задачи). Без boardId — все доски; с boardId — только эта доска. */
  app.post("/api/yougile/sync", async (req, res) => {
    try {
      if (!isYouGileConfigured()) {
        return res.status(400).json({ message: "YouGile не настроен. Добавьте YOUGILE_API_KEY в .env" });
      }
      const { clearYougileCache } = await import("./yougile");
      clearYougileCache();

      const ygProjects = await yougileGetProjects();
      await storage.upsertYougileProjects(ygProjects.map((p: any) => ({ id: p.id, title: p.title ?? null })));
      for (const p of ygProjects) {
        const boards = await yougileGetBoards(p.id);
        await storage.upsertYougileBoards(boards.map((b: any) => ({ id: b.id, projectId: b.projectId || p.id, title: b.title ?? null })));
        for (const b of boards) {
          const cols = await yougileGetColumns(b.id);
          await storage.upsertYougileColumns(cols.map((c: any) => ({ id: c.id, boardId: b.id, title: c.title ?? null, order: c.order ?? 0, color: (c as any).color ?? null })));
        }
      }
      const ygUsers = await yougileGetUsers().catch(() => []);
      await storage.upsertYougileUsers(ygUsers.map((u: any) => ({ id: u.id, email: u.email ?? null, username: u.username ?? null })));

      const { projectId, boardId, columnId } = req.body || {};
      const currentUser = req.user;
      const creatorId = (currentUser?.id as string) || (await storage.getUsers()).find(u => u.role === "admin")?.id;
      if (!creatorId) {
        return res.status(400).json({ message: "Нужна авторизация для синхронизации" });
      }
      let allYgTasks: Array<{ id: string; title?: string; description?: string; columnId?: string; boardId?: string; deadline?: any }> = [];
      if (boardId || projectId || columnId) {
        allYgTasks = await yougileGetTasks({ projectId, boardId, columnId });
      } else {
        for (const p of ygProjects) {
          const boards = await yougileGetBoards(p.id);
          for (const b of boards) {
            const tasks = await yougileGetTasks({ boardId: b.id });
            allYgTasks.push(...tasks);
          }
        }
      }
      let created = 0;
      let updated = 0;
      const yougileIdToEmail = new Map<string, string>();
      for (const u of ygUsers) {
        const email = (u.email || u.username || "").toString().trim().toLowerCase();
        if (email && u.id) yougileIdToEmail.set(u.id, email);
      }
      const crmUsers = await storage.getUsers();
      const emailToCrmUserId = new Map<string, string>();
      for (const u of crmUsers) {
        const email = (u.email || "").toString().trim().toLowerCase();
        if (email && u.id) emailToCrmUserId.set(email, u.id);
      }
      const { yougileGetTaskById } = await import("./yougile");
      for (const yt of allYgTasks) {
        const existing = await storage.getTaskByYougileTaskId(yt.id);
        let ytRes = yt as any;
        if (!Array.isArray(ytRes.tags) || ytRes.tags.length === 0) {
          const full = await yougileGetTaskById(yt.id).catch(() => null);
          if (full && Array.isArray((full as any).tags) && (full as any).tags.length > 0) {
            ytRes = { ...ytRes, tags: (full as any).tags };
          } else if (full && Array.isArray((full as any).tagIds) && (full as any).tagIds.length > 0) {
            ytRes = { ...ytRes, tagIds: (full as any).tagIds };
          }
        }
        const yougileColumnId = ytRes.columnId ?? yt.columnId;
        const status = yougileColumnId || "todo";
        const deadlineMs = typeof ytRes.deadline === "number" ? ytRes.deadline : (ytRes.deadline && typeof ytRes.deadline === "object" && "deadline" in (ytRes.deadline as object)) ? (ytRes.deadline as { deadline?: number }).deadline : undefined;
        const dueDate = deadlineMs ? new Date(deadlineMs) : undefined;
        const assigned = Array.isArray(ytRes.assigned) ? ytRes.assigned as string[] : [];
        let assigneeId: string | undefined;
        for (const ygId of assigned) {
          const email = yougileIdToEmail.get(ygId);
          if (email) {
            const crmId = emailToCrmUserId.get(email);
            if (crmId) {
              assigneeId = crmId;
              break;
            }
          }
        }
        const ytTags = ytRes.tags ?? ytRes.tagIds;
        const tags = Array.isArray(ytTags)
          ? ytTags.map((t: any) => (typeof t === "object" && t !== null && ("id" in t || "name" in t)) ? { id: t.id ?? t.name, name: t.name ?? t.id, color: t.color } : { id: String(t), name: String(t) })
          : undefined;
        const ytSubtasks = (ytRes as any).checklist ?? (ytRes as any).subtasks;
        const subtasks = Array.isArray(ytSubtasks)
          ? ytSubtasks.map((s: any) => ({ id: s.id ?? `st-${Math.random().toString(36).slice(2)}`, title: typeof s === "string" ? s : (s.title ?? s.name ?? ""), completed: !!s.completed }))
          : undefined;
        const payload: any = {
          title: yt.title || "Без названия",
          description: yt.description ?? undefined,
          status,
          priority: "medium",
          creatorId,
          assigneeId,
          dueDate,
          yougileTaskId: yt.id,
          yougileBoardId: yt.boardId ?? undefined,
        };
        if (tags !== undefined) payload.tags = tags;
        if (subtasks !== undefined) payload.subtasks = subtasks;
        if (existing) {
          await storage.updateTask(existing.id, payload);
          updated++;
        } else {
          await storage.createTask(payload as any);
          created++;
        }
      }
      res.json({ success: true, created, updated, total: allYgTasks.length });
    } catch (e: any) {
      const msg = e?.message != null ? String(e.message) : "Ошибка синхронизации YouGile";
      if (!res.headersSent) res.status(500).json({ message: msg });
    }
  });

  // HTTPS: если заданы пути к сертификатам — трафик шифруется (логин/пароль не видны в Wireshark)
  let server: Server;
  const certPath = process.env.SSL_CERT_PATH;
  const keyPath = process.env.SSL_KEY_PATH;
  if (certPath && keyPath) {
    try {
      const key = fs.readFileSync(keyPath, "utf8");
      const cert = fs.readFileSync(certPath, "utf8");
      server = createHttpsServer({ key, cert }, app);
      console.log("[Security] HTTPS включён — логин и пароль передаются в шифрованном виде");
    } catch (e: any) {
      console.error("[Security] Ошибка загрузки SSL:", e?.message);
      server = createHttpServer(app);
    }
  } else {
    server = createHttpServer(app);
    if (process.env.NODE_ENV === "production") {
      console.warn("[Security] Задайте SSL_CERT_PATH и SSL_KEY_PATH в .env для защиты от перехвата логина/пароля.");
    }
  }

  // WebSocket server for real-time updates
  const wss = new WebSocketServer({ server, path: '/ws' });

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

  function normalizeEstimateText(value: unknown) {
    return String(value ?? "").toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}0-9]+/gu, " ").trim();
  }

  function readEstimatePrice(item: any) {
    const spec = item?.specifications && typeof item.specifications === "object" ? item.specifications : {};
    for (const key of ["estimatePrice", "estimate_price", "estimateUnitPrice", "unitPrice", "price", "cost", "цена", "стоимость"]) {
      const raw = spec[key];
      const value = Number(String(raw ?? "").replace(/\s+/g, "").replace(",", ".").replace(/[^\d.]/g, ""));
      if (Number.isFinite(value) && value > 0) return { value, source: key };
    }
    return { value: 0, source: "" };
  }

  function buildEstimateLine(item: any, quantity: number, reason: string, index: number) {
    const price = readEstimatePrice(item);
    const baseTotal = Math.round(quantity * price.value * 100) / 100;
    const availableQty = item.status === "available" ? 1 : 0;
    return {
      lineId: `auto-${item.id}-${index}`,
      catalogId: item.id,
      equipmentIds: [item.id],
      name: item.name,
      type: item.type || "other",
      model: item.model || "",
      quantity,
      availableQty,
      totalQty: 1,
      unitPrice: price.value,
      baseTotal,
      shiftFactor: 1,
      total: baseTotal,
      priceSource: price.source,
      availability: availableQty >= quantity ? "in_stock" : availableQty > 0 ? "partial" : "unavailable",
      priceStatus: price.value > 0 ? "priced" : "no_price",
      confidence: 0.75,
      reason,
      locations: item.location ? [item.location] : [],
    };
  }

  const estimatePriceGuide = [
    { keys: ["rcf art 315", "акустическая система", "акустика"], name: "Активная акустическая система RCF ART 315 MK4", type: "audio", unitPrice: 1550 },
    { keys: ["shure slxd14", "инструментальная радиосистема"], name: "Инструментальная цифровая радиосистема Shure SLXD14", type: "microphone", unitPrice: 2250 },
    { keys: ["shure ulxd", "вокальная радиосистема"], name: "Вокальная цифровая радиосистема Shure ULXD24/Beta58", type: "microphone", unitPrice: 3060 },
    { keys: ["behringer x32", "x32"], name: "Цифровой микшерный пульт Behringer X32", type: "audio", unitPrice: 4550 },
    { keys: ["behringer wing", "wing"], name: "Цифровой микшерный пульт Behringer WING", type: "audio", unitPrice: 11150 },
    { keys: ["midas dl251", "блок входов выходов"], name: "48-канальный блок входов-выходов Midas DL251", type: "audio", unitPrice: 11150 },
    { keys: ["dlive c2500", "allen heath"], name: "Allen & Heath dLive C2500", type: "audio", unitPrice: 18000 },
    { keys: ["cdm48", "mixrack"], name: "Allen & Heath dLive CDM48 MixRack", type: "audio", unitPrice: 18000 },
    { keys: ["l-acoustics kara", "kara"], name: "Элемент линейного массива L-Acoustics Kara", type: "audio", unitPrice: 4500 },
    { keys: ["l-acoustics sb28", "sb28"], name: "Сабвуфер L-Acoustics SB28", type: "audio", unitPrice: 6000 },
    { keys: ["l-acoustics sb18", "sb18"], name: "Сабвуфер L-Acoustics SB18", type: "audio", unitPrice: 4550 },
    { keys: ["la-rack", "усилением"], name: "Кейс с усилением L-Acoustics LA-rack", type: "audio", unitPrice: 18000 },
    { keys: ["lightsky wash", "wash tx1940"], name: "Интеллектуальный световой прибор LightSky Wash TX1940ZOOM", type: "lighting", unitPrice: 3300 },
    { keys: ["lightsky beam", "beam f230"], name: "Интеллектуальный световой прибор LightSky Beam F230II", type: "lighting", unitPrice: 3300 },
    { keys: ["super scope"], name: "Интеллектуальный световой прибор LightSky Super Scope II", type: "lighting", unitPrice: 5950 },
    { keys: ["sunstrip"], name: "Световой прибор Showtec Sunstrip Active MK2", type: "lighting", unitPrice: 2000 },
    { keys: ["vintage blaze"], name: "Световой прибор Showtec Vintage Blaze 55", type: "lighting", unitPrice: 3500 },
    { keys: ["ma2 command wing"], name: "Контроллер управления Ma2 Command Wing", type: "lighting", unitPrice: 3700 },
    { keys: ["ma2 fader wing"], name: "Контроллер управления Ma2 Fader Wing", type: "lighting", unitPrice: 4450 },
    { keys: ["dmx splitter", "сплиттер dmx"], name: "Сплиттер DMX 512 Signal Distributor", type: "lighting", unitPrice: 600 },
    { keys: ["landmx", "artnet"], name: "Yarilo LanDMX8 / ArtNET to DMX", type: "lighting", unitPrice: 1550 },
    { keys: ["hazer", "хейзер", "генератор тумана"], name: "Генератор тумана / хейзер", type: "effects", unitPrice: 3350 },
    { keys: ["led экран", "светодиодный экран", "p3"], name: "Светодиодный экран LED P3.9, кв. м", type: "display", unitPrice: 5250 },
    { keys: ["novastar vx1000", "vx1000"], name: "Видео процессор NovaStar VX1000", type: "video", unitPrice: 6670 },
    { keys: ["atem mini", "видеомикшер"], name: "Видеомикшер Blackmagic ATEM Mini", type: "video", unitPrice: 3350 },
    { keys: ["avermedia", "видеозахват"], name: "Видеозахват AverMedia Live Gamer Portable 2", type: "video", unitPrice: 2300 },
    { keys: ["resolume", "видеосервер"], name: "Видеосервер Resolume", type: "computer", unitPrice: 15500 },
    { keys: ["sony", "камера"], name: "Камера на штативе Sony", type: "camera", unitPrice: 10000 },
    { keys: ["коммутация видео"], name: "Комплект коммутации видео", type: "cable", unitPrice: 1100 },
    { keys: ["коммутация звук"], name: "Комплект коммутации звук", type: "cable", unitPrice: 1100 },
    { keys: ["коммутация dmx"], name: "Комплект коммутации DMX", type: "cable", unitPrice: 1000 },
    { keys: ["монтаж", "демонтаж"], name: "Монтаж/демонтаж, человеко-смена", type: "labor", unitPrice: 4000 },
    { keys: ["звукорежиссер", "foh"], name: "FOH инженер / звукорежиссер", type: "labor", unitPrice: 14000 },
    { keys: ["инженер видео"], name: "Инженер видео", type: "labor", unitPrice: 14000 },
    { keys: ["оператор свет"], name: "Оператор светового пульта", type: "labor", unitPrice: 10000 },
    { keys: ["грузовой транспорт", "транспорт"], name: "Грузовой транспорт", type: "transport", unitPrice: 6000 },
  ];

  function findEstimateGuidePrice(name: string, type = "") {
    const normalized = normalizeEstimateText(`${name} ${type}`);
    return estimatePriceGuide.find((item) => item.keys.some((key) => normalized.includes(normalizeEstimateText(key))));
  }

  const estimateFallbackPrices: Record<string, number> = {
    audio: 3500,
    microphone: 2500,
    camera: 9000,
    video: 4500,
    computer: 12000,
    display: 6000,
    lighting: 3000,
    network: 2500,
    power: 2000,
    cable: 1200,
    labor: 12000,
    transport: 6000,
    effects: 3500,
    accessory: 1000,
    other: 1500,
  };

  function inferFallbackEstimatePrice(name: string, type = "other") {
    const normalized = normalizeEstimateText(name);
    if (normalized.includes("led") || normalized.includes("светодиод")) return 5250;
    if (normalized.includes("камера")) return 10000;
    if (normalized.includes("микшер") || normalized.includes("пульт")) return 5000;
    if (normalized.includes("инженер") || normalized.includes("режиссер") || normalized.includes("оператор")) return 14000;
    if (normalized.includes("монтаж") || normalized.includes("демонтаж")) return 4000;
    if (normalized.includes("транспорт") || normalized.includes("доставка")) return 6000;
    if (normalized.includes("коммутац") || normalized.includes("кабель")) return 1200;
    return estimateFallbackPrices[type] ?? estimateFallbackPrices.other;
  }

  function inferEstimateProfile(normalized: string) {
    const has = (...keys: string[]) => keys.some((key) => normalized.includes(normalizeEstimateText(key)));
    return {
      conference: has("конференц", "форум", "панель", "спикер", "доклад", "презентац", "зал"),
      stream: has("трансляц", "стрим", "эфир", "запись", "youtube", "vk", "rutube", "онлайн"),
      concert: has("концерт", "сцена", "артист", "группа", "вокал", "dj", "диджей"),
      lighting: has("свет", "сцена", "атмосфер", "подсвет", "концерт", "вечерин"),
      led: has("led", "экран", "светодиод", "презентац", "контент", "видеоэкран"),
      hybrid: has("vks", "zoom", "teams", "гибрид", "удален", "онлайн подключ"),
      large: has("фестиваль", "площад", "улиц", "стадион", "большой зал", "1000", "2000"),
    };
  }

  const estimateProductionBlocks = [
    {
      when: (p: any) => p.conference || p.hybrid,
      items: [
        { name: "Комплект акустики для зала", type: "audio", quantity: 2, reason: "Основная озвучка речи и фонового звука в зале." },
        { name: "Цифровой микшерный пульт", type: "audio", quantity: 1, reason: "Сведение микрофонов, компьютеров, VKS и фоновой музыки." },
        { name: "Радиомикрофон ручной", type: "microphone", quantity: 4, reason: "Спикеры, модератор и вопросы из зала." },
        { name: "Петличная радиосистема", type: "microphone", quantity: 2, reason: "Спикеры с презентацией, чтобы руки оставались свободными." },
        { name: "Презентер / кликер", type: "accessory", quantity: 1, reason: "Управление презентацией на сцене." },
      ],
    },
    {
      when: (p: any) => p.stream || p.hybrid,
      items: [
        { name: "Камера на штативе", type: "camera", quantity: 2, reason: "Минимум общий и крупный планы для трансляции/записи." },
        { name: "Видеомикшер / режиссерский пульт", type: "video", quantity: 1, reason: "Переключение камер, презентации и графики в эфир." },
        { name: "Компьютер трансляции / vMix", type: "computer", quantity: 1, reason: "Кодирование эфира, титры, запись и отправка на платформу." },
        { name: "Рекордер или резервная запись", type: "video", quantity: 1, reason: "Локальная резервная запись мероприятия." },
        { name: "Монитор режиссера", type: "display", quantity: 1, reason: "Контроль программного сигнала и предпросмотра." },
      ],
    },
    {
      when: (p: any) => p.led,
      items: [
        { name: "LED экран / экран для презентации", type: "display", quantity: 1, reason: "Показ презентаций, заставок, таймера и контента." },
        { name: "Видеопроцессор для экрана", type: "video", quantity: 1, reason: "Корректная подача сигнала и масштабирование на экран." },
        { name: "Ноутбук/медиасервер презентаций", type: "computer", quantity: 1, reason: "Запуск презентаций и медиаконтента." },
      ],
    },
    {
      when: (p: any) => p.lighting || p.concert,
      items: [
        { name: "Световой прибор заливочный", type: "lighting", quantity: 6, reason: "Базовая сценическая заливка и подсветка спикеров/артистов." },
        { name: "Световой пульт / контроллер", type: "lighting", quantity: 1, reason: "Управление сценическим светом." },
        { name: "DMX сплиттер и коммутация", type: "cable", quantity: 1, reason: "Разводка управления светом по площадке." },
      ],
    },
    {
      when: (p: any) => p.concert,
      items: [
        { name: "Сабвуфер", type: "audio", quantity: 2, reason: "Низкочастотная поддержка музыкальной программы." },
        { name: "Сценический монитор", type: "audio", quantity: 4, reason: "Мониторинг для артистов на сцене." },
        { name: "Комплект микрофонов для сцены", type: "microphone", quantity: 6, reason: "Вокал, инструменты и запасные каналы." },
      ],
    },
    {
      when: () => true,
      items: [
        { name: "Комплект видео-коммутации", type: "cable", quantity: 1, reason: "SDI/HDMI кабели, переходники и резерв для подключения видео." },
        { name: "Комплект аудио-коммутации", type: "cable", quantity: 1, reason: "XLR, DI-box/переходники и резервные линии для звука." },
        { name: "Комплект силовой коммутации", type: "power", quantity: 1, reason: "Питание оборудования, удлинители, распределение нагрузки." },
        { name: "Сетевой комплект", type: "network", quantity: 1, reason: "LAN/Wi-Fi, резервная сеть и подключение оборудования." },
        { name: "Монтаж/демонтаж, человеко-смена", type: "labor", quantity: 2, reason: "Погрузка, монтаж, настройка и демонтаж оборудования." },
        { name: "Технический руководитель / инженер проекта", type: "labor", quantity: 1, reason: "Ответственный за схему, тайминг, площадку и запуск." },
        { name: "Звукорежиссер", type: "labor", quantity: 1, reason: "Настройка и ведение звука во время мероприятия." },
        { name: "Видеоинженер / режиссер трансляции", type: "labor", quantity: 1, reason: "Контроль камер, сигнала, записи и вывода на экран/эфир." },
        { name: "Грузовой транспорт", type: "transport", quantity: 1, reason: "Доставка оборудования на площадку и обратно." },
      ],
    },
  ];

  function addProductionPlanLines(lines: any[], normalized: string) {
    const profile = inferEstimateProfile(normalized);
    for (const block of estimateProductionBlocks) {
      if (!block.when(profile)) continue;
      for (const item of block.items) {
        const exists = lines.some((line) => {
          const current = normalizeEstimateText(`${line.name} ${line.type}`);
          return current.includes(normalizeEstimateText(item.name).slice(0, 14));
        });
        if (!exists) {
          const guide = findEstimateGuidePrice(item.name, item.type);
          lines.push(buildExternalEstimateLine({ ...item, unitPrice: guide?.unitPrice ?? 0 }, lines.length, item.reason));
        }
      }
    }
  }

  function buildExternalEstimateLine(input: any, index: number, reason: string) {
    const guide = findEstimateGuidePrice(input?.name || "", input?.type || "");
    const quantity = Math.max(1, Math.round(Number(input?.quantity) || 1));
    const unitPrice = Math.max(0, Number(input?.unitPrice ?? guide?.unitPrice ?? inferFallbackEstimatePrice(input?.name || guide?.name || "", input?.type || guide?.type || "other")) || 0);
    const baseTotal = Math.round(quantity * unitPrice * 100) / 100;
    return {
      lineId: `market-${index}-${crypto.randomBytes(3).toString("hex")}`,
      catalogId: "",
      equipmentIds: [],
      name: String(input?.name || guide?.name || "Позиция под подбор").trim(),
      type: String(input?.type || guide?.type || "other").trim(),
      model: String(input?.model || "").trim(),
      quantity,
      availableQty: 0,
      totalQty: 0,
      unitPrice,
      baseTotal,
      shiftFactor: 1,
      total: baseTotal,
      priceSource: guide ? "internal_price_base" : unitPrice > 0 ? "ai_market_estimate" : "",
      availability: "unavailable",
      priceStatus: unitPrice > 0 ? "priced" : "no_price",
      confidence: Math.max(0.45, Math.min(0.9, Number(input?.confidence) || 0.65)),
      reason,
      locations: [],
    };
  }

  async function callHfEstimateAssistant(apiKey: string, title: string, text: string, equipment: any[]) {
    const model = process.env.HF_ESTIMATE_MODEL || process.env.HF_MODEL || "openai/gpt-oss-20b";
    const priceHints = estimatePriceGuide.slice(0, 28).map((item) => `${item.name}: ${item.unitPrice} RUB`).join("\n");
    const warehouseHints = (equipment || []).slice(0, 80).map((item: any) => `${item.name || ""} ${item.model || ""} (${item.type || "other"})`).join("\n");
    const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are a senior Russian technical production estimator for events. Understand the brief, infer what is required to successfully run the event, and return only valid compact JSON. Estimate realistic daily rental/subcontract prices in RUB using your market knowledge and the internal price base. Include audio, video, cameras, screens, lighting, networking, power, signal cables, spare/adapters, labor, transport and reasonable rental/subcontract items. Do not mention sources or example documents in item reasons.",
          },
          {
            role: "user",
            content: `Название: ${title}\nТЗ:\n${text.slice(0, 12000)}\n\nДоступный склад:\n${warehouseHints}\n\nВнутренняя база примерных рыночных цен, не упоминать клиенту:\n${priceHints}\n\nJSON schema: {"items":[{"name":"string","type":"audio|video|camera|lighting|display|network|power|cable|labor|transport|other","model":"string","quantity":1,"unitPrice":0,"reason":"зачем позиция нужна для мероприятия","confidence":0.7}]}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 1800,
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`HF ${response.status}: ${errorText.slice(0, 180)}`);
    }
    const data: any = await response.json();
    const content = String(data?.choices?.[0]?.message?.content || "");
    if (!content.trim()) return [];
    const jsonText = content.match(/\{[\s\S]*\}/)?.[0] || content;
    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return [];
    }
    return Array.isArray(parsed?.items) ? parsed.items : [];
  }

  async function callOpenAiEstimateAssistant(apiKey: string, title: string, text: string, equipment: any[]) {
    const model = process.env.OPENAI_ESTIMATE_MODEL || process.env.OPENAI_MODEL || "gpt-5.2";
    const priceHints = estimatePriceGuide.slice(0, 36).map((item) => `${item.name}: ${item.unitPrice} RUB`).join("\n");
    const warehouseHints = (equipment || []).slice(0, 120).map((item: any) => `${item.name || ""} ${item.model || ""} (${item.type || "other"})`).join("\n");
    const prompt = `Название: ${title}
ТЗ:
${text.slice(0, 18000)}

Склад:
${warehouseHints}

Внутренняя база ориентировочных дневных цен, клиенту источник не писать:
${priceHints}

Верни только JSON без markdown. Схема:
{"items":[{"name":"string","type":"audio|video|camera|lighting|display|network|power|cable|labor|transport|other","model":"string","quantity":1,"unitPrice":0,"reason":"зачем позиция нужна для мероприятия","confidence":0.7}]}`;
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: "Ты старший технический продюсер и инженер смет по мероприятиям. Пойми ТЗ, добавь всё, что реально нужно для проведения: звук, видео, камеры, экраны, свет, сеть, питание, коммутация, запас, персонал, логистика. Цены ставь реалистичные для дневной аренды/субподряда в RUB. Не упоминай внутренние источники цен.",
          },
          { role: "user", content: prompt },
        ],
        text: { format: { type: "json_object" } },
        reasoning: { effort: "medium" },
        max_output_tokens: 3500,
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`OpenAI ${response.status}: ${errorText.slice(0, 180)}`);
    }
    const data: any = await response.json();
    const content = String(
      data?.output_text ||
      data?.output?.flatMap((item: any) => item?.content || []).map((part: any) => part?.text || "").join("") ||
      ""
    );
    if (!content.trim()) return [];
    const jsonText = content.match(/\{[\s\S]*\}/)?.[0] || content;
    try {
      const parsed = JSON.parse(jsonText);
      return Array.isArray(parsed?.items) ? parsed.items : [];
    } catch {
      return [];
    }
  }

  app.post("/api/estimates/analyze", estimateUpload.single("file"), async (req, res) => {
    try {
      if (!(await hasWorkspaceAccess(req.user))) return res.status(403).json({ message: "Сначала создайте компанию или вступите по приглашению" });
      const title = String(req.body?.title || `Смета ${new Date().toLocaleDateString("ru-RU")}`).trim();
      const bodyText = String(req.body?.text || "");
      const fileText = req.file?.buffer ? req.file.buffer.toString("utf8") : "";
      const text = `${title}\n${bodyText}\n${fileText}`.trim();
      const normalized = normalizeEstimateText(text);
      const equipment = await storage.getEquipment().catch(() => []);
      const lines: any[] = [];
      const used = new Set<string>();
      const needRules = [
        { keys: ["камера", "camera", "съемка"], name: "Камера", type: "camera", quantity: 2 },
        { keys: ["микрофон", "звук", "петлич", "mic"], name: "Микрофон / радиосистема", type: "microphone", quantity: 2 },
        { keys: ["свет", "lighting", "прожектор"], name: "Световой прибор", type: "lighting", quantity: 4 },
        { keys: ["трансляц", "stream", "эфир"], name: "Компьютер трансляции / vMix", type: "computer", quantity: 1 },
        { keys: ["экран", "монитор", "тв", "display"], name: "Экран / монитор", type: "display", quantity: 1 },
        { keys: ["интернет", "сеть", "роутер", "switch", "lan"], name: "Сетевое оборудование", type: "network", quantity: 1 },
        { keys: ["запись", "рекордер"], name: "Рекордер", type: "video", quantity: 1 },
        { keys: ["atem", "режиссер", "коммутац"], name: "Видеомикшер", type: "video", quantity: 1 },
      ];
      for (const rule of needRules) {
        if (!rule.keys.some((key) => normalized.includes(normalizeEstimateText(key)))) continue;
        const matches = (equipment as any[])
          .filter((item) => !used.has(item.id))
          .map((item) => ({
            item,
            score:
              (normalizeEstimateText(item.type).includes(rule.type) ? 5 : 0) +
              rule.keys.reduce((sum, key) => sum + (normalizeEstimateText(`${item.name} ${item.model} ${item.type}`).includes(normalizeEstimateText(key)) ? 3 : 0), 0),
          }))
          .filter((row) => row.score > 0)
          .sort((a, b) => b.score - a.score);
        if (matches[0]) {
          used.add(matches[0].item.id);
          lines.push(buildEstimateLine(matches[0].item, rule.quantity, "Найдено на складе по ТЗ", lines.length));
        } else {
          lines.push({
            lineId: `subcontract-${rule.type}-${lines.length}`,
            catalogId: "",
            equipmentIds: [],
            name: rule.name,
            type: rule.type,
            model: "",
            quantity: rule.quantity,
            availableQty: 0,
            totalQty: 0,
            unitPrice: 0,
            baseTotal: 0,
            shiftFactor: 1,
            total: 0,
            priceSource: "",
            availability: "unavailable",
            priceStatus: "no_price",
            confidence: 0.7,
            reason: "Может понадобиться по ТЗ. На складе не найдено, заложить субподряд/аренду.",
            locations: [],
          });
        }
      }
      addProductionPlanLines(lines, normalized);
      for (const guide of estimatePriceGuide) {
        if (!guide.keys.some((key) => normalized.includes(normalizeEstimateText(key)))) continue;
        const alreadyAdded = lines.some((line) => {
          const lineText = normalizeEstimateText(`${line.name} ${line.type} ${line.model}`);
          return guide.keys.some((key) => lineText.includes(normalizeEstimateText(key)));
        });
        if (!alreadyAdded) {
          lines.push(buildExternalEstimateLine(guide, lines.length, "Может понадобиться по техническому заданию. Если позиции нет на складе, заложить аренду или субподряд."));
        }
      }
      const openAiKey = process.env.OPENAI_API_KEY || "";
      const hfKey = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || "";
      const apiKey = openAiKey || hfKey;
      let aiError = "";
      let aiProvider = "";
      if (apiKey && text.length > 0) {
        try {
          const aiItems = openAiKey
            ? await callOpenAiEstimateAssistant(openAiKey, title, text, equipment as any[])
            : await callHfEstimateAssistant(hfKey, title, text, equipment as any[]);
          aiProvider = openAiKey ? "openai" : "huggingface";
          for (const aiItem of aiItems.slice(0, 40)) {
            const aiName = normalizeEstimateText(`${aiItem?.name || ""} ${aiItem?.model || ""}`);
            if (!aiName) continue;
            const duplicate = lines.some((line) => {
              const lineName = normalizeEstimateText(`${line.name} ${line.model}`);
              return lineName.includes(aiName.slice(0, 14)) || aiName.includes(lineName.slice(0, 14));
            });
            if (!duplicate) {
              lines.push(buildExternalEstimateLine(aiItem, lines.length, `AI-подсказка: ${String(aiItem?.reason || "может понадобиться по ТЗ").slice(0, 220)}`));
            }
          }
        } catch (error: any) {
          aiError = error?.message || "AI request failed";
          console.warn("[Estimates] AI assistant failed:", aiError);
        }
      }
      const missing = lines
        .filter((line) => line.availability === "unavailable" || line.equipmentIds.length === 0)
        .map((line) => ({ name: line.name, type: line.type, quantity: line.quantity, reason: line.reason }));
      const subtotal = lines.reduce((sum, line) => sum + (Number(line.total) || 0), 0);
      const warnings = [
        ...(!apiKey ? ["AI ключ не настроен: смета собрана автоматическим анализом ТЗ и внутренней базой цен."] : []),
        ...(aiError ? ["AI не смог дополнить смету, поэтому использован автоматический продакшн-анализ ТЗ."] : []),
        ...(missing.length ? ["Есть позиции, которых может не быть на складе: они добавлены для аренды/субподряда или ручного уточнения цены."] : []),
      ];
      res.json({
        title,
        source: aiProvider ? "ai" : "heuristic",
        summary: lines.length ? "Смета собрана по ТЗ: оборудование, коммутация, персонал, логистика и возможная аренда сведены в одну таблицу." : "По ТЗ не удалось уверенно выделить оборудование. Добавьте формат мероприятия, площадку, аудиторию, трансляцию, звук, свет и экраны.",
        items: lines,
        missing,
        warnings,
        totals: {
          subtotal: Math.round(subtotal * 100) / 100,
          lines: lines.length,
          quantity: lines.reduce((sum, line) => sum + line.quantity, 0),
          missingPrices: lines.filter((line) => !line.unitPrice).length,
          availabilityIssues: lines.filter((line) => line.availability !== "in_stock").length,
        },
        catalogStats: {
          total: equipment.length,
          priced: (equipment as any[]).filter((item) => readEstimatePrice(item).value > 0).length,
          equipmentTotal: equipment.length,
          availableTotal: (equipment as any[]).filter((item) => item.status === "available").length,
        },
        document: req.file ? { name: req.file.originalname, extractedChars: fileText.length } : null,
        shiftCalculation: null,
        aiSchedule: null,
      });
    } catch (error: any) {
      console.error("[Estimates] analyze error:", error);
      res.status(500).json({ message: error?.message || "Не удалось собрать смету" });
    }
  });

  // Connection Schemas API
  app.get("/api/connection-schemas", async (req, res) => {
    try {
      if (!(await hasWorkspaceAccess(req.user))) return res.json([]);
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
      if (!(await hasWorkspaceAccess(req.user))) return res.status(403).json({ message: "Нет доступа к схемам" });
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
      if (!(await hasWorkspaceAccess(req.user))) {
        return res.status(403).json({ message: "Сначала создайте компанию или вступите по приглашению" });
      }
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
      const msg = error?.message ?? String(error);
      console.error("Create connection schema error:", msg);
      if (error?.stack) console.error(error.stack);
      const errorMessage = msg || "Failed to create connection schema";
      const isDbDown = /ECONNREFUSED|connect|connection refused/i.test(errorMessage) || error?.code === "ECONNREFUSED";
      if (isDbDown) {
        return res.status(500).json({
          message: "Не удалось подключиться к базе данных. Проверьте, что PostgreSQL запущен и DATABASE_URL в .env указан верно.",
        });
      }
      if (errorMessage.includes("does not exist") || errorMessage.includes("relation") || errorMessage.includes("table")) {
        return res.status(500).json({
          message: "Таблицы для схем подключения не созданы. Выполните SQL скрипт create_connection_schemas_tables.sql в вашей базе данных.",
          error: errorMessage,
        });
      }
      res.status(500).json({ message: errorMessage });
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
      if (!(await hasWorkspaceAccess(req.user))) return res.status(403).json({ message: "Нет доступа к схемам" });
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

  app.post("/api/connection-schemas/:id/ai-generate", async (req, res) => {
    try {
      if (!(await hasWorkspaceAccess(req.user))) return res.status(403).json({ message: "Нет доступа к схемам" });
      const schema = await storage.getConnectionSchemaById(req.params.id);
      if (!schema) return res.status(404).json({ message: "Схема не найдена" });
      const prompt = String(req.body?.prompt || schema.description || schema.name || "").trim();
      const searchTerms = prompt
        .split(/[,;\n]+/)
        .map((part) => part.trim())
        .filter(Boolean)
        .slice(0, 18);
      const fallbackTerms = searchTerms.length ? searchTerms : ["камера", "микрофон", "видеомикшер", "компьютер трансляции", "роутер"];
      const created: any[] = [];
      for (const [index, term] of fallbackTerms.entries()) {
        const fakeReq: any = { body: { query: term } };
        const lower = term.toLowerCase();
        const type =
          /камера|camera/i.test(lower) ? "camera" :
          /микрофон|mic/i.test(lower) ? "mic" :
          /свет|light/i.test(lower) ? "lighting" :
          /router|switch|роутер|сеть|lan/i.test(lower) ? "network" :
          /atem|микшер|коммутатор|switcher/i.test(lower) ? "video" :
          /монитор|экран|display/i.test(lower) ? "display" :
          "computer";
        const portsIn: any[] = [];
        const portsOut: any[] = [];
        const addIn = (name: string, portType = name) => portsIn.push({ id: `in-${portsIn.length + 1}`, name, type: "in", portType });
        const addOut = (name: string, portType = name) => portsOut.push({ id: `out-${portsOut.length + 1}`, name, type: "out", portType });
        if (/atem.*mini/i.test(lower)) {
          [1, 2, 3, 4].forEach((n) => addIn(`HDMI IN ${n}`, "HDMI"));
          addOut("HDMI OUT", "HDMI"); addIn("LAN", "LAN"); addIn("USB-C", "USB");
        } else if (/atem|switcher|видеомикшер|коммутатор/i.test(lower)) {
          [1, 2, 3, 4, 5, 6, 7, 8].forEach((n) => addIn(`SDI IN ${n}`, "SDI"));
          [1, 2, 3, 4].forEach((n) => addOut(`SDI OUT ${n}`, "SDI"));
          addIn("LAN", "LAN");
        } else if (type === "camera") {
          if (/sdi|studio|broadcast/i.test(lower)) addOut("SDI", "SDI");
          addOut("HDMI", "HDMI"); addIn("DC", "DC");
        } else if (type === "network") {
          Array.from({ length: /24/.test(lower) ? 24 : /16/.test(lower) ? 16 : 8 }, (_, i) => addIn(`LAN${i + 1}`, "LAN"));
        } else if (type === "mic") addOut("XLR", "XLR");
        else if (type === "display") { addIn("HDMI 1", "HDMI"); addIn("HDMI 2", "HDMI"); }
        else { addIn("LAN", "LAN"); addOut("HDMI", "HDMI"); }
        const component = await storage.createConnectionSchemaComponent({
          schemaId: schema.id,
          type,
          name: term,
          position: { x: 80 + (index % 3) * 320, y: 90 + Math.floor(index / 3) * 150 },
          properties: { source: "ai-assistant", portsIn, portsOut },
          connections: [],
        } as any);
        created.push(component);
      }
      res.json({ created, aiAvailable: Boolean(process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN) });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Не удалось сгенерировать схему" });
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

  // Эфир ОТИС — настройки потока
  app.get("/api/otis", async (req, res) => {
    try {
      const settings = await storage.getOtisStreamSettings();
      res.json(settings || { name: "Эфир ОТИС", showTimecode: true, withSound: true });
    } catch (error: any) {
      const msg = error?.message ?? String(error);
      console.error("Get otis settings error:", msg);
      if (error?.stack) console.error(error.stack);
      res.status(500).json({ message: msg || "Failed to get otis settings" });
    }
  });

  app.put("/api/otis", async (req, res) => {
    try {
      const { streamUrl, streamUrlBackup, showTimecode, withSound, name, timecodeSource, vmixHost, vmixPort } = req.body;
      const settings = await storage.upsertOtisStreamSettings({
        name: name ?? "Эфир ОТИС",
        streamUrl: streamUrl ?? undefined,
        streamUrlBackup: streamUrlBackup ?? undefined,
        showTimecode: showTimecode !== false,
        withSound: withSound !== false,
        timecodeSource: timecodeSource ?? "local",
        vmixHost: vmixHost ?? undefined,
        vmixPort: vmixPort != null ? parseInt(String(vmixPort), 10) : undefined,
      });
      res.json(settings);
    } catch (error: any) {
      const msg = error?.message ?? String(error);
      console.error("Update otis settings error:", msg);
      if (error?.stack) console.error(error.stack);
      res.status(500).json({ message: msg || "Failed to update otis settings" });
    }
  });

  // Продакшн: личные дела участников шоу
  app.post("/api/production/upload-photo", productionPhotoUpload.single("photo"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Файл не выбран" });
      }
      const photoUrl = `/uploads/production/${req.file.filename}`;
      res.json({ url: photoUrl });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Ошибка загрузки" });
    }
  });

  app.get("/api/events/:eventId/participant-profiles", async (req, res) => {
    try {
      const { eventId } = req.params;
      const profiles = await storage.getShowParticipantProfiles(eventId);
      res.json(profiles);
    } catch (error: any) {
      console.error("Get participant profiles error:", error);
      res.status(500).json({ message: error.message || "Failed to get participant profiles" });
    }
  });

  app.post("/api/events/:eventId/participant-profiles", async (req, res) => {
    try {
      const { eventId } = req.params;
      const { name, role, photo, bio, contacts, extra, order } = req.body;
      if (!name) {
        return res.status(400).json({ message: "Name is required" });
      }
      const profile = await storage.createShowParticipantProfile({
        eventId,
        name,
        role: role ?? undefined,
        photo: photo ?? undefined,
        bio: bio ?? undefined,
        contacts: contacts ?? {},
        extra: extra ?? {},
        order: order ?? 0,
      });
      res.json(profile);
    } catch (error: any) {
      console.error("Create participant profile error:", error);
      res.status(500).json({ message: error.message || "Failed to create participant profile" });
    }
  });

  app.put("/api/participant-profiles/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { name, role, photo, bio, contacts, extra, order } = req.body;
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (role !== undefined) updateData.role = role;
      if (photo !== undefined) updateData.photo = photo;
      if (bio !== undefined) updateData.bio = bio;
      if (contacts !== undefined) updateData.contacts = contacts;
      if (extra !== undefined) updateData.extra = extra;
      if (order !== undefined) updateData.order = order;
      const updated = await storage.updateShowParticipantProfile(id, updateData);
      if (!updated) return res.status(404).json({ message: "Profile not found" });
      res.json(updated);
    } catch (error: any) {
      console.error("Update participant profile error:", error);
      res.status(500).json({ message: error.message || "Failed to update participant profile" });
    }
  });

  app.delete("/api/participant-profiles/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteShowParticipantProfile(id);
      if (!deleted) return res.status(404).json({ message: "Profile not found" });
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete participant profile error:", error);
      res.status(500).json({ message: error.message || "Failed to delete participant profile" });
    }
  });

  // Продакшн: маркеры по таймкоду
  app.get("/api/events/:eventId/markers", async (req, res) => {
    try {
      const { eventId } = req.params;
      const markers = await storage.getShowMarkers(eventId);
      res.json(markers);
    } catch (error: any) {
      console.error("Get show markers error:", error);
      res.status(500).json({ message: error.message || "Failed to get markers" });
    }
  });

  app.post("/api/events/:eventId/markers", async (req, res) => {
    try {
      const { eventId } = req.params;
      const { timecode, type, value, note } = req.body;
      const userId = (req as any).user?.id;
      if (!timecode || !type) {
        return res.status(400).json({ message: "Timecode and type are required" });
      }
      const marker = await storage.createShowMarker({
        eventId,
        timecode: String(timecode),
        type: String(type),
        value: value ? String(value) : undefined,
        note: note ? String(note) : undefined,
        editorId: userId,
      });
      res.json(marker);
    } catch (error: any) {
      console.error("Create show marker error:", error);
      res.status(500).json({ message: error.message || "Failed to create marker" });
    }
  });

  app.put("/api/markers/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { timecode, type, value, note } = req.body;
      const updateData: any = {};
      if (timecode !== undefined) updateData.timecode = timecode;
      if (type !== undefined) updateData.type = type;
      if (value !== undefined) updateData.value = value;
      if (note !== undefined) updateData.note = note;
      const updated = await storage.updateShowMarker(id, updateData);
      if (!updated) return res.status(404).json({ message: "Marker not found" });
      res.json(updated);
    } catch (error: any) {
      console.error("Update show marker error:", error);
      res.status(500).json({ message: error.message || "Failed to update marker" });
    }
  });

  app.delete("/api/markers/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteShowMarker(id);
      if (!deleted) return res.status(404).json({ message: "Marker not found" });
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete show marker error:", error);
      res.status(500).json({ message: error.message || "Failed to delete marker" });
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

      const addIn = (name: string, portType = name) => portsIn.push({ id: `in-${portsIn.length + 1}`, name, type: "in", portType });
      const addOut = (name: string, portType = name) => portsOut.push({ id: `out-${portsOut.length + 1}`, name, type: "out", portType });
      const addMany = (direction: "in" | "out", prefix: string, count: number, portType: string) => {
        for (let i = 1; i <= count; i += 1) direction === "in" ? addIn(`${prefix}${i}`, portType) : addOut(`${prefix}${i}`, portType);
      };
      const explicitCounts = [
        { re: /(\d+)\s*(x|×)?\s*sdi|sdi\s*(\d+)/i, name: "SDI", type: "SDI" },
        { re: /(\d+)\s*(x|×)?\s*hdmi|hdmi\s*(\d+)/i, name: "HDMI", type: "HDMI" },
        { re: /(\d+)\s*(x|×)?\s*(lan|ethernet|rj45)|(?:lan|ethernet|rj45)\s*(\d+)/i, name: "LAN", type: "LAN" },
        { re: /(\d+)\s*(x|×)?\s*xlr|xlr\s*(\d+)/i, name: "XLR", type: "XLR" },
      ];
      const explicit = explicitCounts.some((rule) => {
        const match = queryLower.match(rule.re);
        const count = Number(match?.[1] || match?.[3] || 0);
        if (!count) return false;
        addMany(type === "camera" || type === "computer" ? "out" : "in", rule.name, Math.min(count, 64), rule.type);
        return true;
      });

      if (/atem.*mini/i.test(queryLower)) {
        addMany("in", "HDMI IN ", 4, "HDMI");
        addOut("HDMI OUT", "HDMI");
        addIn("USB-C", "USB");
        addIn("LAN", "LAN");
        addIn("MIC 1", "3.5mm");
        addIn("MIC 2", "3.5mm");
      } else if (/atem.*(television|studio|constellation|sdi)/i.test(queryLower)) {
        addMany("in", "SDI IN ", 8, "SDI");
        addMany("out", "SDI OUT ", 4, "SDI");
        addIn("LAN", "LAN");
      } else if (type === "camera") {
        if (!explicit) {
          if (/sdi|broadcast|studio|ursa|fx6|fx9|c300|c500|ag-/.test(queryLower)) addOut("SDI", "SDI");
          if (/hdmi|a7|alpha|canon|lumix|gh\d|bmpcc|pocket|zv-/.test(queryLower) || portsOut.length === 0) addOut("HDMI", "HDMI");
        }
        addIn("DC", "DC");
      } else if (type === "computer") {
        if (!explicit) {
          addOut("HDMI", "HDMI");
          addOut("DisplayPort", "DisplayPort");
        }
        addIn("LAN", "LAN");
        addIn("USB", "USB");
      } else if (type === "network") {
        if (!explicit) addMany("in", "LAN", /24/.test(queryLower) ? 24 : /16/.test(queryLower) ? 16 : 8, "LAN");
        addIn("Uplink", "LAN");
        addIn("Power", "DC");
      } else if (type === "display") {
        if (!explicit) {
          addIn("HDMI 1", "HDMI");
          addIn("HDMI 2", "HDMI");
        }
        addIn("USB", "USB");
      } else if (type === "audio" || type === "mic") {
        if (type === "mic") addOut("XLR", "XLR");
        else {
          addMany("in", "XLR IN ", 4, "XLR");
          addMany("out", "XLR OUT ", 2, "XLR");
        }
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

  return server;
}
