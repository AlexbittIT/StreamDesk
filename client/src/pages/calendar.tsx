import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, Plus, Clock, MapPin, Users, Edit } from "lucide-react";
import { EventForm } from "@/components/forms/event-form";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

export default function Calendar() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [viewMode, setViewMode] = useState<"week" | "day">("week");

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["/api/events"],
  });

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const getEventsForDate = (date: Date) => {
    return (events as any[]).filter((event: any) => {
      if (!event.startTime) return false;
      try {
        return isSameDay(new Date(event.startTime), date);
      } catch {
        return false;
      }
    });
  };

  const getEventTypeColor = (type: string) => {
    switch (type) {
      case "stream": return "bg-red-100 text-red-800";
      case "meeting": return "bg-blue-100 text-blue-800";
      case "production": return "bg-green-100 text-green-800";
      case "maintenance": return "bg-yellow-100 text-yellow-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getEventTypeText = (type: string) => {
    switch (type) {
      case "stream": return "Стрим";
      case "meeting": return "Встреча";
      case "production": return "Производство";
      case "maintenance": return "Обслуживание";
      default: return type;
    }
  };

  if (isLoading) {
    return <div>Загрузка календаря...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-gray-900">Календарь событий</h2>
        <div className="flex space-x-2">
          <Button 
            variant={viewMode === "week" ? "default" : "outline"}
            onClick={() => setViewMode("week")}
          >
            Неделя
          </Button>
          <Button 
            variant={viewMode === "day" ? "default" : "outline"}
            onClick={() => setViewMode("day")}
          >
            День
          </Button>
          <Button onClick={() => {
            setSelectedEvent(null);
            setIsFormOpen(true);
          }}>
            <Plus className="w-4 h-4 mr-2" />
            Новое событие
          </Button>
        </div>
      </div>

      {viewMode === "week" ? (
        <div className="space-y-4">
          {/* Week Header */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center">
                  <CalendarIcon className="w-5 h-5 mr-2" />
                  {format(weekStart, "d MMMM", { locale: ru })} - {format(weekEnd, "d MMMM yyyy", { locale: ru })}
                </div>
                <div className="flex space-x-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setSelectedDate(new Date(selectedDate.getTime() - 7 * 24 * 60 * 60 * 1000))}
                  >
                    ← Пред
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setSelectedDate(new Date())}
                  >
                    Сегодня
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setSelectedDate(new Date(selectedDate.getTime() + 7 * 24 * 60 * 60 * 1000))}
                  >
                    След →
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
          </Card>

          {/* Week View */}
          <div className="grid grid-cols-7 gap-4">
            {weekDays.map((day, index) => {
              const dayEvents = getEventsForDate(day);
              const isToday = isSameDay(day, new Date());
              
              return (
                <Card key={index} className={`min-h-[300px] ${isToday ? 'ring-2 ring-primary' : ''}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">
                      {format(day, "EEE", { locale: ru })}
                      <div className={`text-lg ${isToday ? 'text-primary font-bold' : ''}`}>
                        {format(day, "d")}
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {dayEvents.map((event: any) => (
                      <div
                        key={event.id}
                        className="p-2 rounded border-l-4 border-primary bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors"
                        onClick={() => {
                          setSelectedEvent(event);
                          setIsFormOpen(true);
                        }}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{event.title}</p>
                            <div className="flex items-center text-xs text-gray-500 mt-1">
                              <Clock className="w-3 h-3 mr-1" />
                              {format(parseISO(event.startDate), "HH:mm")}
                            </div>
                            {event.location && (
                              <div className="flex items-center text-xs text-gray-500 mt-1">
                                <MapPin className="w-3 h-3 mr-1" />
                                {event.location}
                              </div>
                            )}
                          </div>
                          <Badge className={getEventTypeColor(event.type)}>
                            {getEventTypeText(event.type)}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ) : (
        /* Day View */
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center">
                  <CalendarIcon className="w-5 h-5 mr-2" />
                  {format(selectedDate, "d MMMM yyyy, EEEE", { locale: ru })}
                </div>
                <div className="flex space-x-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setSelectedDate(new Date(selectedDate.getTime() - 24 * 60 * 60 * 1000))}
                  >
                    ← Вчера
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setSelectedDate(new Date())}
                  >
                    Сегодня
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setSelectedDate(new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000))}
                  >
                    Завтра →
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {getEventsForDate(selectedDate).length === 0 ? (
                  <p className="text-gray-500 text-center py-8">На этот день события не запланированы</p>
                ) : (
                  getEventsForDate(selectedDate).map((event: any) => (
                    <Card key={event.id} className="hover:shadow-md transition-shadow cursor-pointer">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-lg">{event.title}</CardTitle>
                            <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                              <div className="flex items-center">
                                <Clock className="w-4 h-4 mr-1" />
                                {format(parseISO(event.startDate), "HH:mm")} - {format(parseISO(event.endDate), "HH:mm")}
                              </div>
                              {event.location && (
                                <div className="flex items-center">
                                  <MapPin className="w-4 h-4 mr-1" />
                                  {event.location}
                                </div>
                              )}
                              {event.participants && event.participants.length > 0 && (
                                <div className="flex items-center">
                                  <Users className="w-4 h-4 mr-1" />
                                  {event.participants.length} участников
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Badge className={getEventTypeColor(event.type)}>
                              {getEventTypeText(event.type)}
                            </Badge>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEvent(event);
                                setIsFormOpen(true);
                              }}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      {event.description && (
                        <CardContent>
                          <p className="text-sm text-gray-600">{event.description}</p>
                        </CardContent>
                      )}
                    </Card>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Event Form */}
      <EventForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        event={selectedEvent}
      />
    </div>
  );
}