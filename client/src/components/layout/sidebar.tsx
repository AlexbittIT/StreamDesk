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
  User,
  ClipboardList,
  Shield,
  LogOut
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
  { name: "Мониторинг системы", href: "/monitoring", icon: Monitor },
  { name: "Статистика стримов", href: "/streams", icon: Video },
  { name: "Управление серверами", href: "/servers", icon: Server },
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
      "fixed left-0 top-0 h-full w-72 bg-white sidebar-shadow z-50 transition-transform duration-300 ease-in-out lg:translate-x-0 flex flex-col",
      isOpen ? "translate-x-0" : "-translate-x-full"
    )}>
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center shadow-lg">
            <RadioTower className="text-white h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">StreamStudio</h1>
            <p className="text-sm text-gray-500">Управление студией</p>
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
                  ? "bg-primary text-white shadow-md" 
                  : "text-gray-700 hover:bg-gray-100"
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium">{item.name}</span>
            </Link>
          );
        })}

        {user?.role === "admin" && (
          <>
            <div className="my-4 border-t border-gray-200 pt-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-3">
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
                      ? "bg-primary text-white shadow-md" 
                      : "text-gray-700 hover:bg-gray-100"
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

      <div className="p-4 border-t border-gray-200">
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center space-x-3">
            <Avatar className="w-10 h-10">
              <AvatarImage src={user?.avatar || undefined} />
              <AvatarFallback className="bg-primary text-white">
                {user?.name?.split(' ').map((n: string) => n[0]).join('') || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">{user?.name || 'Пользователь'}</p>
              <p className="text-xs text-gray-500">{getRoleLabel(user?.role)}</p>
            </div>
          </div>
          {onLogout && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full mt-3 text-gray-600 hover:text-red-600 hover:bg-red-50"
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
