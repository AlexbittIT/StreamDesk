import { useState, useEffect, useRef } from "react";
import { Terminal as TerminalIcon, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/lib/queryClient";

const POLL_INTERVAL_MS = 2500;
const LOG_LIMIT = 15;

export default function Terminal() {
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(true);

  const fetchLogs = async () => {
    try {
      const res = await fetch(apiUrl(`/api/terminal/logs?limit=${LOG_LIMIT}`), { credentials: "include" });
      if (res.status === 403) {
        const data = await res.json().catch(() => ({}));
        setError((data?.message as string) || "Доступ только для администратора. Войдите в систему под учётной записью с ролью «Администратор» и откройте Терминал снова.");
        return;
      }
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      if (Array.isArray(data.lines)) setLines(data.lines);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки логов");
    }
  };

  useEffect(() => {
    fetchLogs();
    const id = setInterval(fetchLogs, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!shouldScrollRef.current || !containerRef.current) return;
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [lines]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    shouldScrollRef.current = scrollHeight - scrollTop - clientHeight < 80;
  };

  return (
    <div className="flex flex-col h-full gap-2 p-4">
      <div className="flex items-center justify-between shrink-0">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <TerminalIcon className="h-5 w-5" />
          Терминал сервера
        </h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchLogs()}
        >
          <RefreshCw className="h-4 w-4 mr-1" />
          Обновить
        </Button>
      </div>
      {error && (
        <div className="text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
          {error}
        </div>
      )}
      <p className="text-xs text-muted-foreground shrink-0">Последние {LOG_LIMIT} записей</p>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className={cn(
          "flex-1 min-h-0 rounded-lg border overflow-auto p-3 font-mono text-xs sm:text-sm",
          "bg-zinc-950 text-zinc-100 border-zinc-800",
          "selection:bg-zinc-600"
        )}
      >
        {lines.length === 0 && !error && (
          <div className="text-zinc-500 space-y-1">
            <p>Ожидание логов…</p>
            <p className="text-xs">Логи появляются при запросах к API и при старте сервера. Если долго пусто — проверьте, что ваша роль есть в списке доступа: Настройки → Безопасность → Доступ к Терминалу.</p>
          </div>
        )}
        {lines.map((line, i) => (
          <div key={`${i}-${line.slice(0, 40)}`} className="whitespace-pre-wrap break-all">
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}
