import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
    <Card className="card-shadow">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Календарь на сегодня</CardTitle>
          <Button variant="ghost" size="sm" className="text-primary hover:text-blue-700">
            Открыть полный календарь
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {todayEvents.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>На сегодня событий нет</p>
          </div>
        ) : (
          <div className="space-y-3">
            {todayEvents.map((event) => (
              <div key={event.id} className="flex items-center space-x-4 p-3 rounded-lg hover:bg-gray-50">
                <div className="w-12 text-center">
                  <p className="text-xs text-gray-500">
                    {new Date(event.startTime).toLocaleTimeString('ru-RU', { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </p>
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{event.title}</p>
                  <p className="text-sm text-gray-600">
                    {event.location} • {Math.floor((new Date(event.endTime).getTime() - new Date(event.startTime).getTime()) / (1000 * 60 * 60))} ч • {event.userId ? 'Назначено' : 'Свободное'}
                  </p>
                </div>
                <div className={`w-3 h-3 ${getEventTypeColor(event.type)} rounded-full`}></div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
