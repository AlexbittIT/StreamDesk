import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  ChartLine,
  Calendar,
  Map,
  CalendarDays,
  ClipboardList,
  Package,
  FileSpreadsheet,
  Bell,
  Settings,
  Menu,
} from "lucide-react";
import { tabPermission } from "@shared/schema";

const STORAGE_KEY = "streamdesk_bottom_nav_tabs";

/** Кандидаты для нижней панели: tabKey, короткая подпись, иконка, href (пусто = «Ещё», открывает меню) */
const CANDIDATES: Array<{
  tabKey: string;
  label: string;
  shortLabel: string;
  icon: typeof ChartLine;
  href: string;
}> = [
  { tabKey: "dashboard", label: "Панель управления", shortLabel: "Главная", icon: ChartLine, href: "/" },
  { tabKey: "calendar", label: "Календарь", shortLabel: "Календарь", icon: Calendar, href: "/calendar" },
  { tabKey: "maps", label: "Карты", shortLabel: "Карты", icon: Map, href: "/maps" },
  { tabKey: "room-booking", label: "Бронирование комнат", shortLabel: "Бронирование", icon: CalendarDays, href: "/room-booking" },
  { tabKey: "tasks", label: "Задачи", shortLabel: "Задачи", icon: ClipboardList, href: "/tasks" },
  { tabKey: "equipment", label: "Склад техники", shortLabel: "Склад", icon: Package, href: "/equipment" },
  { tabKey: "estimates", label: "Смета", shortLabel: "Смета", icon: FileSpreadsheet, href: "/estimates" },
  { tabKey: "notifications", label: "Уведомления", shortLabel: "Уведомления", icon: Bell, href: "/notifications" },
  { tabKey: "settings", label: "Настройки", shortLabel: "Настройки", icon: Settings, href: "/settings" },
];

const DEFAULT_TAB_KEYS = ["dashboard", "calendar", "tasks", "equipment", "more"] as const;
const MAX_TABS = 5;

function loadSavedTabKeys(): string[] {
  if (typeof window === "undefined") return [...DEFAULT_TAB_KEYS];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_TAB_KEYS];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [...DEFAULT_TAB_KEYS];
  } catch {
    return [...DEFAULT_TAB_KEYS];
  }
}

function saveTabKeys(keys: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch (_) {}
}

export function getBottomNavTabKeys(): string[] {
  return loadSavedTabKeys();
}

export function setBottomNavTabKeys(keys: string[]) {
  saveTabKeys(keys.slice(0, MAX_TABS));
}

interface BottomNavProps {
  user?: any;
  onOpenMenu: () => void;
}

export function BottomNav({ user, onOpenMenu }: BottomNavProps) {
  const [location] = useLocation();
  const tabKeys = loadSavedTabKeys();

  const canAccessTab = (tabKey: string): boolean => {
    if (!user) return false;
    if (user.role === "admin") return true;
    const perms = (user.permissions as string[]) || [];
    const hasAny = perms.some((p: string) => p.startsWith("tab:"));
    if (!hasAny) return true;
    return perms.includes(tabPermission(tabKey));
  };

  const visibleItems = tabKeys.slice(0, MAX_TABS).map((key) => {
    if (key === "more") {
      return { key: "more", label: "Ещё", shortLabel: "Ещё", icon: Menu, href: "", isMore: true };
    }
    const c = CANDIDATES.find((x) => x.tabKey === key);
    if (!c || !canAccessTab(key)) return null;
    return { ...c, isMore: false };
  }).filter(Boolean) as Array<{
    key: string;
    label: string;
    shortLabel: string;
    icon: typeof ChartLine;
    href: string;
    isMore: boolean;
  }>;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden safe-area-bottom px-3 pb-3 pt-2"
      role="navigation"
      aria-label="Основное меню"
    >
      <div className="flex items-stretch justify-around min-h-[56px] max-w-[100vw] rounded-[22px] bg-background/50 dark:bg-background/40 backdrop-blur-xl border border-border/40 shadow-lg">
        {visibleItems.map((item, index) => {
          const Icon = item.icon;
          const isActive = !item.isMore && location === item.href;
          const uniqueKey = item.isMore ? `more-${index}` : `nav-${item.key}-${index}`;

          if (item.isMore) {
            return (
              <button
                key={uniqueKey}
                type="button"
                onClick={onOpenMenu}
                className={cn(
                  "flex flex-col items-center justify-center flex-1 min-w-0 py-2 px-1 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/30 active:bg-muted/50 transition-colors touch-manipulation",
                )}
                aria-label="Открыть меню"
              >
                <Icon className="w-6 h-6 shrink-0" strokeWidth={2} />
                <span className="text-[10px] sm:text-xs mt-0.5 truncate w-full text-center">{item.shortLabel}</span>
              </button>
            );
          }

          return (
            <Link
              key={uniqueKey}
              href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center flex-1 min-w-0 py-2 px-1 rounded-xl transition-colors touch-manipulation",
                  isActive
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30 active:bg-muted/50",
                )}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className={cn("w-6 h-6 shrink-0", isActive && "text-primary")} strokeWidth={isActive ? 2.25 : 2} />
              <span className={cn("text-[10px] sm:text-xs mt-0.5 truncate w-full text-center", isActive && "text-primary font-medium")}>
                {item.shortLabel}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Список всех кандидатов для настройки (в настройках экрана) */
export function getBottomNavCandidates() {
  return CANDIDATES;
}

export const DEFAULT_BOTTOM_NAV_KEYS = [...DEFAULT_TAB_KEYS];
export const BOTTOM_NAV_MAX_TABS = MAX_TABS;
