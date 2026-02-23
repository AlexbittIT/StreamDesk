import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Filter, Video, Calendar, Map, CalendarDays, Package, ClipboardList, Monitor, Server, Network } from "lucide-react";
import { Link } from "wouter";
const SERVICES = [
  { title: "Стриминг", href: "/streams", icon: Video },
  { title: "Календарь", href: "/calendar", icon: Calendar },
  { title: "Карты", href: "/maps", icon: Map },
  { title: "Бронирование комнат", href: "/room-booking", icon: CalendarDays },
  { title: "Склад техники", href: "/equipment", icon: Package },
  { title: "Задачи", href: "/tasks", icon: ClipboardList },
  { title: "Мониторинг", href: "/monitoring", icon: Monitor },
  { title: "Серверы", href: "/servers", icon: Server },
  { title: "Схемы подключения", href: "/connection-schemas", icon: Network },
];

export default function DashboardServicesSection() {
  return (
    <div className="space-y-1.5 w-full min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 w-full min-w-0">
        <h3 className="text-lg font-bold text-foreground shrink-0">
          Все сервисы
        </h3>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto min-w-0">
          <Button variant="outline" size="sm" className="h-9 border-border shrink-0">
            <Filter className="h-4 w-4 mr-1.5" />
            Фильтр
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1.5 w-full min-w-0">
        {SERVICES.map((service) => {
          const Icon = service.icon;
          return (
            <Link key={service.href} href={service.href} className="min-w-0">
              <Card className="bg-card/80 dark:bg-card/90 backdrop-blur-sm border border-border hover:border-primary/50 transition-colors cursor-pointer h-full rounded-xl overflow-hidden border-l-4 border-l-primary/50 hover:border-l-primary">
                <CardContent className="p-2.5 flex items-center gap-2 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <span className="font-medium text-foreground truncate min-w-0">{service.title}</span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
