import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, Plus, Clock, MapPin, Users, Edit } from "lucide-react";
import { EventForm } from "@/components/forms/event-form";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, parseISO, addDays, setHours, setMinutes, startOfMonth, endOfMonth, eachWeekOfInterval, startOfYear, endOfYear } from "date-fns";
import { ru } from "date-fns/locale";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Calendar() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [viewMode, setViewMode] = useState<"week" | "day" | "month">("week");
  const { toast } = useToast();


  const { data: events = [], isLoading } = useQuery({
    queryKey: ["/api/events"],
  });

  const updateEventMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PUT", `/api/events/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({
        title: "Успешно",
        description: "Событие перемещено",
      });
    },
    onError: () => {
      toast({
        title: "Ошибка",
        description: "Не удалось переместить событие",
        variant: "destructive",
      });
    },
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

  const handleDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;
    
    if (!destination) return;
    if (destination.droppableId === source.droppableId) return;

    // Find the event being moved
    const event = (events as any[]).find((e: any) => e.id === draggableId);
    if (!event) return;

    // Parse the destination date from droppableId (format: "day-YYYY-MM-DD")
    const dateMatch = destination.droppableId.match(/day-(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) return;

    const newDate = new Date(dateMatch[1]);
    const oldStartTime = new Date(event.startTime);
    const oldEndTime = new Date(event.endTime);
    
    // Calculate duration
    const duration = oldEndTime.getTime() - oldStartTime.getTime();
    
    // Set new start time to same hour on new date
    const newStartTime = new Date(newDate);
    newStartTime.setHours(oldStartTime.getHours());
    newStartTime.setMinutes(oldStartTime.getMinutes());
    newStartTime.setSeconds(0);
    newStartTime.setMilliseconds(0);
    
    // Set new end time
    const newEndTime = new Date(newStartTime.getTime() + duration);

    // Optimistic update
    queryClient.setQueryData(["/api/events"], (old: any[]) => {
      if (!old) return old;
      return old.map((e: any) => 
        e.id === draggableId 
          ? { ...e, startTime: newStartTime.toISOString(), endTime: newEndTime.toISOString() }
          : e
      );
    });

    // Update on server
    updateEventMutation.mutate({
      id: event.id,
      data: {
        startTime: newStartTime.toISOString(),
        endTime: newEndTime.toISOString(),
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4 p-2 sm:p-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
        <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900 dark:text-white">
          Календарь событий
        </h2>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 sm:p-1 text-xs sm:text-sm">
            <Button 
              variant={viewMode === "month" ? "default" : "ghost"}
              size="sm"
              className={`${viewMode === "month" ? "" : "text-slate-600 dark:text-slate-400"} text-xs sm:text-sm px-2 sm:px-3`}
              onClick={() => setViewMode("month")}
            >
              📆               Месяц
            </Button>
            <Button 
              variant={viewMode === "week" ? "default" : "ghost"}
              size="sm"
              className={`${viewMode === "week" ? "" : "text-slate-600 dark:text-slate-400"} text-xs sm:text-sm px-2 sm:px-3`}
              onClick={() => setViewMode("week")}
            >
              Неделя
            </Button>
            <Button 
              variant={viewMode === "day" ? "default" : "ghost"}
              size="sm"
              className={`${viewMode === "day" ? "" : "text-slate-600 dark:text-slate-400"} text-xs sm:text-sm px-2 sm:px-3`}
              onClick={() => setViewMode("day")}
            >
              День
            </Button>
          </div>
          <Button 
            className="bg-primary hover:bg-primary/90 text-white shadow-sm text-xs sm:text-sm px-3 sm:px-4 h-8 sm:h-9"
            onClick={() => {
              setSelectedEvent(null);
              setIsFormOpen(true);
            }}
          >
            <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Новое событие</span>
            <span className="sm:hidden">Событие</span>
          </Button>
        </div>
      </div>

      {viewMode === "month" ? (
        /* Month View */
        <div className="space-y-4">
          {/* Month Navigation */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-3 p-2 sm:p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <CalendarIcon className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              <span className="font-semibold text-base sm:text-lg">
                {format(selectedDate, "LLLL yyyy", { locale: ru })}
              </span>
            </div>
            <div className="flex gap-1 sm:gap-2 w-full sm:w-auto">
              <Button 
                variant="outline" 
                size="sm"
                className="border-slate-300 dark:border-slate-600 text-xs sm:text-sm flex-1 sm:flex-initial px-2 sm:px-3"
                onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1))}
              >
                ← Пред
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                className="border-slate-300 dark:border-slate-600 text-xs sm:text-sm flex-1 sm:flex-initial px-2 sm:px-3"
                onClick={() => setSelectedDate(new Date())}
              >
                🎯 Сегодня
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                className="border-slate-300 dark:border-slate-600 text-xs sm:text-sm flex-1 sm:flex-initial px-2 sm:px-3"
                onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1))}
              >
                След →
              </Button>
            </div>
          </div>

          {/* Month Grid */}
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-800/90">
              {/* Weekday Headers */}
              <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-700">
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => (
                  <div key={day} className="p-1 sm:p-2 md:p-3 text-center text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700 last:border-r-0">
                    {day}
                  </div>
                ))}
              </div>
              
              {/* Calendar Days */}
              <div className="grid grid-cols-7">
                {(() => {
                  const monthStart = startOfMonth(selectedDate);
                  const monthEnd = endOfMonth(selectedDate);
                  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
                  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
                  const days = eachDayOfInterval({ start: startDate, end: endDate });
                  
                  return days.map((day) => {
                    const dayEvents = getEventsForDate(day);
                    const isToday = isSameDay(day, new Date());
                    const isCurrentMonth = day.getMonth() === selectedDate.getMonth();
                    const dayId = `day-${format(day, "yyyy-MM-dd")}`;
                    
                    return (
                      <Droppable key={dayId} droppableId={dayId}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={`
                              min-h-[60px] sm:min-h-[80px] md:min-h-[100px] p-1 sm:p-2 border-r border-b border-slate-200 dark:border-slate-700
                              ${!isCurrentMonth ? 'bg-slate-50 dark:bg-slate-900/50 opacity-50' : 'bg-white dark:bg-slate-800'}
                              ${isToday ? 'ring-2 ring-primary' : ''}
                              ${snapshot.isDraggingOver ? 'ring-2 ring-primary/50 bg-primary/5 dark:bg-primary/10' : ''}
                              hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors
                            `}
                          >
                            <div className={`text-xs sm:text-sm font-semibold mb-0.5 sm:mb-1 ${isToday ? 'text-primary' : isCurrentMonth ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>
                              {format(day, "d")}
                            </div>
                            <div className="space-y-0.5 sm:space-y-1 max-h-[50px] sm:max-h-[70px] overflow-y-auto">
                              {dayEvents.slice(0, 3).map((event: any) => (
                                <Draggable key={event.id} draggableId={event.id} index={dayEvents.indexOf(event)}>
                                  {(provided, snapshot) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                      className={`text-[10px] sm:text-xs p-0.5 sm:p-1 rounded bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-300 cursor-grab active:cursor-grabbing truncate ${
                                        snapshot.isDragging ? 'opacity-50' : ''
                                      }`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedEvent(event);
                                        setIsFormOpen(true);
                                      }}
                                      style={provided.draggableProps.style}
                                    >
                                      <Clock className="w-2 h-2 inline mr-0.5" />
                                      {format(new Date(event.startTime), "HH:mm")} {event.title}
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                              {dayEvents.length > 3 && (
                                <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                                  +{dayEvents.length - 3} ещё
                                </div>
                              )}
                              {provided.placeholder}
                            </div>
                          </div>
                        )}
                      </Droppable>
                    );
                  });
                })()}
              </div>
            </div>
          </DragDropContext>
        </div>
      ) : viewMode === "week" ? (
        <div className="space-y-4">
          {/* Week Navigation */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-3 p-2 sm:p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <CalendarIcon className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              <span className="font-semibold text-sm sm:text-base">
                {format(weekStart, "d MMMM", { locale: ru })} - {format(weekEnd, "d MMMM yyyy", { locale: ru })}
              </span>
            </div>
            <div className="flex gap-1 sm:gap-2 w-full sm:w-auto">
              <Button 
                variant="outline" 
                size="sm"
                className="border-slate-300 dark:border-slate-600 text-xs sm:text-sm flex-1 sm:flex-initial px-2 sm:px-3"
                onClick={() => setSelectedDate(new Date(selectedDate.getTime() - 7 * 24 * 60 * 60 * 1000))}
              >
                ← Пред
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                className="border-slate-300 dark:border-slate-600 text-xs sm:text-sm flex-1 sm:flex-initial px-2 sm:px-3"
                onClick={() => setSelectedDate(new Date())}
              >
                🎯 Сегодня
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                className="border-slate-300 dark:border-slate-600 text-xs sm:text-sm flex-1 sm:flex-initial px-2 sm:px-3"
                onClick={() => setSelectedDate(new Date(selectedDate.getTime() + 7 * 24 * 60 * 60 * 1000))}
              >
                След →
              </Button>
            </div>
          </div>

          {/* Week View */}
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3">
              {weekDays.map((day, index) => {
                const dayEvents = getEventsForDate(day);
                const isToday = isSameDay(day, new Date());
                const dayId = `day-${format(day, "yyyy-MM-dd")}`;
                
                return (
                  <Droppable key={dayId} droppableId={dayId}>
                    {(provided, snapshot) => (
                      <div 
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`
                          min-h-[120px] sm:min-h-[150px] md:min-h-[180px] rounded-xl p-2 sm:p-3
                          bg-white dark:bg-slate-800/90
                          border border-slate-200 dark:border-slate-700
                          ${isToday ? 'ring-2 ring-primary shadow-md' : ''}
                          ${snapshot.isDraggingOver ? 'ring-2 ring-primary/50 bg-primary/5 dark:bg-primary/10' : ''}
                          overflow-hidden
                        `}
                      >
                        {/* Day Header */}
                        <div className="mb-1 sm:mb-2 pb-1 sm:pb-2 border-b border-slate-100 dark:border-slate-700">
                          <div className="text-[10px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                            {format(day, "EEE", { locale: ru })}
                          </div>
                          <div className={`text-lg sm:text-xl font-bold ${isToday ? 'text-primary' : 'text-slate-900 dark:text-white'}`}>
                            {format(day, "d")}
                          </div>
                        </div>
                        
                        {/* Events */}
                        <div className="space-y-1 sm:space-y-1.5 overflow-y-auto max-h-[80px] sm:max-h-[100px] md:max-h-[120px]">
                          {dayEvents.length === 0 && !snapshot.isDraggingOver ? (
                            <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 text-center py-1 sm:py-2">Нет событий</p>
                          ) : (
                            dayEvents.map((event: any, eventIndex: number) => (
                              <Draggable key={event.id} draggableId={event.id} index={eventIndex}>
                                {(provided, snapshot) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    className={`p-1.5 sm:p-2 rounded-lg bg-slate-50 dark:bg-slate-700/50 border-l-3 border-primary cursor-grab active:cursor-grabbing hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ${
                                      snapshot.isDragging ? 'opacity-50 rotate-1 scale-95' : ''
                                    }`}
                                    onClick={() => {
                                      setSelectedEvent(event);
                                      setIsFormOpen(true);
                                    }}
                                    style={{ 
                                      borderLeftWidth: '3px',
                                      ...provided.draggableProps.style 
                                    }}
                                  >
                                    <p className="text-[10px] sm:text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                                      {event.title}
                                    </p>
                                    <div className="flex items-center gap-1 text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                                      <Clock className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
                                      {format(new Date(event.startTime), "HH:mm")}
                                    </div>
                                  </div>
                                )}
                              </Draggable>
                            ))
                          )}
                          {provided.placeholder}
                        </div>
                      </div>
                    )}
                  </Droppable>
                );
              })}
            </div>
          </DragDropContext>
        </div>
      ) : (
        /* Day View */
        <div className="space-y-3 sm:space-y-4">
          <Card>
            <CardHeader className="p-3 sm:p-6">
              <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
                <div className="flex items-center gap-2 text-base sm:text-lg md:text-xl">
                  <CalendarIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="break-words">{format(selectedDate, "d MMMM yyyy, EEEE", { locale: ru })}</span>
                </div>
                <div className="flex gap-1 sm:gap-2 w-full sm:w-auto">
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="text-xs sm:text-sm flex-1 sm:flex-initial px-2 sm:px-3"
                    onClick={() => setSelectedDate(new Date(selectedDate.getTime() - 24 * 60 * 60 * 1000))}
                  >
                    ← Вчера
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="text-xs sm:text-sm flex-1 sm:flex-initial px-2 sm:px-3"
                    onClick={() => setSelectedDate(new Date())}
                  >
                    🎯 Сегодня
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="text-xs sm:text-sm flex-1 sm:flex-initial px-2 sm:px-3"
                    onClick={() => setSelectedDate(new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000))}
                  >
                    Завтра →
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0">
              <div className="space-y-2 sm:space-y-3">
                {getEventsForDate(selectedDate).length === 0 ? (
                  <div className="text-center py-8 sm:py-12">
                    <CalendarIcon className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
                    <p className="text-muted-foreground text-sm sm:text-base">На этот день события не запланированы</p>
                  </div>
                ) : (
                  getEventsForDate(selectedDate).map((event: any) => (
                    <Card key={event.id} className="hover:shadow-md transition-shadow cursor-pointer">
                      <CardHeader className="pb-2 sm:pb-3 p-3 sm:p-6">
                        <div className="flex flex-col sm:flex-row items-start sm:items-start justify-between gap-2 sm:gap-0">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-base sm:text-lg break-words">
                              {event.title}
                            </CardTitle>
                            <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-2 text-xs sm:text-sm text-muted-foreground">
                              <div className="flex items-center">
                                <Clock className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                                {format(new Date(event.startTime), "HH:mm")} - {format(new Date(event.endTime), "HH:mm")}
                              </div>
                              {event.location && (
                                <div className="flex items-center">
                                  <MapPin className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                                  <span className="break-words">{event.location}</span>
                                </div>
                              )}
                              {event.participants && event.participants.length > 0 && (
                                <div className="flex items-center">
                                  <Users className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                                  {event.participants.length} участников
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 self-start sm:self-center">
                            <Badge className={`${getEventTypeColor(event.type)} text-xs sm:text-sm`}>
                              {getEventTypeText(event.type)}
                            </Badge>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="h-8 w-8 sm:h-9 sm:w-9 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEvent(event);
                                setIsFormOpen(true);
                              }}
                            >
                              <Edit className="w-3 h-3 sm:w-4 sm:h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      {event.description && (
                        <CardContent className="p-3 sm:p-6 pt-0">
                          <p className="text-xs sm:text-sm text-muted-foreground break-words">{event.description}</p>
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