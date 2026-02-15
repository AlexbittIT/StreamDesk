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
import { Bell, Menu, Settings, LogOut, LogIn } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

interface HeaderProps {
  onMobileMenuClick: () => void;
  user?: any;
  onLogout?: () => void;
}

const pageTitles: Record<string, string> = {
  "/": "Панель управления",
  "/tasks": "Таск-менеджер",
  "/calendar": "Календарь",
  "/equipment": "Склад техники",
  "/transcription": "Транскрибация",
  "/computers": "Компьютеры",
  "/projects": "Видеопроекты",
  "/monitoring": "Мониторинг системы",
  "/streams": "Стриминг",
  "/servers": "Серверы",
  "/notifications": "Уведомления",
  "/settings": "Настройки",
  "/admin": "Администрирование",
  "/chatgpt": "ChatGPT",
  "/vmix-scheduler": "Расписатель vMix",
};

export default function Header({ onMobileMenuClick, user, onLogout }: HeaderProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [location] = useLocation();

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

  const pageTitle = pageTitles[location] || "StreamDesk";
  const isStreamDeskTitle = pageTitle === "StreamDesk";

  return (
    <header className="bg-card border-b border-border dark:border-cyan-500/20 dark:shadow-lg dark:shadow-cyan-500/5 px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-30 transition-all duration-300">
      <div className="flex items-center space-x-4">
        <Button 
          variant="ghost" 
          size="sm"
          className="lg:hidden dark:hover:bg-cyan-500/10 dark:hover:border-cyan-500/30"
          onClick={onMobileMenuClick}
          data-testid="button-mobile-menu"
        >
          <Menu className="h-5 w-5 dark:text-cyan-400" />
        </Button>
        <h2 className={cn(
          "text-xl sm:text-2xl font-semibold text-foreground truncate",
          isStreamDeskTitle && "dark:text-cyan-100 dark:drop-shadow-[0_0_12px_rgba(6,182,212,0.5)] dark:animate-pulse",
          !isStreamDeskTitle && "dark:text-cyan-100 dark:drop-shadow-[0_0_8px_rgba(6,182,212,0.4)]"
        )}>
          {pageTitle}
        </h2>
      </div>
      
      <div className="flex items-center space-x-2 sm:space-x-4">
        <div className="text-sm text-muted-foreground hidden md:block text-right">
          <div className="font-medium text-foreground">{currentTime.toLocaleTimeString('ru-RU')}</div>
          <div className="text-xs">
            {currentTime.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })}
          </div>
        </div>

        <ThemeToggle />

        {user && (
          <Link href="/notifications">
            <Button variant="ghost" size="sm" className="relative dark:hover:bg-cyan-500/10 dark:hover:border-cyan-500/30 dark:border dark:border-transparent" data-testid="button-notifications">
              <Bell className="h-5 w-5 dark:text-cyan-400" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 dark:bg-red-400 dark:shadow-lg dark:shadow-red-500/50 rounded-full text-white text-xs flex items-center justify-center animate-pulse">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </Link>
        )}
        
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="flex items-center gap-2 dark:hover:bg-cyan-500/10 dark:hover:border-cyan-500/30 dark:border dark:border-transparent" data-testid="button-user-menu">
                <Avatar className="w-8 h-8 dark:ring-2 dark:ring-cyan-500/30 dark:shadow-lg dark:shadow-cyan-500/20">
                  <AvatarImage src={user?.avatar || undefined} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs dark:bg-cyan-500 dark:text-white">
                    {user?.name?.split(' ').map((n: string) => n[0]).join('') || 'U'}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden sm:inline text-sm font-medium text-foreground dark:text-cyan-100">{user?.name || 'Гость'}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span>{user?.name || 'Гость'}</span>
                  <span className="text-xs font-normal text-muted-foreground">{user?.username ? `@${user.username}` : 'Не авторизован'}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <Link href="/settings">
                <DropdownMenuItem className="cursor-pointer">
                  <Settings className="w-4 h-4 mr-2" />
                  Настройки
                </DropdownMenuItem>
              </Link>
              <DropdownMenuSeparator />
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
