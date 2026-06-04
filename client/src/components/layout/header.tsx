import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Bell, Menu, Settings, LogOut, Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { ThemeToggle } from "@/components/theme-toggle";
import { usePWAInstall } from "@/hooks/use-pwa-install";

interface HeaderProps {
  onMobileMenuClick: () => void;
  user?: any;
  onLogout?: () => void;
}

const pageTitles: Record<string, string> = {
  "/": "Панель управления",
  "/tasks": "Задачи",
  "/tasks/yougile": "Задачи YouGile",
  "/calendar": "Календарь",
  "/maps": "Карты",
  "/room-booking": "Бронирование комнат",
  "/equipment": "Склад техники",
  "/estimates": "Смета",
  "/computers": "Инфраструктура",
  "/projects": "Проекты",
  "/monitoring": "Мониторинг",
  "/streams": "Стриминг",
  "/servers": "Серверы",
  "/notifications": "Уведомления",
  "/settings": "Настройки",
  "/admin": "Администрирование компании",
  "/platform-admin": "Платформа",
  "/onboarding": "Старт рабочего пространства",
  "/chatgpt": "ChatGPT",
  "/vmix-scheduler": "vMix",
  "/connection-schemas": "Схемы подключения",
  "/otis-onair": "Эфир ОТИС",
  "/manager-dashboard": "Дашборд менеджера",
};

export default function Header({ onMobileMenuClick, user, onLogout }: HeaderProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [location] = useLocation();
  const { canInstall, install } = usePWAInstall();
  const isPlatformAdmin = Array.isArray(user?.permissions) && user.permissions.includes("platform:admin");

  const { data: notifications = [] } = useQuery<any[]>({
    queryKey: ["/api/notifications", user?.id],
    enabled: !!user?.id,
  });

  const unreadCount = notifications.filter((n: any) => !n.read).length;

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const pageTitle = pageTitles[location] ?? "StreamDesk";

  return (
    <header className="bg-card/80 backdrop-blur-sm border-b border-border px-2 sm:px-3 py-1 sm:py-1.5 sticky top-0 z-30 flex items-center justify-between gap-1 sm:gap-2 min-w-0 w-full max-w-full overflow-hidden safe-area-top">
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 shrink overflow-hidden">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden h-7 w-7 flex-shrink-0"
          onClick={onMobileMenuClick}
          data-testid="button-mobile-menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <h2 className="text-xs sm:text-sm md:text-base font-semibold text-foreground truncate min-w-0 max-w-[45vw] sm:max-w-[55vw]">
          {pageTitle}
        </h2>
      </div>

      <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0 overflow-hidden">
        <div className="text-xs text-muted-foreground hidden 2xl:block text-right shrink-0">
          <div className="font-medium text-foreground">{currentTime.toLocaleTimeString("ru-RU")}</div>
          <div className="text-[10px]">
            {currentTime.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" })}
          </div>
        </div>

        <ThemeToggle />

        {canInstall && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 sm:h-9 gap-1.5 shrink-0 border-primary/50 text-primary hover:bg-primary/10"
                onClick={() => install()}
                aria-label="Установить приложение"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline text-xs">Установить приложение</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Открывать без панели браузера (PWA)</p>
            </TooltipContent>
          </Tooltip>
        )}

        {user && !isPlatformAdmin && (
          <Link href="/notifications" className="shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="relative h-7 w-7 sm:h-8 sm:w-8 touch-target hover:bg-muted/60 focus:ring-2 focus:ring-ring shrink-0"
              data-testid="button-notifications"
            >
              <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
              {unreadCount > 0 && (
                <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center leading-none">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          </Link>
        )}

        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="flex items-center gap-1 sm:gap-1.5 min-h-[28px] sm:min-h-[32px] touch-target hover:bg-muted/60 focus:ring-2 focus:ring-ring shrink-0 max-w-[100px] sm:max-w-[140px] md:max-w-[180px]"
                data-testid="button-user-menu"
              >
                <Avatar className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0">
                  <AvatarImage src={user?.avatar || undefined} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-[10px]">
                    {user?.name?.split(" ").map((n: string) => n[0]).join("") || "U"}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden sm:inline text-xs sm:text-sm font-medium text-foreground truncate min-w-0 max-w-[70px] sm:max-w-[100px] md:max-w-none">
                  {user?.name || "Гость"}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span>{user?.name || "Гость"}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {user?.username ? `@${user.username}` : "Не авторизован"}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {canInstall && (
                <DropdownMenuItem className="cursor-pointer" onClick={() => install()}>
                  <Download className="w-4 h-4 mr-2" />
                  Установить приложение (PWA)
                </DropdownMenuItem>
              )}
              {!isPlatformAdmin && <Link href="/settings">
                <DropdownMenuItem className="cursor-pointer">
                  <Settings className="w-4 h-4 mr-2" />
                  Настройки
                </DropdownMenuItem>
              </Link>}
              {!isPlatformAdmin && <DropdownMenuSeparator />}
              {onLogout && (
                <DropdownMenuItem
                  className="cursor-pointer text-destructive focus:text-destructive"
                  onClick={onLogout}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Выйти
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}

