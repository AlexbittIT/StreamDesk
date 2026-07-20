/**
 * Цвета категорий сигнала — единый источник для всей схемы.
 *
 * Одни и те же цвета нужны чипам фильтра в панели, рамкам карточек и подсветке коридоров.
 * Пока они были прописаны в трёх местах по отдельности, «Video» в панели и рамка видеоустройства
 * оказывались разными оттенками. Держим здесь.
 *
 * Значения — палитра Tailwind 500, чтобы hex и классы совпадали пиксель в пиксель.
 */

export type SignalCategory =
  | "video"
  | "audio"
  | "network"
  | "power"
  | "data"
  | "control"
  | "wireless"
  | "other";

export interface CategoryColor {
  /** Для SVG: рамки карточек, линии, коридоры. */
  hex: string;
  /** Прозрачная заливка коридора. */
  fill: string;
  label: string;
  /** Классы Tailwind для чипов. Писать литералами — JIT не видит собранные на лету строки. */
  dotClass: string;
  activeClass: string;
}

export const CATEGORY_COLORS: Record<SignalCategory, CategoryColor> = {
  video: {
    hex: "#3b82f6",
    fill: "rgba(59, 130, 246, 0.10)",
    label: "Video",
    dotClass: "bg-blue-500",
    activeClass: "border-blue-500 bg-blue-500/15 text-blue-300",
  },
  audio: {
    hex: "#22c55e",
    fill: "rgba(34, 197, 94, 0.10)",
    label: "Audio",
    dotClass: "bg-green-500",
    activeClass: "border-green-500 bg-green-500/15 text-green-300",
  },
  network: {
    hex: "#6366f1",
    fill: "rgba(99, 102, 241, 0.10)",
    label: "Network",
    dotClass: "bg-indigo-500",
    activeClass: "border-indigo-500 bg-indigo-500/15 text-indigo-300",
  },
  power: {
    hex: "#d946ef",
    fill: "rgba(217, 70, 239, 0.10)",
    label: "Power",
    dotClass: "bg-fuchsia-500",
    activeClass: "border-fuchsia-500 bg-fuchsia-500/15 text-fuchsia-300",
  },
  data: {
    hex: "#a855f7",
    fill: "rgba(168, 85, 247, 0.10)",
    label: "Data",
    dotClass: "bg-purple-500",
    activeClass: "border-purple-500 bg-purple-500/15 text-purple-300",
  },
  control: {
    hex: "#f59e0b",
    fill: "rgba(245, 158, 11, 0.10)",
    label: "Control",
    dotClass: "bg-amber-500",
    activeClass: "border-amber-500 bg-amber-500/15 text-amber-300",
  },
  wireless: {
    hex: "#38bdf8",
    fill: "rgba(56, 189, 248, 0.10)",
    label: "Wireless",
    dotClass: "bg-sky-400",
    activeClass: "border-sky-400 bg-sky-400/15 text-sky-300",
  },
  other: {
    hex: "#64748b",
    fill: "rgba(100, 116, 139, 0.08)",
    label: "Прочее",
    dotClass: "bg-slate-500",
    activeClass: "border-slate-500 bg-slate-500/15 text-slate-300",
  },
};

/** Категории, вынесенные в чипы фильтра. Порядок как в макете. */
export const FILTER_CATEGORIES: SignalCategory[] = ["video", "audio", "network", "power"];

export function categoryColor(category: string): CategoryColor {
  return CATEGORY_COLORS[category as SignalCategory] ?? CATEGORY_COLORS.other;
}
