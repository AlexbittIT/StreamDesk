import { QueryClient, QueryFunction } from "@tanstack/react-query";

const API_BASE = (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_BASE) || "";

/** Кодирует объект пользователя для заголовка x-user (только ASCII), чтобы избежать ошибки "non ISO-8859-1 code point" при кириллице в имени. */
export function encodeUserHeader(user: object | null | undefined): string {
  if (!user) return "";
  try {
    const json = JSON.stringify(user);
    return typeof btoa !== "undefined"
      ? btoa(unescape(encodeURIComponent(json)))
      : json;
  } catch {
    return "";
  }
}

function getStoredUserHeader(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = localStorage.getItem("streamstudio_user");
    if (!raw) return "";
    return encodeUserHeader(JSON.parse(raw));
  } catch {
    return "";
  }
}

/** Базовый URL для API (учитывает VITE_API_BASE). Используйте для fetch, чтобы не получать HTML вместо JSON. */
export function apiUrl(path: string): string {
  if (path.startsWith("http")) return path;
  const base = API_BASE.replace(/\/$/, "");
  return base ? `${base}${path.startsWith("/") ? path : `/${path}`}` : path;
}

/** Безопасный разбор JSON из Response. При ответе с HTML (например 404) не бросает "Unexpected token '<'". */
export async function safeJson<T>(res: Response, fallback: T): Promise<T> {
  const text = await res.text();
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return fallback;
  try {
    const data = JSON.parse(text);
    return data as T;
  } catch {
    return fallback;
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('streamstudio_user');
      const path = typeof window !== "undefined" ? window.location.pathname : "";
      if (path !== "/" && path !== "/login") {
        window.location.href = "/login";
      }
    }
    const text = (await res.text()) || res.statusText;
    let message = text;
    try {
      const j = JSON.parse(text);
      if (j && typeof j.message === "string") message = j.message;
    } catch (_) {}
    throw new Error(message);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  isFormData: boolean = false,
): Promise<Response> {
  // Для операций создания/обновления (POST/PUT) увеличиваем таймаут до 60 секунд
  // Для GET запросов - 15 секунд (быстрее для лучшего UX)
  // Для DELETE - 10 секунд
  const isMutation = method === 'POST' || method === 'PUT' || method === 'PATCH';
  const isDelete = method === 'DELETE';
  const timeoutMs = isMutation ? 60000 : isDelete ? 10000 : 15000;
  
  // Создаем AbortController для таймаута
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: HeadersInit = {};
    if (data && !isFormData) {
      headers["Content-Type"] = "application/json";
    }
    const userHeader = getStoredUserHeader();
    if (userHeader) headers["x-user"] = userHeader;

    const res = await fetch(apiUrl(url), {
      method,
      headers,
      body: data ? (isFormData ? data as FormData : JSON.stringify(data)) : undefined,
      credentials: "include",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    await throwIfResNotOk(res);
    return res;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      const timeoutSeconds = timeoutMs / 1000;
      throw new Error(`Запрос превысил время ожидания (${timeoutSeconds} секунд). Проверьте подключение к серверу и попробуйте снова.`);
    }
    throw error;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export function getQueryFn<T>(options: {
  on401: UnauthorizedBehavior;
}): QueryFunction<T> {
  const { on401: unauthorizedBehavior } = options;
  return async ({ queryKey }) => {
      // Создаем AbortController для таймаута
      // Уменьшаем таймаут для GET запросов до 15 секунд для лучшего UX
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 секунд для GET запросов

    try {
      const url = apiUrl(queryKey.join("/") as string);
      const res = await fetch(url, {
        credentials: "include",
        headers: (() => {
          const userHeader = getStoredUserHeader();
          return userHeader ? { "x-user": userHeader } : undefined;
        })(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      // Если ошибка, но не 401, возвращаем пустой массив для списков
      if (!res.ok && res.status !== 401) {
        const text = await res.text().catch(() => "");
        // Для GET запросов к спискам возвращаем пустой массив
        if (res.status === 500 && queryKey[0]?.toString().includes('/api/')) {
          console.warn(`API error for ${queryKey.join('/')}:`, text);
          return [] as T;
        }
        throw new Error(`${res.status}: ${text || res.statusText}`);
      }

      await throwIfResNotOk(res);
      return await res.json();
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        console.warn(`Request timeout for ${queryKey.join('/')}`);
        return [] as T; // Возвращаем пустой массив при таймауте
      }
      // Для ошибок подключения также возвращаем пустой массив
      if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
        console.warn(`Network error for ${queryKey.join('/')}:`, error.message);
        return [] as T;
      }
      throw error;
    }
  };
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 30000, // 30 секунд - данные считаются свежими
      retry: 1, // 1 попытка повтора
      retryDelay: 1000, // 1 секунда между попытками
      retryOnMount: false, // Не повторять при монтировании
      // Возвращаем пустой массив при ошибках вместо падения
      throwOnError: false,
    },
    mutations: {
      retry: 0, // Не повторять мутации
      throwOnError: false, // Не падать при ошибках мутаций
    },
  },
});
