/**
 * YouGile API v2 client.
 * Документация: https://ru.yougile.com/api-v2#/
 * Авторизация: Bearer <API ключ>, лимит 50 запросов/мин на компанию.
 *
 * Кэш и лимитер: чтобы ~10 пользователей могли работать без превышения лимита,
 * ответы GET кэшируются на 45–120 с, запросы к API ограничены 48/мин (запас до 50).
 */

import fs from "fs";
import path from "path";

const YOUGILE_BASE = (process.env.YOUGILE_BASE_URL || "https://yougile.com/api-v2").replace(/\/$/, "");

const YOUGILE_KEY_FILE = path.join(process.cwd(), ".yougile-key");
const YOUGILE_COLUMN_MAP_FILE = path.join(process.cwd(), ".yougile-column-map.json");
const YOUGILE_DEFAULT_COLUMN_FILE = path.join(process.cwd(), ".yougile-default-column");

// ——— Кэш и лимитер запросов (50/мин на компанию) ———
const YOUGILE_RATE_LIMIT = 48;       // оставляем запас до 50
const YOUGILE_WINDOW_MS = 60_000;   // 1 минута
const requestTimestamps: number[] = [];

function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const cutoff = now - YOUGILE_WINDOW_MS;
  while (requestTimestamps.length > 0 && requestTimestamps[0] < cutoff) {
    requestTimestamps.shift();
  }
  if (requestTimestamps.length < YOUGILE_RATE_LIMIT) return Promise.resolve();
  const waitMs = requestTimestamps[0] + YOUGILE_WINDOW_MS - now + 100;
  return new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 5000)));
}

function recordRequest(): void {
  requestTimestamps.push(Date.now());
  const cutoff = Date.now() - YOUGILE_WINDOW_MS;
  while (requestTimestamps.length > 0 && requestTimestamps[0] < cutoff) {
    requestTimestamps.shift();
  }
}

const cache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL = {
  projects: 90_000,   // 90 с
  boards: 90_000,     // 90 с
  columns: 60_000,    // 60 с
  tasks: 45_000,      // 45 с (задачи чаще меняются)
  users: 120_000,     // 2 мин
  stickers: 120_000,  // 2 мин — фильтры/стикеры доски
};

function cacheGet<T>(key: string, ttlMs: number): T | undefined {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) return undefined;
  return entry.data as T;
}

function cacheSet(key: string, data: unknown, ttlMs: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

/** Сбросить кэш по префиксу (например "tasks:" после создания/изменения задачи). */
export function clearCacheByPrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/** Очистить весь in-memory кэш (при синхронизации в БД — чтобы получить свежие данные из API). */
export function clearYougileCache(): void {
  cache.clear();
}

/** Маппинг: id колонки CRM (статус) → id колонки YouGile. Используется при обновлении задачи (перемещение между столбцами). */
export function getYouGileColumnMap(): Record<string, string> {
  try {
    if (fs.existsSync(YOUGILE_COLUMN_MAP_FILE)) {
      const raw = fs.readFileSync(YOUGILE_COLUMN_MAP_FILE, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch {
    /* ignore */
  }
  return {};
}

export function setYouGileColumnMap(map: Record<string, string>): void {
  fs.writeFileSync(YOUGILE_COLUMN_MAP_FILE, JSON.stringify(map, null, 2), "utf8");
}

/** Обратный маппинг: id колонки YouGile → id колонки CRM (статус). Для синхронизации из YouGile в CRM. */
export function getYouGileColumnMapReverse(): Record<string, string> {
  const map = getYouGileColumnMap();
  const reverse: Record<string, string> = {};
  for (const [crmStatus, ygColumnId] of Object.entries(map)) {
    if (ygColumnId) reverse[ygColumnId] = crmStatus;
  }
  return reverse;
}

/** Колонка YouGile по умолчанию для новых задач: из env или первая доступная (кэш в файле). */
export async function getYouGileDefaultColumnId(): Promise<string | null> {
  const fromEnv = (process.env.YOUGILE_DEFAULT_COLUMN_ID || "").trim();
  if (fromEnv) return fromEnv;
  try {
    if (fs.existsSync(YOUGILE_DEFAULT_COLUMN_FILE)) {
      return fs.readFileSync(YOUGILE_DEFAULT_COLUMN_FILE, "utf8").trim() || null;
    }
  } catch {
    /* ignore */
  }
  try {
    const projects = await yougileGetProjects();
    if (!projects.length) return null;
    const boards = await yougileGetBoards(projects[0].id);
    if (!boards.length) return null;
    const columns = await yougileGetColumns(boards[0].id);
    if (!columns.length) return null;
    const firstId = columns[0].id;
    fs.writeFileSync(YOUGILE_DEFAULT_COLUMN_FILE, firstId, "utf8");
    return firstId;
  } catch {
    return null;
  }
}

function getYouGileApiKey(): string {
  const fromEnv = (process.env.YOUGILE_API_KEY || "").trim();
  if (fromEnv) return fromEnv;
  try {
    if (fs.existsSync(YOUGILE_KEY_FILE)) {
      return fs.readFileSync(YOUGILE_KEY_FILE, "utf8").trim();
    }
  } catch {
    /* ignore */
  }
  return "";
}

export function isYouGileConfigured(): boolean {
  return !!getYouGileApiKey();
}

/** Сохранить API-ключ в файл (после получения по логину/паролю и companyId). */
export function setYouGileApiKey(key: string): void {
  fs.writeFileSync(YOUGILE_KEY_FILE, key.trim(), "utf8");
}

/** Ошибка лимита запросов YouGile (429 или сообщение «слишком много запросов»). Повтор — через retryAfterMs. */
export class YouGileRateLimitError extends Error {
  retryAfterMs: number;
  constructor(message: string, retryAfterMs = 60_000) {
    super(message);
    this.name = "YouGileRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

function isRateLimitMessage(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes("too many requests") ||
    lower.includes("лимит") ||
    lower.includes("rate limit") ||
    lower.includes("превышен") ||
    lower.includes("429")
  );
}

async function yougileFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  await waitForRateLimit();
  recordRequest();
  const apiKey = getYouGileApiKey();
  if (!apiKey) {
    throw new Error("YOUGILE_API_KEY не задан. Добавьте ключ в .env или получите его в Настройках (логин и пароль YouGile).");
  }
  const url = path.startsWith("http") ? path : `${YOUGILE_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...options.headers,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    let errMsg = `YouGile API ${res.status}`;
    let retryAfterMs = 60_000;
    try {
      const json = JSON.parse(text);
      if (json.error || json.message) errMsg = json.error || json.message;
    } catch {
      if (text) errMsg = text.slice(0, 200);
    }
    if (res.status === 429 || isRateLimitMessage(errMsg)) {
      const retryAfter = res.headers.get("Retry-After");
      if (retryAfter) {
        const sec = parseInt(retryAfter, 10);
        if (!Number.isNaN(sec)) retryAfterMs = Math.min(sec * 1000, 300_000);
      }
      throw new YouGileRateLimitError(errMsg, retryAfterMs);
    }
    throw new Error(errMsg);
  }
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

/** Чтение с кэшем (лимит запросов учитывается в yougileFetch). */
async function yougileGetCached<T>(cacheKey: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const hit = cacheGet<T>(cacheKey, ttlMs);
  if (hit !== undefined) return hit;
  const data = await fetcher();
  cacheSet(cacheKey, data, ttlMs);
  return data;
}

/** Получить список компаний (нужны логин и пароль, один раз — чтобы узнать companyId). */
export async function yougileGetCompanies(login: string, password: string): Promise<{ id: string; title?: string }[]> {
  const res = await fetch(`${YOUGILE_BASE}/companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ login, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || data?.message || "Ошибка получения компаний");
  return Array.isArray(data) ? data : data?.content ?? [];
}

/** Получить API-ключ по логину, паролю и companyId (один раз, затем ключ сохраняют в YOUGILE_API_KEY). */
export async function yougileGetAuthKey(login: string, password: string, companyId: string): Promise<{ key: string }> {
  const res = await fetch(`${YOUGILE_BASE}/auth/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ login, password, companyId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || data?.message || "Ошибка получения ключа");
  return { key: data.key ?? data.token ?? data };
}

// ——— Проекты ———
export interface YouGileProject {
  id: string;
  title?: string;
  [key: string]: unknown;
}

export async function yougileGetProjects(): Promise<YouGileProject[]> {
  return yougileGetCached<YouGileProject[]>("projects", CACHE_TTL.projects, async () => {
    const data = await yougileFetch<YouGileProject[] | { content: YouGileProject[] }>("/projects");
    return Array.isArray(data) ? data : (data as { content: YouGileProject[] })?.content ?? [];
  });
}

/** Создать проект в YouGile (для привязки доски к видеопроекту) */
export async function yougileCreateProject(title: string): Promise<YouGileProject> {
  return yougileFetch<YouGileProject>("/projects", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

// ——— Доски (в YouGile у проекта есть доски) ———
export interface YouGileBoard {
  id: string;
  title?: string;
  projectId?: string;
  [key: string]: unknown;
}

export async function yougileGetBoards(projectId?: string): Promise<YouGileBoard[]> {
  const cacheKey = projectId ? `boards:${projectId}` : "boards:all";
  return yougileGetCached<YouGileBoard[]>(cacheKey, CACHE_TTL.boards, async () => {
    const path = projectId ? `/boards?projectId=${encodeURIComponent(projectId)}` : "/boards";
    const data = await yougileFetch<YouGileBoard[] | { content: YouGileBoard[] }>(path);
    const list = Array.isArray(data) ? data : (data as { content: YouGileBoard[] })?.content ?? [];
    if (projectId) return list.filter((b: YouGileBoard) => !b.projectId || b.projectId === projectId);
    return list;
  });
}

/** Создать доску в проекте YouGile */
export async function yougileCreateBoard(projectId: string, title: string): Promise<YouGileBoard> {
  return yougileFetch<YouGileBoard>("/boards", {
    method: "POST",
    body: JSON.stringify({ projectId, title }),
  });
}

// ——— Колонки доски ———
export interface YouGileColumn {
  id: string;
  title?: string;
  boardId?: string;
  order?: number;
  [key: string]: unknown;
}

export async function yougileGetColumns(boardId: string): Promise<YouGileColumn[]> {
  return yougileGetCached<YouGileColumn[]>(`columns:${boardId}`, CACHE_TTL.columns, async () => {
    const data = await yougileFetch<YouGileColumn[] | { content: YouGileColumn[] }>(`/columns?boardId=${encodeURIComponent(boardId)}`);
    const list = Array.isArray(data) ? data : (data as { content: YouGileColumn[] })?.content ?? [];
    return list.filter((c: YouGileColumn) => !c.boardId || c.boardId === boardId);
  });
}

/** Создать колонку на доске YouGile (color 1–16 по документации YouGile) */
export async function yougileCreateColumn(boardId: string, title: string, color?: number): Promise<YouGileColumn> {
  const body: { boardId: string; title: string; color?: number } = { boardId, title };
  if (color != null && color >= 1 && color <= 16) body.color = color;
  return yougileFetch<YouGileColumn>("/columns", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Обновить колонку YouGile */
export async function yougileUpdateColumn(columnId: string, dto: { title?: string; color?: number; deleted?: boolean }): Promise<YouGileColumn> {
  return yougileFetch<YouGileColumn>(`/columns/${columnId}`, {
    method: "PUT",
    body: JSON.stringify(dto),
  });
}

/** Получить доску YouGile по ID */
export async function yougileGetBoardById(boardId: string): Promise<YouGileBoard | null> {
  try {
    return await yougileFetch<YouGileBoard>(`/boards/${boardId}`);
  } catch {
    return null;
  }
}

/** Обновить доску YouGile */
export async function yougileUpdateBoard(boardId: string, dto: { title?: string }): Promise<YouGileBoard> {
  return yougileFetch<YouGileBoard>(`/boards/${boardId}`, {
    method: "PUT",
    body: JSON.stringify(dto),
  });
}

// ——— Стикеры/фильтры доски (String Sticker State) ———
// @see https://ru.yougile.com/api-v2#/operations/StringStickerStateController_get
export interface YouGileStringStickerState {
  id: string;
  title?: string;
  boardId?: string;
  order?: number;
  type?: string;
  options?: Array<{ id: string; title?: string }>;
  [key: string]: unknown;
}

/** Опции стикера (значения списка). YouGile: GET /string-stickers/:id возвращает { id, name, states: [{ id, name, color }] }. */
export async function yougileGetStringStickerValues(stringStickerId: string): Promise<Array<{ id: string; title?: string }>> {
  const cacheKey = `sticker-values:${stringStickerId}`;
  return yougileGetCached<Array<{ id: string; title?: string }>>(cacheKey, CACHE_TTL.stickers, async () => {
    const enc = encodeURIComponent(stringStickerId);
    try {
      const one = await yougileFetch<{ id?: string; name?: string; deleted?: boolean; states?: Array<{ id?: string; name?: string }> }>(`/string-stickers/${enc}`);
      if (one && (one as any).deleted !== true && Array.isArray((one as any).states)) {
        const states = (one as any).states as Array<{ id?: string; name?: string }>;
        if (states.length > 0)
          return states.map((s, i) => {
            const id = (s.id ?? s.name ?? `opt-${i}`).toString() || `opt-${i}`;
            return { id, title: (s.name ?? s.id ?? id).toString() };
          });
      }
    } catch {
      /* try list endpoints below */
    }
    const q = `stringStickerStateId=${enc}`;
    const paths = [
      `/string-sticker-values?${q}`,
      `/string-sticker/search?${q}`,
      `/string-stickers/search?${q}`,
      `/string-sticker-states/${enc}/values`,
      `/string-sticker-state/${enc}/values`,
    ];
    for (const path of paths) {
      try {
        const data = await yougileFetch<Array<{ id: string; title?: string }> | { content?: Array<{ id: string; title?: string }>; values?: Array<{ id: string; title?: string }> }>(path);
        const list = Array.isArray(data)
          ? data
          : (data as any)?.content ?? (data as any)?.values ?? [];
        if (list.length > 0) return list;
      } catch {
        /* try next */
      }
    }
    return [];
  });
}

/** Формат YouGile: один стикер — id, name, states: [{ id, name, color }]. Не отбрасываем стикеры без id — подставляем sticker-${i}. */
function normalizeYouGileStickerList(
  raw: Array<{ id?: string; name?: string; title?: string; deleted?: boolean; states?: Array<{ id?: string; name?: string; title?: string }> }>,
  boardId: string
): YouGileStringStickerState[] {
  return raw
    .filter((s) => s && (s as any).deleted !== true)
    .map((s, i) => {
      const id = (s.id ?? `sticker-${i}`).toString() || `sticker-${i}`;
      const title = ((s.name ?? s.title ?? s.id ?? id) || "").toString().trim();
      const states = Array.isArray((s as any).states) ? (s as any).states : [];
      const options =
        states.length > 0
          ? states.map((st: any, j: number) => {
              const optId = (st.id ?? st.name ?? `opt-${j}`).toString() || `opt-${j}`;
              return { id: optId, title: (st.name ?? st.title ?? st.id ?? optId).toString() };
            })
          : undefined;
      const type = options && options.length > 0 ? "list" : "string";
      return {
        id,
        title: title || id,
        boardId,
        order: i,
        type,
        options,
      } as YouGileStringStickerState;
    });
}

/** Получить список стикеров доски. YouGile: GET /string-stickers?boardId= — массив { id, name, states: [{ id, name, color }] }. */
export async function yougileGetStringStickerStates(boardId: string): Promise<YouGileStringStickerState[]> {
  const cacheKey = `stickers:${boardId}`;
  return yougileGetCached<YouGileStringStickerState[]>(cacheKey, CACHE_TTL.stickers, async () => {
    const encBoard = encodeURIComponent(boardId);
    const qBoard = `boardId=${encBoard}`;
    const qBoardSnake = `board_id=${encBoard}`;
    const paths: string[] = [
      `/string-stickers?${qBoard}`,
      `/string-stickers?${qBoardSnake}`,
      `/string-sticker-states?${qBoard}`,
      `/string-sticker-states?${qBoardSnake}`,
      `/string-sticker-state?${qBoard}`,
      `/string-sticker-states/search?${qBoard}`,
      `/boards/${encBoard}/string-stickers`,
      `/board/${encBoard}/string-stickers`,
      `/boards/${encBoard}/string-sticker-states`,
    ];
    for (const path of paths) {
      try {
        const data = await yougileFetch<unknown>(path);
        let list: Array<{ id?: string; name?: string; states?: Array<{ id?: string; name?: string }> }> = [];
        if (Array.isArray(data)) list = data as any;
        else if (data && typeof data === "object") {
          const c = (data as any).content ?? (data as any).data ?? (data as any).items;
          if (Array.isArray(c)) list = c;
          else if (path.includes("/boards/") && !path.includes("string-sticker")) {
            const obj = data as Record<string, unknown>;
            for (const key of Object.keys(obj)) {
              const val = obj[key];
              if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object" && val[0] !== null) {
                const first = val[0] as Record<string, unknown>;
                if ("id" in first && ("name" in first || "states" in first)) {
                  list = val as any;
                  break;
                }
              }
            }
          }
        }
        if (list.length > 0) {
          const normalized = normalizeYouGileStickerList(list, boardId);
          if (normalized.length > 0) return normalized;
        }
      } catch {
        /* try next path */
      }
    }
    // Fallback: доска может содержать id стикеров — запрашиваем каждый GET /string-stickers/:id
    try {
      const board = await yougileGetBoardById(boardId);
      if (board && typeof board === "object") {
        const raw = (board as any).stringStickers ?? (board as any).stringStickerIds ?? (board as any).stickerIds;
        const ids = Array.isArray(raw) ? raw.map((x: any) => (typeof x === "object" && x?.id != null ? x.id : x)) : [];
        if (ids.length > 0) {
          const out: YouGileStringStickerState[] = [];
          for (let i = 0; i < ids.length; i++) {
            try {
              const one = await yougileFetch<{ id?: string; name?: string; deleted?: boolean; states?: Array<{ id?: string; name?: string }> }>(`/string-stickers/${encodeURIComponent(ids[i])}`);
              if (one && (one as any).deleted !== true) {
                const name = ((one as any).name ?? (one as any).id ?? "").toString().trim();
                const states = Array.isArray((one as any).states) ? (one as any).states : [];
                const options = states.length > 0 ? states.map((s: any, i: number) => {
                  const id = (s.id ?? s.name ?? `opt-${i}`).toString() || `opt-${i}`;
                  return { id, title: (s.name ?? s.id ?? id).toString() };
                }) : undefined;
                out.push({
                  id: (one as any).id ?? ids[i],
                  title: name || String(ids[i]),
                  boardId,
                  order: i,
                  type: options && options.length > 0 ? "list" : "string",
                  options,
                } as YouGileStringStickerState);
              }
            } catch {
              /* skip this sticker */
            }
          }
          if (out.length > 0) return out;
        }
      }
    } catch {
      /* ignore */
    }
    return [];
  });
}

// ——— Сотрудники YouGile (для маппинга исполнителя по email в CRM) ———
export interface YouGileUser {
  id: string;
  username?: string;
  email?: string;
  realName?: string;
  [key: string]: unknown;
}

/** Список сотрудников компании (id → email для маппинга assignee в CRM по почте). */
export async function yougileGetUsers(): Promise<YouGileUser[]> {
  try {
    return await yougileGetCached<YouGileUser[]>("users", CACHE_TTL.users, async () => {
      const data = await yougileFetch<YouGileUser[] | { content?: YouGileUser[] }>("/users");
      return Array.isArray(data) ? data : (data as { content?: YouGileUser[] })?.content ?? [];
    });
  } catch {
    return [];
  }
}

// ——— Задачи ———
export interface YouGileTask {
  id: string;
  title?: string;
  description?: string;
  columnId?: string;
  boardId?: string;
  projectId?: string;
  assigneeId?: string;
  /** YouGile: массив id исполнителей (assigned). */
  assigned?: string[];
  deadline?: number | string;
  status?: string;
  [key: string]: unknown;
}

/** Получить задачи по одной колонке (API: GET /task-list). Параметры: assignedTo, title, limit, offset по доке YouGile. */
async function yougileGetTasksByColumn(
  columnId: string,
  opts?: { assignedTo?: string; title?: string; limit?: number; offset?: number }
): Promise<YouGileTask[]> {
  const limit = opts?.limit ?? 1000;
  const offset = opts?.offset ?? 0;
  const search = new URLSearchParams();
  search.set("columnId", columnId);
  search.set("limit", String(limit));
  search.set("offset", String(offset));
  if (opts?.assignedTo) search.set("assignedTo", opts.assignedTo);
  if (opts?.title) search.set("title", opts.title);
  const cacheKey = `tasks:${columnId}:${opts?.assignedTo ?? ""}:${opts?.title ?? ""}`;
  return yougileGetCached<YouGileTask[]>(cacheKey, CACHE_TTL.tasks, async () => {
    const path = `/task-list?${search.toString()}`;
    const data = await yougileFetch<{ content?: YouGileTask[]; paging?: unknown } | YouGileTask[]>(path);
    const list = Array.isArray(data) ? data : (data as { content?: YouGileTask[] })?.content ?? [];
    return list.map((t) => ({ ...t, columnId: t.columnId ?? columnId }));
  });
}

export type YouGileGetTasksParams = {
  projectId?: string;
  boardId?: string;
  columnId?: string;
  assignedTo?: string;
  title?: string;
  limit?: number;
  offset?: number;
};

/**
 * Получить список задач YouGile.
 * API v2: GET /task-list (columnId, assignedTo, title, limit, offset).
 * @see https://ru.yougile.com/api-v2#/operations/TaskController_search
 */
export async function yougileGetTasks(params?: YouGileGetTasksParams): Promise<YouGileTask[]> {
  const opts = params ? { assignedTo: params.assignedTo, title: params.title, limit: params.limit, offset: params.offset } : undefined;
  if (params?.columnId) {
    return yougileGetTasksByColumn(params.columnId, opts);
  }
  if (params?.boardId) {
    const columns = await yougileGetColumns(params.boardId);
    const all: YouGileTask[] = [];
    const seen = new Set<string>();
    for (const col of columns) {
      const list = await yougileGetTasksByColumn(col.id, opts);
      for (const t of list) {
        if (!seen.has(t.id)) {
          seen.add(t.id);
          all.push({ ...t, boardId: params.boardId, columnId: t.columnId ?? col.id });
        }
      }
    }
    return all;
  }
  if (params?.projectId) {
    const boards = await yougileGetBoards(params.projectId);
    const all: YouGileTask[] = [];
    const seen = new Set<string>();
    for (const board of boards) {
      const list = await yougileGetTasks({ boardId: board.id });
      for (const t of list) {
        if (!seen.has(t.id)) {
          seen.add(t.id);
          all.push({ ...t, projectId: params.projectId, boardId: t.boardId ?? board.id });
        }
      }
    }
    return all;
  }
  // Без фильтра: все проекты → все доски → все колонки → все задачи
  const projects = await yougileGetProjects();
  const all: YouGileTask[] = [];
  const seen = new Set<string>();
  for (const p of projects) {
    const list = await yougileGetTasks({ projectId: p.id }).catch(() => []);
    for (const t of list) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        all.push(t);
      }
    }
  }
  return all;
}

export interface YouGileCreateTaskDto {
  title: string;
  description?: string;
  columnId: string;
  assigneeId?: string;
  assigned?: string[];
  deadline?: number; // unix ms
  [key: string]: unknown;
}

export async function yougileCreateTask(dto: YouGileCreateTaskDto): Promise<YouGileTask> {
  const body = { ...dto };
  if (body.deadline && typeof body.deadline === "string") {
    body.deadline = new Date(body.deadline).getTime();
  }
  const result = await yougileFetch<YouGileTask>("/tasks", {
    method: "POST",
    body: JSON.stringify(body),
  });
  clearCacheByPrefix("tasks:");
  return result;
}

export interface YouGileUpdateTaskDto {
  title?: string;
  description?: string;
  columnId?: string;
  assigneeId?: string | null;
  assigned?: string[];
  deadline?: number | null;
  status?: string;
  [key: string]: unknown;
}

export async function yougileUpdateTask(taskId: string, dto: YouGileUpdateTaskDto): Promise<YouGileTask> {
  const body = { ...dto };
  if (body.deadline !== undefined && body.deadline !== null && typeof body.deadline === "string") {
    body.deadline = new Date(body.deadline).getTime();
  }
  const result = await yougileFetch<YouGileTask>(`/tasks/${taskId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  clearCacheByPrefix("tasks:");
  return result;
}

export async function yougileDeleteTask(taskId: string): Promise<void> {
  await yougileFetch(`/tasks/${taskId}`, { method: "DELETE" });
  clearCacheByPrefix("tasks:");
}

export async function yougileGetTaskById(taskId: string): Promise<YouGileTask | null> {
  try {
    return await yougileFetch<YouGileTask>(`/tasks/${taskId}`);
  } catch {
    return null;
  }
}

export interface YouGileChatMessage {
  id?: string;
  text?: string;
  content?: string;
  message?: string;
  createdAt?: number | string;
  updatedAt?: number | string;
  userId?: string;
  authorId?: string;
  creatorId?: string;
  senderId?: string;
  author?: { id?: string; name?: string; username?: string; email?: string };
  user?: { id?: string; name?: string; username?: string; email?: string };
  [key: string]: unknown;
}

export async function yougileGetChatMessages(taskId: string): Promise<YouGileChatMessage[]> {
  const data = await yougileFetch<YouGileChatMessage[] | { content?: YouGileChatMessage[]; messages?: YouGileChatMessage[] }>(
    `/chats/${encodeURIComponent(taskId)}/messages`,
  );
  if (Array.isArray(data)) return data;
  return data?.content ?? data?.messages ?? [];
}

export async function yougileSendChatMessage(taskId: string, text: string): Promise<YouGileChatMessage> {
  return await yougileFetch<YouGileChatMessage>(`/chats/${encodeURIComponent(taskId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

// ——— Очередь мутаций YouGile: при лимите 50 запросов/мин запросы ставятся в очередь и выполняются по мере возможности
type YouGileJob =
  | { type: "update"; yougileTaskId: string; payload: YouGileUpdateTaskDto }
  | { type: "delete"; yougileTaskId: string }
  | { type: "comment"; yougileTaskId: string; text: string }
  | { type: "create"; ourTaskId: string; boardId: string; dto: YouGileCreateTaskDto; onSuccess?: (ygTask: YouGileTask) => Promise<void> };

const yougileMutationQueue: YouGileJob[] = [];
let queueProcessing = false;
let mutationQueueRetryTimer: ReturnType<typeof setTimeout> | null = null;

async function processYougileQueue(): Promise<void> {
  if (queueProcessing || yougileMutationQueue.length === 0 || !isYouGileConfigured()) return;
  queueProcessing = true;
  while (yougileMutationQueue.length > 0) {
    const job = yougileMutationQueue.shift();
    if (!job) break;
    try {
      if (job.type === "update") {
        await yougileUpdateTask(job.yougileTaskId, job.payload);
      } else if (job.type === "delete") {
        await yougileDeleteTask(job.yougileTaskId);
      } else if (job.type === "comment") {
        await yougileSendChatMessage(job.yougileTaskId, job.text);
      } else if (job.type === "create") {
        const ygTask = await yougileCreateTask(job.dto);
        if (job.onSuccess) await job.onSuccess(ygTask);
      }
    } catch (err: any) {
      if (err instanceof YouGileRateLimitError) {
        yougileMutationQueue.unshift(job);
        const ms = Math.min(Math.max(err.retryAfterMs, 5000), 120_000);
        if (mutationQueueRetryTimer) clearTimeout(mutationQueueRetryTimer);
        mutationQueueRetryTimer = setTimeout(() => {
          mutationQueueRetryTimer = null;
          queueProcessing = false;
          processYougileQueue();
        }, ms);
        return;
      }
      console.warn("[YouGile] Queue job failed, will not retry:", job.type, err?.message || err);
    }
  }
  queueProcessing = false;
}

/** Поставить в очередь обновление задачи в YouGile (ответ клиенту можно отдать сразу, синхронизация произойдёт по мере лимита). */
export function yougileEnqueueUpdate(yougileTaskId: string, payload: YouGileUpdateTaskDto): void {
  yougileMutationQueue.push({ type: "update", yougileTaskId, payload });
  processYougileQueue();
}

/** Поставить в очередь удаление задачи в YouGile. */
export function yougileEnqueueDelete(yougileTaskId: string): void {
  yougileMutationQueue.push({ type: "delete", yougileTaskId });
  processYougileQueue();
}

/** Поставить в очередь отправку сообщения в чат задачи YouGile. */
export function yougileEnqueueComment(yougileTaskId: string, text: string): void {
  const normalizedText = text.trim();
  if (!normalizedText) return;
  yougileMutationQueue.push({ type: "comment", yougileTaskId, text: normalizedText });
  processYougileQueue();
}

/** Поставить в очередь создание задачи в YouGile; onSuccess вызовется с ответом YouGile (например, обновить нашу задачу yougileTaskId). */
export function yougileEnqueueCreate(
  ourTaskId: string,
  boardId: string,
  dto: YouGileCreateTaskDto,
  onSuccess?: (ygTask: YouGileTask) => Promise<void>
): void {
  yougileMutationQueue.push({ type: "create", ourTaskId, boardId, dto, onSuccess });
  processYougileQueue();
}
