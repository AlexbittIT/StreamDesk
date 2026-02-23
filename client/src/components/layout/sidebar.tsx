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
  Server,
  Bell,
  Settings,
  RadioTower,
  ClipboardList,
  Shield,
  LogOut,
  Laptop,
  Film,
  MessageSquare,
  Clock,
  FileText,
  ChevronLeft,
  ChevronRight,
  Network,
  Radio,
  Map,
  CalendarDays,
  Terminal
} from "lucide-react";
import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { TAB_LABELS, tabPermission } from "@shared/schema";
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
  { tabKey: "transcription", name: "Транскрибация", href: "/transcription", icon: FileText },
  { tabKey: "computers", name: "Компьютеры", href: "/computers", icon: Laptop },
  { tabKey: "projects", name: "Видеопроекты", href: "/projects", icon: Film },
  { tabKey: "monitoring", name: "Мониторинг системы", href: "/monitoring", icon: Monitor },
  { tabKey: "streams", name: "Стриминг", href: "/streams", icon: Video },
  { tabKey: "servers", name: "Серверы", href: "/servers", icon: Server },
  { tabKey: "connection-schemas", name: "Схемы подключения", href: "/connection-schemas", icon: Network },
  { tabKey: "otis-onair", name: "Эфир ОТИС", href: "/otis-onair", icon: Radio },
  { tabKey: "chatgpt", name: "ChatGPT", href: "/chatgpt", icon: MessageSquare },
  { tabKey: "notifications", name: "Уведомления", href: "/notifications", icon: Bell },
  { tabKey: "settings", name: "Настройки", href: "/settings", icon: Settings },
];

const managerNavigation = [
  { name: "Дашборд менеджера", href: "/manager-dashboard", icon: ChartLine },
];

const adminNavigation = [
  { name: "Терминал", href: "/terminal", icon: Terminal },
  { name: "Администрирование", href: "/admin", icon: Shield },
];

export default function Sidebar({ user, isOpen, onClose, onLogout }: SidebarProps) {
  const [location] = useLocation();
  const touchStartX = useRef(0);
  const { data: terminalAccess } = useQuery({
    queryKey: ["/api/terminal/access"],
    queryFn: async () => {
      const r = await fetch(apiUrl("/api/terminal/access"), { credentials: "include" });
      if (!r.ok) return { allowedRoles: [] as string[] };
      const d = await r.json();
      return { allowedRoles: Array.isArray(d?.allowedRoles) ? d.allowedRoles : [] };
    },
    staleTime: 60_000,
  });
  const canViewTerminal = Boolean(user?.role && terminalAccess?.allowedRoles?.includes(user.role));
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    return saved === 'true';
  });

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "admin": return "Администратор";
      case "manager": return "Менеджер";
      default: return "Сотрудник";
    }
  };

  const canAccessTab = (tabKey: string): boolean => {
    if (!user) return false;
    if (user.role === "admin") return true;
    const perms = (user.permissions as string[]) || [];
    const hasAnyTab = perms.some((p) => p.startsWith("tab:"));
    if (!hasAnyTab) return true;
    return perms.includes(tabPermission(tabKey));
  };

  const toggleCollapse = () => {
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    localStorage.setItem('sidebar_collapsed', String(newCollapsed));
    // Уведомляем другие компоненты об изменении
    window.dispatchEvent(new Event('sidebar-collapse-change'));
  };

  return (
    <>
      {/* Overlay для мобильных */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}
      
      <div
        className={cn(
          "fixed left-0 top-0 h-full z-50 transition-all duration-300 ease-in-out lg:translate-x-0 flex flex-col overflow-hidden",
          "bg-slate-50 border-r border-slate-200 shadow-xl dark:bg-zinc-900 dark:border-zinc-800 dark:shadow-none dark:backdrop-blur-md",
          isOpen ? "translate-x-0" : "-translate-x-full",
          collapsed ? "w-16 sm:w-20 lg:w-16 xl:w-20" : "w-[260px] sm:w-72 lg:w-[260px] xl:w-72 max-w-[85vw] lg:max-w-none"
        )}
        onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          const dx = e.changedTouches[0].clientX - touchStartX.current;
          if (isOpen && dx < -50) onClose();
        }}
      >
        {/* Кнопка сворачивания */}
        <Button
          variant="ghost"
          size="icon"
          aria-label={collapsed ? 'Развернуть сайдбар' : 'Свернуть сайдбар'}
          className={cn(
            "absolute -right-4 top-20 z-10 h-8 w-8 rounded-full border bg-card shadow-md lg:flex hidden",
            "transition-transform duration-200 ease-in-out transform hover:scale-105 focus:scale-105",
            collapsed ? "-translate-x-1" : "translate-x-0"
          )}
          onClick={toggleCollapse}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 transition-transform duration-200" />
          ) : (
            <ChevronLeft className="h-4 w-4 transition-transform duration-200" />
          )}
        </Button>
      <div className={cn("p-3 sm:p-4 border-b border-border", collapsed && "p-3")}>
        <div className={cn("flex items-center", collapsed ? "justify-center" : "space-x-3")}>
          <div className="relative w-10 h-10 bg-primary rounded-lg flex items-center justify-center shadow flex-shrink-0">
            <RadioTower className="text-primary-foreground h-6 w-6" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-foreground truncate">
                <span className={cn('selected')}>StreamDesk</span>
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">Управление с чего угодно</p>
            </div>
          )}
        </div>
      </div>

      <nav 
        className="flex-1 p-2 sm:p-3 space-y-0.5 overflow-y-auto hide-scrollbar"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none'
        } as React.CSSProperties}
      >
        {navigation.filter((item) => canAccessTab(item.tabKey)).map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href;
          
          return (
            <Link
              key={item.tabKey}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center rounded-lg transition-all cursor-pointer group relative min-h-[44px] touch-target border-l-4",
                collapsed ? "justify-center p-3" : "space-x-3 p-3",
                isActive 
                  ? "border-primary bg-primary/10 text-primary" 
                  : "border-transparent text-foreground hover:bg-muted"
              )}
              title={collapsed ? item.name : undefined}
            >
              <Icon className={cn("w-5 h-5 flex-shrink-0", isActive && "text-primary")} />
              {!collapsed && (
                <span className="font-medium truncate">{item.name}</span>
              )}
              {collapsed && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-popover border rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 pointer-events-none">
                  {item.name}
                </div>
              )}
            </Link>
          );
        })}

        {canAccessTab("vmix-scheduler") && (
          <div className="my-4 border-t border-border pt-4">
            <Link
              href="/vmix-scheduler"
              onClick={onClose}
              className={cn(
                "flex items-center rounded-lg transition-all cursor-pointer group relative min-h-[44px] touch-target border-l-4",
                collapsed ? "justify-center p-3" : "space-x-3 p-3",
                location === "/vmix-scheduler"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-transparent text-foreground hover:bg-muted"
              )}
              title={collapsed ? "Расписатель vMix" : undefined}
            >
              <Clock className={cn("w-5 h-5 flex-shrink-0", location === "/vmix-scheduler" && "text-primary")} />
              {!collapsed && (
                <>
                  <span className="font-medium truncate">Расписатель vMix</span>
                  <Badge variant="secondary" className="ml-auto text-xs flex-shrink-0">Beta</Badge>
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

        {((user?.role === "admin" || user?.role === "manager") || canViewTerminal) && (
          <>
            {!collapsed && (
              <div className="my-4 border-t border-border pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-3">
                  {user?.role === "admin" ? "Администратор" : user?.role === "manager" ? "Менеджер" : "Служебное"}
                </p>
              </div>
            )}
            {adminNavigation.filter((item) => item.name === "Терминал" ? canViewTerminal : user?.role === "admin").map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center rounded-lg transition-all cursor-pointer group relative min-h-[44px] touch-target border-l-4",
                    collapsed ? "justify-center p-3" : "space-x-3 p-3",
                    isActive ? "border-primary bg-primary/10 text-primary" : "border-transparent text-foreground hover:bg-muted"
                  )}
                  title={collapsed ? item.name : undefined}
                >
                  <Icon className={cn("w-5 h-5 flex-shrink-0", isActive && "text-primary")} />
                  {!collapsed && <span className="font-medium truncate">{item.name}</span>}
                  {collapsed && (
                    <div className="absolute left-full ml-2 px-2 py-1 bg-popover border rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 pointer-events-none">
                      {item.name}
                    </div>
                  )}
                </Link>
              );
            })}
            {(user?.role === "admin" || user?.role === "manager") && managerNavigation.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center rounded-lg transition-all cursor-pointer group relative min-h-[44px] touch-target border-l-4",
                    collapsed ? "justify-center p-3" : "space-x-3 p-3",
                    isActive ? "border-primary bg-primary/10 text-primary" : "border-transparent text-foreground hover:bg-muted"
                  )}
                  title={collapsed ? item.name : undefined}
                >
                  <Icon className={cn("w-5 h-5 flex-shrink-0", isActive && "text-primary")} />
                  {!collapsed && <span className="font-medium truncate">{item.name}</span>}
                  {collapsed && (
                    <div className="absolute left-full ml-2 px-2 py-1 bg-popover border rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 pointer-events-none">
                      {item.name}
                    </div>
                  )}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      <div className={cn("p-2 sm:p-3 border-t border-border", collapsed && "p-2")}>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className={cn("flex items-center", collapsed ? "justify-center" : "space-x-3")}>
            <Avatar className={cn("flex-shrink-0 touch-target", collapsed ? "w-8 h-8" : "w-10 h-10")}>
              <AvatarImage src={user?.avatar || undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground">
                {user?.name?.split(' ').map((n: string) => n[0]).join('') || 'U'}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{user?.name || 'Гость'}</p>
                <p className="text-xs text-muted-foreground">{user ? getRoleLabel(user?.role) : 'Не авторизован'}</p>
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
