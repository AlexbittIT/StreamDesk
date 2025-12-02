import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
  ExternalLink
} from "lucide-react";

interface SidebarProps {
  user: any;
  isOpen: boolean;
  onClose: () => void;
  onLogout?: () => void;
}

const navigation = [
  { name: "Панель управления", href: "/", icon: ChartLine },
  { name: "Задачи", href: "/tasks", icon: ClipboardList },
  { name: "Календарь", href: "/calendar", icon: Calendar },
  { name: "Склад техники", href: "/equipment", icon: Package },
  { name: "Компьютеры", href: "/computers", icon: Laptop },
  { name: "Видеопроекты", href: "/projects", icon: Film },
  { name: "Мониторинг системы", href: "/monitoring", icon: Monitor },
  { name: "Стриминг", href: "/streams", icon: Video },
  { name: "Серверы", href: "/servers", icon: Server },
  { name: "Уведомления", href: "/notifications", icon: Bell },
  { name: "Настройки", href: "/settings", icon: Settings },
];

const adminNavigation = [
  { name: "Администрирование", href: "/admin", icon: Shield },
];

export default function Sidebar({ user, isOpen, onClose, onLogout }: SidebarProps) {
  const [location] = useLocation();

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "admin": return "Администратор";
      case "manager": return "Менеджер";
      default: return "Сотрудник";
    }
  };

  return (
    <div className={cn(
      "fixed left-0 top-0 h-full w-72 bg-card sidebar-shadow z-50 transition-transform duration-300 ease-in-out lg:translate-x-0 flex flex-col",
      isOpen ? "translate-x-0" : "-translate-x-full"
    )}>
      <div className="p-6 border-b border-border">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center shadow-lg dark:shadow-red-500/20">
            <RadioTower className="text-white h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">StreamStudio</h1>
            <p className="text-sm text-muted-foreground">Управление студией</p>
          </div>
        </div>
      </div>
      
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href;
          
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center space-x-3 p-3 rounded-lg transition-all cursor-pointer",
                isActive 
                  ? "bg-primary text-primary-foreground shadow-md dark:shadow-primary/20" 
                  : "text-foreground hover:bg-muted"
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium">{item.name}</span>
            </Link>
          );
        })}

        <div className="my-4 border-t border-border pt-4">
          <a
            href="http://vmix.rullz.ru"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-3 p-3 rounded-lg transition-all cursor-pointer scheduler-button text-white hover:opacity-90"
            data-testid="link-scheduler"
          >
            <ExternalLink className="w-5 h-5" />
            <span className="font-medium">Расписатель</span>
          </a>
        </div>

        {user?.role === "admin" && (
          <>
            <div className="my-4 border-t border-border/50 pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-3">
                Администратор
              </p>
            </div>
            {adminNavigation.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href;
              
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center space-x-3 p-3 rounded-lg transition-all cursor-pointer",
                    isActive 
                      ? "bg-primary text-primary-foreground shadow-md dark:shadow-primary/20" 
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{item.name}</span>
                </Link>
              );
            })}
          </>
        )}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="flex items-center space-x-3">
            <Avatar className="w-10 h-10">
              <AvatarImage src={user?.avatar || undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground">
                {user?.name?.split(' ').map((n: string) => n[0]).join('') || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate">{user?.name || 'Пользователь'}</p>
              <p className="text-xs text-muted-foreground">{getRoleLabel(user?.role)}</p>
            </div>
          </div>
          {onLogout && (
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
        </div>
      </div>
    </div>
  );
}
