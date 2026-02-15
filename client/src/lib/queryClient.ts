import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    // Если 401 (Unauthorized), очищаем localStorage и перенаправляем на логин
    if (res.status === 401) {
      localStorage.removeItem('streamstudio_user');
      // Перенаправляем на страницу логина только если мы не на ней уже
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
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

    const res = await fetch(url, {
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
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
      // Создаем AbortController для таймаута
      // Уменьшаем таймаут для GET запросов до 15 секунд для лучшего UX
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 секунд для GET запросов

    try {
      const res = await fetch(queryKey.join("/") as string, {
        credentials: "include",
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
