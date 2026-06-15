import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Filter, Video, Calendar, Map, CalendarDays, Package, ClipboardList, Monitor, Network, FileSpreadsheet } from "lucide-react";
import { Link } from "wouter";
import { tabPermission } from "@shared/schema";
const SERVICES = [
  { tabKey: "streams", title: "Стриминг", href: "/streams", icon: Video },
  { tabKey: "calendar", title: "Календарь", href: "/calendar", icon: Calendar },
  { tabKey: "maps", title: "Карты", href: "/maps", icon: Map },
  { tabKey: "room-booking", title: "Бронирование комнат", href: "/room-booking", icon: CalendarDays },
  { tabKey: "equipment", title: "Склад техники", href: "/equipment", icon: Package },
  { tabKey: "estimates", title: "Смета", href: "/estimates", icon: FileSpreadsheet },
  { tabKey: "tasks", title: "Задачи", href: "/tasks", icon: ClipboardList },
  { tabKey: "monitoring", title: "Мониторинг", href: "/monitoring", icon: Monitor },
  { tabKey: "connection-schemas", title: "Схемы подключения", href: "/connection-schemas", icon: Network },
];

function canAccessTab(user: any, tabKey: string): boolean {
  if (!user) return true;
  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  const hasTabPermissions = permissions.some((permission: string) => permission.startsWith("tab:"));
  if (hasTabPermissions) return permissions.includes(tabPermission(tabKey));
  return true;
}

export default function DashboardServicesSection({ user }: { user?: any }) {
  const services = SERVICES.filter((service) => canAccessTab(user, service.tabKey));
  if (services.length === 0) return null;

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
        {services.map((service) => {
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
