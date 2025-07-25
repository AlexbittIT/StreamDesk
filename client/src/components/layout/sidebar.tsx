import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
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
  User
} from "lucide-react";

interface SidebarProps {
  user: any;
  isOpen: boolean;
  onClose: () => void;
}

const navigation = [
  { name: "Панель управления", href: "/", icon: ChartLine },
  { name: "Календарь", href: "/calendar", icon: Calendar },
  { name: "Склад техники", href: "/equipment", icon: Package },
  { name: "Мониторинг системы", href: "/monitoring", icon: Monitor },
  { name: "Статистика стримов", href: "/streams", icon: Video },
  { name: "Управление серверами", href: "/servers", icon: Server },
  { name: "Уведомления", href: "/notifications", icon: Bell },
  { name: "Настройки", href: "/settings", icon: Settings },
];

export default function Sidebar({ user, isOpen, onClose }: SidebarProps) {
  const [location] = useLocation();

  return (
    <div className={cn(
      "fixed left-0 top-0 h-full w-72 bg-white sidebar-shadow z-50 transition-transform duration-300 ease-in-out lg:translate-x-0",
      isOpen ? "translate-x-0" : "-translate-x-full"
    )}>
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <RadioTower className="text-white h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">StreamStudio</h1>
            <p className="text-sm text-gray-500">Управление студией</p>
          </div>
        </div>
      </div>
      
      <nav className="p-4 space-y-2">
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href;
          
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onClose}
            >
              <a className={cn(
                "flex items-center space-x-3 p-3 rounded-lg transition-colors",
                isActive 
                  ? "bg-primary text-white" 
                  : "text-gray-700 hover:bg-gray-100"
              )}>
                <Icon className="w-5 h-5" />
                <span>{item.name}</span>
              </a>
            </Link>
          );
        })}
      </nav>

      <div className="absolute bottom-4 left-4 right-4">
        <div className="bg-surface rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">{user.name}</p>
              <p className="text-sm text-gray-500">{user.role === 'admin' ? 'Администратор' : 'Сотрудник'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
