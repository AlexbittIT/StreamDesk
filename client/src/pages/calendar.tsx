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
      case "stream": return "bg-red-500/20 text-red-600 dark:text-red-400";
      case "meeting": return "bg-blue-500/20 text-blue-600 dark:text-blue-400";
      case "production": return "bg-green-500/20 text-green-600 dark:text-green-400";
      case "maintenance": return "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400";
      default: return "bg-muted text-muted-foreground";
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
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Календарь событий</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
            <Button 
              variant={viewMode === "week" ? "default" : "ghost"}
              size="sm"
              className={viewMode === "week" ? "" : "text-slate-600 dark:text-slate-400"}
              onClick={() => setViewMode("week")}
            >
              Неделя
            </Button>
            <Button 
              variant={viewMode === "day" ? "default" : "ghost"}
              size="sm"
              className={viewMode === "day" ? "" : "text-slate-600 dark:text-slate-400"}
              onClick={() => setViewMode("day")}
            >
              День
            </Button>
          </div>
          <Button 
            className="bg-primary hover:bg-primary/90 text-white shadow-sm"
            onClick={() => {
              setSelectedEvent(null);
              setIsFormOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Новое событие
          </Button>
        </div>
      </div>

      {viewMode === "week" ? (
        <div className="space-y-4">
          {/* Week Navigation */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <CalendarIcon className="w-5 h-5 text-primary" />
              <span className="font-semibold">
                {format(weekStart, "d MMMM", { locale: ru })} - {format(weekEnd, "d MMMM yyyy", { locale: ru })}
              </span>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                className="border-slate-300 dark:border-slate-600"
                onClick={() => setSelectedDate(new Date(selectedDate.getTime() - 7 * 24 * 60 * 60 * 1000))}
              >
                ← Пред
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                className="border-slate-300 dark:border-slate-600"
                onClick={() => setSelectedDate(new Date())}
              >
                Сегодня
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                className="border-slate-300 dark:border-slate-600"
                onClick={() => setSelectedDate(new Date(selectedDate.getTime() + 7 * 24 * 60 * 60 * 1000))}
              >
                След →
              </Button>
            </div>
          </div>

          {/* Week View */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {weekDays.map((day, index) => {
              const dayEvents = getEventsForDate(day);
              const isToday = isSameDay(day, new Date());
              
              return (
                <div 
                  key={index} 
                  className={`
                    min-h-[180px] rounded-xl p-3
                    bg-white dark:bg-slate-800/90
                    border border-slate-200 dark:border-slate-700
                    ${isToday ? 'ring-2 ring-primary shadow-md' : ''}
                    overflow-hidden
                  `}
                >
                  {/* Day Header */}
                  <div className="mb-2 pb-2 border-b border-slate-100 dark:border-slate-700">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                      {format(day, "EEE", { locale: ru })}
                    </div>
                    <div className={`text-xl font-bold ${isToday ? 'text-primary' : 'text-slate-900 dark:text-white'}`}>
                      {format(day, "d")}
                    </div>
                  </div>
                  
                  {/* Events */}
                  <div className="space-y-1.5 overflow-y-auto max-h-[120px]">
                    {dayEvents.length === 0 ? (
                      <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-2">Нет событий</p>
                    ) : (
                      dayEvents.map((event: any) => (
                        <div
                          key={event.id}
                          className="p-2 rounded-lg bg-slate-50 dark:bg-slate-700/50 border-l-3 border-primary cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                          onClick={() => {
                            setSelectedEvent(event);
                            setIsFormOpen(true);
                          }}
                          style={{ borderLeftWidth: '3px' }}
                        >
                          <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">{event.title}</p>
                          <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {format(new Date(event.startTime), "HH:mm")}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
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
                  <p className="text-muted-foreground text-center py-8">На этот день события не запланированы</p>
                ) : (
                  getEventsForDate(selectedDate).map((event: any) => (
                    <Card key={event.id} className="hover:shadow-md transition-shadow cursor-pointer">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-lg">{event.title}</CardTitle>
                            <div className="flex items-center space-x-4 mt-2 text-sm text-muted-foreground">
                              <div className="flex items-center">
                                <Clock className="w-4 h-4 mr-1" />
                                {format(new Date(event.startTime), "HH:mm")} - {format(new Date(event.endTime), "HH:mm")}
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
                          <p className="text-sm text-muted-foreground">{event.description}</p>
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