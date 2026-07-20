import { cn } from "@/lib/utils";
import { CATEGORY_COLORS, FILTER_CATEGORIES } from "./category-colors";

/** Категории, по которым фильтруется схема. Цвета — общие с рамками карточек и коридорами. */
const CHIPS = FILTER_CATEGORIES.map((key) => ({
  key,
  label: CATEGORY_COLORS[key].label,
  dot: CATEGORY_COLORS[key].dotClass,
  active: CATEGORY_COLORS[key].activeClass,
}));

interface SignalCategoryChipsProps {
  /** Выбранные категории. Пустой массив — фильтр не применён. */
  value: string[];
  onChange: (next: string[]) => void;
}

/**
 * Чипы фильтра категорий сигнала. Выбранные категории остаются яркими, остальные приглушаются —
 * связь не исчезает совсем, иначе легко решить, что её просто нет.
 */
export function SignalCategoryChips({ value, onChange }: SignalCategoryChipsProps) {
  const toggle = (key: string) => {
    onChange(value.includes(key) ? value.filter((item) => item !== key) : [...value, key]);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {CHIPS.map((chip) => {
        const isActive = value.includes(chip.key);
        return (
          <button
            key={chip.key}
            type="button"
            onClick={() => toggle(chip.key)}
            aria-pressed={isActive}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              isActive
                ? chip.active
                : "border-slate-600 bg-slate-800/80 text-slate-300 hover:bg-slate-700/80",
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", chip.dot)} />
            {chip.label}
          </button>
        );
      })}
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="rounded-full border border-slate-600 bg-slate-800/80 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700/80"
        >
          Сбросить
        </button>
      )}
    </div>
  );
}
