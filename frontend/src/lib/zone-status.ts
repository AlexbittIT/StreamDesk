// Статусы зон схемы подключения: метки и цвета (палитра совпадает со «Схемой площадки»/Maps).
// Общий модуль, чтобы холст, панель и легенда использовали один источник правды.

export const ZONE_STATUS_META: Record<string, { label: string; color: string }> = {
  not_started: { label: "Не начато", color: "#64748b" },
  in_progress: { label: "В работе", color: "#eab308" },
  done: { label: "Готово", color: "#22c55e" },
  needs_review: { label: "Требует проверки", color: "#3b82f6" },
  problem: { label: "Проблема", color: "#ef4444" },
  verified: { label: "Проверено", color: "#15803d" },
};

export const ZONE_STATUS_ORDER = [
  "not_started",
  "in_progress",
  "done",
  "needs_review",
  "problem",
  "verified",
];

/** Цвет заливки/обводки зоны по её статусу (по умолчанию — «Не начато»). */
export function zoneStatusColor(status?: string): string {
  return ZONE_STATUS_META[status || "not_started"]?.color || ZONE_STATUS_META.not_started.color;
}
