/**
 * Кольцевой буфер последних логов сервера для вкладки «Терминал».
 * Не логирует пароли и токены.
 */

const MAX_LINES = 500;
const lines: string[] = [];

export function addTerminalLog(line: string) {
  const safe = line.replace(/\b(password|token|secret|key)=[^\s&]+/gi, "$1=***");
  lines.push(safe);
  if (lines.length > MAX_LINES) lines.shift();
}

/** Последние N строк (по умолчанию 15). Если limit задан, since игнорируется. */
export function getTerminalLogs(sinceIndex: number = 0, limit?: number): { lines: string[]; nextIndex: number } {
  if (limit != null && limit > 0) {
    const start = Math.max(0, lines.length - limit);
    return {
      lines: lines.slice(start),
      nextIndex: lines.length,
    };
  }
  const start = Math.max(0, Math.min(sinceIndex, lines.length));
  return {
    lines: lines.slice(start),
    nextIndex: lines.length,
  };
}
