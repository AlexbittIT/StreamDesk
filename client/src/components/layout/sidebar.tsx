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
  ExternalLink,
  MessageSquare,
  Clock,
  FileText,
  ChevronLeft,
  ChevronRight,
  Menu,
  Network
} from "lucide-react";
import { useState } from "react";

interface SidebarProps {
  user?: any;
  isOpen: boolean;
  onClose: () => void;
  onLogout?: () => void;
}

const navigation = [
  { name: "Панель управления", href: "/", icon: ChartLine },
  { name: "Задачи", href: "/tasks", icon: ClipboardList },
  { name: "Календарь", href: "/calendar", icon: Calendar },
  { name: "Склад техники", href: "/equipment", icon: Package },
  { name: "Транскрибация", href: "/transcription", icon: FileText },
  { name: "Компьютеры", href: "/computers", icon: Laptop },
  { name: "Видеопроекты", href: "/projects", icon: Film },
  { name: "Мониторинг системы", href: "/monitoring", icon: Monitor },
  { name: "Стриминг", href: "/streams", icon: Video },
  { name: "Серверы", href: "/servers", icon: Server },
  { name: "Схемы подключения", href: "/connection-schemas", icon: Network },
  { name: "ChatGPT", href: "/chatgpt", icon: MessageSquare },
  { name: "Уведомления", href: "/notifications", icon: Bell },
  { name: "Настройки", href: "/settings", icon: Settings },
];

const managerNavigation = [
  { name: "Дашборд менеджера", href: "/manager-dashboard", icon: ChartLine },
];

const adminNavigation = [
  { name: "Администрирование", href: "/admin", icon: Shield },
];

export default function Sidebar({ user, isOpen, onClose, onLogout }: SidebarProps) {
  const [location] = useLocation();
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
      
      <div className={cn(
        "fixed left-0 top-0 h-full bg-card sidebar-shadow z-50 transition-all duration-300 ease-in-out lg:translate-x-0 flex flex-col overflow-hidden",
        "dark:border-r dark:border-cyan-500/20 dark:shadow-2xl dark:shadow-cyan-500/5",
        isOpen ? "translate-x-0" : "-translate-x-full",
        collapsed ? "w-20 lg:w-20" : "w-72 lg:w-72"
      )}>
        {/* Кнопка сворачивания */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute -right-3 top-20 z-10 h-6 w-6 rounded-full border bg-card shadow-md hover:bg-muted lg:flex hidden"
          onClick={toggleCollapse}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      <div className={cn("p-6 border-b border-border dark:border-cyan-500/20", collapsed && "p-4")}>
        <div className={cn("flex items-center", collapsed ? "justify-center" : "space-x-3")}>
          <div className="relative w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 dark:from-cyan-500 dark:to-cyan-600 rounded-lg flex items-center justify-center shadow-lg dark:shadow-cyan-500/30 flex-shrink-0">
            {/* Неоновое пульсирующее свечение для темной темы */}
            <div className="hidden dark:block absolute inset-0 rounded-lg bg-cyan-400/30 animate-pulse blur-md"></div>
            <div className="hidden dark:block absolute inset-0 rounded-lg bg-cyan-500/20 animate-ping"></div>
            <RadioTower className="text-white h-6 w-6 relative z-10 dark:drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-foreground truncate dark:text-cyan-100 dark:drop-shadow-[0_0_12px_rgba(6,182,212,0.5)] dark:animate-pulse">
                StreamDesk
              </h1>
              <p className="text-sm text-muted-foreground truncate dark:text-cyan-300/70">Управление с чего угодно</p>
            </div>
          )}
        </div>
      </div>
      
      <nav 
        className="flex-1 p-4 space-y-1 overflow-y-auto hide-scrollbar"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none'
        } as React.CSSProperties}
      >
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href;
          
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center rounded-lg transition-all cursor-pointer group relative",
                collapsed ? "justify-center p-3" : "space-x-3 p-3",
                isActive 
                  ? "bg-primary text-primary-foreground shadow-md dark:shadow-primary/20" 
                  : "text-foreground hover:bg-muted"
              )}
              title={collapsed ? item.name : undefined}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && (
                <span className="font-medium truncate">{item.name}</span>
              )}
              {collapsed && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-popover border rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
                  {item.name}
                </div>
              )}
            </Link>
          );
        })}

        <div className="my-4 border-t border-border pt-4">
          <Link
            href="/vmix-scheduler"
            onClick={onClose}
            className={cn(
              "flex items-center rounded-lg transition-all cursor-pointer group relative",
              collapsed ? "justify-center p-3" : "space-x-3 p-3",
              location === "/vmix-scheduler"
                ? "bg-primary text-primary-foreground shadow-md dark:shadow-primary/20"
                : "text-foreground hover:bg-muted"
            )}
            title={collapsed ? "Расписатель vMix" : undefined}
          >
            <Clock className="w-5 h-5 flex-shrink-0" />
            {!collapsed && (
              <>
                <span className="font-medium truncate">Расписатель vMix</span>
                <Badge variant="secondary" className="ml-auto text-xs flex-shrink-0">Beta</Badge>
              </>
            )}
            {collapsed && (
              <div className="absolute left-full ml-2 px-2 py-1 bg-popover border rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
                Расписатель vMix
              </div>
            )}
          </Link>
        </div>

        {user?.role === "admin" && (
          <>
            {!collapsed && (
              <div className="my-4 border-t border-border/50 pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-3">
                  Администратор
                </p>
              </div>
            )}
            {adminNavigation.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href;
              
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center rounded-lg transition-all cursor-pointer group relative",
                    collapsed ? "justify-center p-3" : "space-x-3 p-3",
                    isActive 
                      ? "bg-primary text-primary-foreground shadow-md dark:shadow-primary/20" 
                      : "text-foreground hover:bg-muted"
                  )}
                  title={collapsed ? item.name : undefined}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!collapsed && (
                    <span className="font-medium truncate">{item.name}</span>
                  )}
                  {collapsed && (
                    <div className="absolute left-full ml-2 px-2 py-1 bg-popover border rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
                      {item.name}
                    </div>
                  )}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      <div className={cn("p-4 border-t border-border", collapsed && "p-2")}>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className={cn("flex items-center", collapsed ? "justify-center" : "space-x-3")}>
            <Avatar className={cn("flex-shrink-0", collapsed ? "w-8 h-8" : "w-10 h-10")}>
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
