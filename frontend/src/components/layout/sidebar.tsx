import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChartLine,
  Calendar,
  Package,
  Monitor,
  Video,
  Bell,
  Settings,
  RadioTower,
  ClipboardList,
  Shield,
  LogOut,
  Film,
  MessageSquare,
  Clock,
  GripVertical,
  Gauge,
  BrainCircuit,
  Wrench,
  BarChart3,
  Network,
  Radio,
  Map,
  CalendarDays,
  Terminal,
  Building2,
  FileSpreadsheet,
  Users,
} from "lucide-react";
import { useState, useRef, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { tabPermission, PERMISSIONS } from "@shared/schema";
import { apiUrl } from "@/lib/queryClient";

interface SidebarProps {
  user?: any;
  isOpen: boolean;
  onClose: () => void;
  onLogout?: () => void;
}
const navigation = [
  { tabKey: "dashboard", name: "Панель управления", href: "/", icon: ChartLine },
  { tabKey: "calendar", name: "Календарь", href: "/calendar", icon: Calendar },
  { tabKey: "maps", name: "Карты", href: "/maps", icon: Map },
  { tabKey: "room-booking", name: "Бронирование комнат", href: "/room-booking", icon: CalendarDays },
  { tabKey: "tasks", name: "Задачи", href: "/tasks", icon: ClipboardList },
  { tabKey: "equipment", name: "Склад техники", href: "/equipment", icon: Package },
  { tabKey: "estimates", name: "Смета", href: "/estimates", icon: FileSpreadsheet },
  { tabKey: "projects", name: "Проекты", href: "/projects", icon: Film },
  { tabKey: "monitoring", name: "Мониторинг", href: "/monitoring", icon: Monitor },
  { tabKey: "streams", name: "Стриминг", href: "/streams", icon: Video },
  { tabKey: "connection-schemas", name: "Схемы подключения", href: "/connection-schemas", icon: Network },
  { tabKey: "otis-onair", name: "Эфир ОТИС", href: "/otis-onair", icon: Radio },
  { tabKey: "chatgpt", name: "ChatGPT", href: "/chatgpt", icon: MessageSquare },
  { tabKey: "notifications", name: "Уведомления", href: "/notifications", icon: Bell },
  { tabKey: "settings", name: "Настройки", href: "/settings", icon: Settings },
];

const managerNavigation = [
  { name: "Панель менеджера", href: "/manager-dashboard", icon: ChartLine },
];

const serviceNavigation = [
  { name: "Панель компании", href: "/admin", icon: Shield, visibility: "company-admin" as const },
  { name: "Платформа", href: "/platform-admin", icon: Building2, visibility: "platform-admin" as const },
  { name: "Терминал", href: "/terminal", icon: Terminal, visibility: "terminal" as const },
];

const platformNavigation = [
  { name: "Обзор", href: "/platform-admin", icon: Gauge },
  { name: "Компании", href: "/platform-admin?tab=companies", icon: Building2 },
  { name: "Пользователи", href: "/platform-admin?tab=users", icon: Users },
  { name: "AI", href: "/platform-admin?tab=ai", icon: BrainCircuit },
  { name: "Инциденты", href: "/platform-admin?tab=incidents", icon: Wrench },
  { name: "Метрики", href: "/platform-admin?tab=metrics", icon: BarChart3 },
];

function SidebarLink({
  href,
  icon: Icon,
  label,
  isActive,
  collapsed,
  onClick,
}: {
  href: string;
  icon: typeof ChartLine;
  label: string;
  isActive: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center rounded-md transition-all cursor-pointer group relative min-h-[36px] sm:min-h-[40px] touch-target border-l-4",
        collapsed ? "justify-center p-2" : "space-x-2 p-2 sm:p-2.5",
        isActive ? "border-primary bg-primary/10 text-primary" : "border-transparent text-foreground hover:bg-muted"
      )}
      title={collapsed ? label : undefined}
    >
      <Icon className={cn("w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0", isActive && "text-primary")} />
      {!collapsed && <span className="font-medium truncate">{label}</span>}
      {collapsed && (
        <div className="absolute left-full ml-2 px-2 py-1 bg-popover border rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 pointer-events-none">
          {label}
        </div>
      )}
    </Link>
  );
}
export default function Sidebar({ user, isOpen, onClose, onLogout }: SidebarProps) {
  const [location] = useLocation();
  const touchStartX = useRef(0);
  const { data: terminalAccess } = useQuery({
    queryKey: ["/api/terminal/access"],
    queryFn: async () => {
      const response = await fetch(apiUrl("/api/terminal/access"), { credentials: "include" });
      if (!response.ok) return { allowedRoles: [] as string[] };
      const data = await response.json();
      return { allowedRoles: Array.isArray(data?.allowedRoles) ? data.allowedRoles : [] };
    },
    staleTime: 60_000,
  });

  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebar_collapsed");
    return saved === "true";
  });

  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
  const canViewTerminal = Boolean(user?.role && terminalAccess?.allowedRoles?.includes(user.role));
  const canViewCompanyAdmin =
    user?.role === "admin" ||
    user?.role === "manager" ||
    user?.workspaceMode === "company_owner" ||
    permissions.includes(PERMISSIONS.ADMIN_PANEL);
  const canViewPlatformAdmin = user?.role === "admin" && permissions.includes(PERMISSIONS.PLATFORM_ADMIN);
  const isOwnerMode = canViewPlatformAdmin;
  const currentHref =
    typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : location;
  const isNavActive = (href: string) => {
    if (href.startsWith("/platform-admin")) {
      const currentTab = new URLSearchParams(currentHref.split("?")[1] || "").get("tab") || "overview";
      const itemTab = new URLSearchParams(href.split("?")[1] || "").get("tab") || "overview";
      return currentHref.startsWith("/platform-admin") && currentTab === itemTab;
    }
    return location === href || currentHref === href;
  };

  const getRoleLabel = (role: string) => {
    if (canViewPlatformAdmin) return "Владелец платформы";
    switch (role) {
      case "admin":
        return "Администратор";
      case "manager":
        return "Менеджер";
      default:
        return "Сотрудник";
    }
  };

  const canAccessTab = (tabKey: string): boolean => {
    if (!user) return false;
    const hasAnyTab = permissions.some((permission: string) => permission.startsWith("tab:"));
    if (hasAnyTab) return permissions.includes(tabPermission(tabKey));
    if (user.role === "admin") return true;
    return true;
  };

  const visibleServiceNavigation = serviceNavigation.filter((item) => {
    if (isOwnerMode) return false;
    if (item.visibility === "terminal") return canViewTerminal;
    if (item.visibility === "platform-admin") return canViewPlatformAdmin;
    return canViewCompanyAdmin;
  });
  const visiblePrimaryNavigation = isOwnerMode ? navigation.filter((item) => item.tabKey === "settings") : navigation.filter((item) => canAccessTab(item.tabKey));

  const toggleCollapse = () => {
    const nextCollapsed = !collapsed;
    setCollapsed(nextCollapsed);
    localStorage.setItem("sidebar_collapsed", String(nextCollapsed));
    window.dispatchEvent(new Event("sidebar-collapse-change"));
  };
  const closeAndSyncPlatformTab = (href: string) => {
    onClose();
    if (href.startsWith("/platform-admin")) {
      window.setTimeout(() => window.dispatchEvent(new Event("platform-admin-tab-change")), 0);
    }
  };

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />}

      <div
        className={cn(
          "fixed left-0 top-0 h-full z-50 transition-all duration-300 ease-in-out lg:translate-x-0 flex flex-col overflow-hidden",
          "bg-slate-50 border-r border-slate-200 shadow-xl dark:bg-zinc-900 dark:border-zinc-800 dark:shadow-none dark:backdrop-blur-md",
          isOpen ? "translate-x-0" : "-translate-x-full",
          collapsed ? "w-14 sm:w-16 lg:w-14 xl:w-16" : "w-[200px] sm:w-56 lg:w-[200px] xl:w-56 max-w-[80vw] lg:max-w-none"
        )}
        onTouchStart={(event) => {
          touchStartX.current = event.touches[0].clientX;
        }}
        onTouchEnd={(event) => {
          const delta = event.changedTouches[0].clientX - touchStartX.current;
          if (isOpen && delta < -50) onClose();
        }}
      >
        <Button
          variant="ghost"
          size="icon"
          aria-label={collapsed ? "Развернуть боковое меню" : "Свернуть боковое меню"}
          className={cn(
            "absolute -right-2 top-1/2 z-10 hidden h-20 w-4 -translate-y-1/2 rounded-full border border-border/70 bg-card/90 p-0 shadow-sm lg:flex",
            "transition-colors hover:bg-primary/10 focus:bg-primary/10"
          )}
          onClick={toggleCollapse}
        >
          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </Button>

        <div className={cn("p-2 sm:p-3 border-b border-border", collapsed && "p-2")}>
          <div className={cn("flex items-center", collapsed ? "justify-center" : "space-x-2")}>
            <div className="relative w-8 h-8 sm:w-9 sm:h-9 bg-primary rounded-lg flex items-center justify-center shadow flex-shrink-0">
              <RadioTower className="text-primary-foreground h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-bold text-foreground truncate">StreamDesk</h1>
                <p className="text-[11px] sm:text-xs text-muted-foreground truncate">Рабочее пространство для команд и компаний</p>
              </div>
            )}
          </div>
        </div>

        <nav
          className="flex-1 p-1.5 sm:p-2 space-y-0.5 overflow-y-auto hide-scrollbar"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as CSSProperties}
        >
          {visiblePrimaryNavigation.map((item) => (
            <SidebarLink
              key={item.tabKey}
              href={item.href}
              icon={item.icon}
              label={item.name}
              isActive={isNavActive(item.href)}
              collapsed={collapsed}
              onClick={onClose}
            />
          ))}

          {!isOwnerMode && canAccessTab("vmix-scheduler") && (
            <div className="my-4 border-t border-border pt-4">
              <Link
                href="/vmix-scheduler"
                onClick={onClose}
                className={cn(
                  "flex items-center rounded-md transition-all cursor-pointer group relative min-h-[36px] sm:min-h-[40px] touch-target border-l-4",
                  collapsed ? "justify-center p-2" : "space-x-2 p-2 sm:p-2.5",
                  location === "/vmix-scheduler" ? "border-primary bg-primary/10 text-primary" : "border-transparent text-foreground hover:bg-muted"
                )}
                title={collapsed ? "Расписатель vMix" : undefined}
              >
                <Clock className={cn("w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0", location === "/vmix-scheduler" && "text-primary")} />
                {!collapsed && (
                  <>
                    <span className="font-medium truncate">Расписатель vMix</span>
                    <Badge variant="secondary" className="ml-auto text-xs flex-shrink-0">
                      Beta
                    </Badge>
                  </>
                )}
                {collapsed && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-popover border rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 pointer-events-none">
                    Расписатель vMix
                  </div>
                )}
              </Link>
            </div>
          )}

          {(isOwnerMode || visibleServiceNavigation.length > 0 || (canViewCompanyAdmin && !isOwnerMode)) && (
            <>
              {!collapsed && (
                <div className="my-4 border-t border-border pt-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-3">Управление</p>
                </div>
              )}

              {isOwnerMode &&
                platformNavigation.map((item) => (
                  <SidebarLink
                    key={item.href}
                    href={item.href}
                    icon={item.icon}
                    label={item.name}
                    isActive={isNavActive(item.href)}
                    collapsed={collapsed}
                    onClick={() => closeAndSyncPlatformTab(item.href)}
                  />
                ))}

              {visibleServiceNavigation.map((item) => (
                <SidebarLink
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  label={item.name}
                  isActive={isNavActive(item.href)}
                  collapsed={collapsed}
                  onClick={onClose}
                />
              ))}

              {!isOwnerMode && canViewCompanyAdmin &&
                managerNavigation.map((item) => (
                  <SidebarLink
                    key={item.href}
                    href={item.href}
                    icon={item.icon}
                    label={item.name}
                    isActive={isNavActive(item.href)}
                    collapsed={collapsed}
                    onClick={onClose}
                  />
                ))}
            </>
          )}
        </nav>

        <div className={cn("p-2 sm:p-3 border-t border-border", collapsed && "p-2")}>
          <div className="bg-muted/50 rounded-lg p-3">
            <div className={cn("flex items-center", collapsed ? "justify-center" : "space-x-3")}>
              <Avatar className={cn("flex-shrink-0 touch-target", collapsed ? "w-8 h-8" : "w-10 h-10")}>
                <AvatarImage src={user?.avatar || undefined} />
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {user?.name?.split(" ").map((part: string) => part[0]).join("") || "U"}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{user?.name || "Гость"}</p>
                  <p className="text-xs text-muted-foreground">{user ? getRoleLabel(user.role) : "Не авторизован"}</p>
                </div>
              )}
            </div>

            {onLogout && !collapsed && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={onLogout}
                data-testid="button-logout"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Выйти
              </Button>
            )}

            {onLogout && collapsed && (
              <Button
                variant="ghost"
                size="icon"
                className="w-full mt-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={onLogout}
                title="Выйти"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
