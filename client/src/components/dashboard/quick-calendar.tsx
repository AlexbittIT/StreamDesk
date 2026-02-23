import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { Calendar } from "lucide-react";

interface QuickCalendarProps {
  events?: any[];
}

export default function QuickCalendar({ events }: QuickCalendarProps) {
  const today = new Date();
  const todayEvents = events?.filter(event => {
    const eventDate = new Date(event.startTime);
    return eventDate.toDateString() === today.toDateString();
  }).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()) || [];

  const getEventTypeColor = (type: string) => {
    switch (type) {
      case "stream": return "bg-blue-500";
      case "recording": return "bg-green-500";
      case "maintenance": return "bg-yellow-500";
      case "meeting": return "bg-purple-500";
      default: return "bg-gray-500";
    }
  };

  return (
    <Card className="bg-card border-border rounded-xl overflow-hidden min-w-0 shadow-sm">
      <CardHeader className="py-2 px-3 pb-1">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-foreground">Календарь на сегодня</CardTitle>
          <Link href="/calendar">
            <span className="text-primary hover:underline text-xs font-medium cursor-pointer">
              Открыть календарь
            </span>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-2.5 pt-0">
        {todayEvents.length === 0 ? (
          <div className="text-center py-3 text-slate-500 dark:text-slate-400">
            <Calendar className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
            <p className="text-xs">На сегодня событий нет</p>
          </div>
        ) : (
          <div className="space-y-1">
            {todayEvents.map((event) => (
              <div key={event.id} className="flex items-center space-x-2 p-1.5 rounded-lg hover:bg-muted/50">
                <div className="w-10 text-center shrink-0">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    {new Date(event.startTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-900 dark:text-white truncate">{event.title}</p>
                  <p className="text-[10px] text-slate-600 dark:text-slate-400 truncate">
                    {event.location} • {event.userId ? 'Назначено' : 'Свободное'}
                  </p>
                </div>
                <div className={`w-2.5 h-2.5 shrink-0 ${getEventTypeColor(event.type)} rounded-full`}></div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
