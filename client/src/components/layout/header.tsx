import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Bell, Menu } from "lucide-react";

interface HeaderProps {
  onMobileMenuClick: () => void;
  user: any;
}

export default function Header({ onMobileMenuClick, user }: HeaderProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <Button 
          variant="ghost" 
          size="sm"
          className="lg:hidden"
          onClick={onMobileMenuClick}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <h2 className="text-2xl font-semibold text-gray-900">Панель управления</h2>
      </div>
      
      <div className="flex items-center space-x-4">
        {/* Notifications */}
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="h-5 w-5" />
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></span>
        </Button>
        
        {/* Current time display */}
        <div className="text-sm text-gray-600 hidden md:block">
          <div>{currentTime.toLocaleTimeString('ru-RU')}</div>
          <div className="text-xs">Московское время</div>
        </div>
      </div>
    </header>
  );
}
