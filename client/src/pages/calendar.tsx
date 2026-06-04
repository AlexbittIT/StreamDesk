import { useState, Fragment, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Calendar as CalendarIcon, Plus, Clock, MapPin, Users, Edit, Settings, Trash2, Check, X } from "lucide-react";
import { EventForm } from "@/components/forms/event-form";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, setHours, setMinutes, startOfMonth, endOfMonth, getISOWeek, isWithinInterval, addDays } from "date-fns";
import { ru } from "date-fns/locale";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AuthService } from "@/lib/auth";

export default function Calendar() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  /** Черновик времени при создании из выделения в сетке недели */
  const [draftSlot, setDraftSlot] = useState<{ startTime: string; endTime: string } | null>(null);
  const [viewMode, setViewMode] = useState<"week" | "day" | "month" | "3days" | "list">("week");
  const { toast } = useToast();
  const weekScrollRef = useRef<HTMLDivElement>(null);
  const threeDaysScrollRef = useRef<HTMLDivElement>(null);

  /** Выделение интервала в виде недели: начало и конец (dayIndex, hour) */
  const [slotSelectStart, setSlotSelectStart] = useState<{ dayIndex: number; hour: number } | null>(null);
  const [slotSelectEnd, setSlotSelectEnd] = useState<{ dayIndex: number; hour: number } | null>(null);

  const handleSlotMouseUp = useCallback(() => {
    if (!slotSelectStart) return;
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
    const weekDaysArr = eachDayOfInterval({ start: weekStart, end: weekEnd });
    const end = slotSelectEnd || slotSelectStart;
    const dayStart = weekDaysArr[slotSelectStart.dayIndex];
    const dayEnd = weekDaysArr[end.dayIndex];
    const startTime = setMinutes(setHours(dayStart, slotSelectStart.hour), 0);
    let endTime = setMinutes(setHours(dayEnd, end.hour), 0);
    if (slotSelectStart.dayIndex === end.dayIndex && slotSelectStart.hour === end.hour) {
      endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
    } else {
      endTime = new Date(endTime.getTime() + 60 * 60 * 1000);
    }
    setDraftSlot({ startTime: startTime.toISOString(), endTime: endTime.toISOString() });
    setSelectedEvent(null);
    setIsFormOpen(true);
    setSlotSelectStart(null);
    setSlotSelectEnd(null);
  }, [slotSelectStart, slotSelectEnd, selectedDate]);

  useEffect(() => {
    if (!slotSelectStart) return;
    const onUp = () => { handleSlotMouseUp(); };
    const onMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const dayIdx = target.getAttribute("data-day-index");
      const hourStr = target.getAttribute("data-hour");
      if (dayIdx != null && hourStr != null) {
        setSlotSelectEnd({ dayIndex: parseInt(dayIdx, 10), hour: parseInt(hourStr, 10) });
      }
    };
    document.addEventListener("mouseup", onUp);
    document.addEventListener("mousemove", onMove);
    return () => {
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("mousemove", onMove);
    };
  }, [slotSelectStart, handleSlotMouseUp]);


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
      queryClient.refetchQueries({ queryKey: ["/api/events"] });
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

  const deleteEventMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/events/${id}`);
      if (!response.ok) throw new Error("Не удалось удалить");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setSelectedEvent(null);
      setIsDetailOpen(false);
      toast({ title: "Событие удалено" });
    },
    onError: () => {
      toast({ title: "Ошибка", description: "Не удалось удалить событие", variant: "destructive" });
    },
  });

  const respondParticipantMutation = useMutation({
    mutationFn: async ({ eventId, participantId, status }: { eventId: string; participantId: string; status: "accepted" | "declined" }) => {
      const response = await apiRequest("PATCH", `/api/events/${eventId}/participants/${participantId}`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({ title: "Ответ сохранён" });
    },
    onError: () => {
      toast({ title: "Ошибка", description: "Не удалось сохранить ответ", variant: "destructive" });
    },
  });

  const HOUR_START = 0;
  const HOUR_END = 24;
  const ROW_HEIGHT = 48;

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const threeDays = eachDayOfInterval({ start: selectedDate, end: addDays(selectedDate, 2) });
  const todayColumnIndexWeek = weekDays.findIndex((d) => isSameDay(d, new Date()));
  const todayColumnIndex3 = threeDays.findIndex((d) => isSameDay(d, new Date()));

  /** Прокрутка к текущему часу при открытии и при переключении вида неделя/3 дня */
  useEffect(() => {
    const scrollToCurrentHour = (el: HTMLDivElement | null) => {
      if (!el) return;
      const now = new Date();
      const currentHour = now.getHours() - HOUR_START + now.getMinutes() / 60;
      const scrollTop = Math.max(0, currentHour * ROW_HEIGHT - el.clientHeight / 3);
      el.scrollTo({ top: scrollTop, behavior: "smooth" });
    };
    const t = setTimeout(() => {
      if (viewMode === "week") scrollToCurrentHour(weekScrollRef.current);
      if (viewMode === "3days") scrollToCurrentHour(threeDaysScrollRef.current);
    }, 100);
    return () => clearTimeout(t);
  }, [viewMode]);

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

  const getEventTypeText = (type: string) => {
    switch (type) {
      case "stream": return "Стрим";
      case "meeting": return "Встреча";
      case "production": return "Производство";
      case "maintenance": return "Обслуживание";
      case "recording": return "Запись";
      default: return type;
    }
  };

  // DnD между днями отключён, чтобы не вызывать ошибки React.Children.only.
  // Оставляем функцию-заглушку на случай будущего расширения.
  const handleDragEnd = (result: any) => {
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

  const totalMinutes = (HOUR_END - HOUR_START) * 60;
  const weekNumber = getISOWeek(weekStart);
  const now = new Date();

  const showNowLineWeek = viewMode === "week" && todayColumnIndexWeek >= 0 && isWithinInterval(now, { start: weekStart, end: weekEnd }) && now.getHours() >= HOUR_START && now.getHours() < HOUR_END;
  const showNowLine3 = viewMode === "3days" && todayColumnIndex3 >= 0 && now.getHours() >= HOUR_START && now.getHours() < HOUR_END;
  const showNowLine = showNowLineWeek || showNowLine3;
  const nowTop = showNowLine ? (now.getHours() - HOUR_START + now.getMinutes() / 60) * ROW_HEIGHT : 0;
  const nowColumnIndex = viewMode === "week" ? todayColumnIndexWeek : viewMode === "3days" ? todayColumnIndex3 : 0;
  const nowColumnCount = viewMode === "week" ? 7 : 3;

  const getEventBlockStyle = (event: any, dayIndex: number) => {
    const start = new Date(event.startTime);
    const end = new Date(event.endTime);
    const startMinutes = start.getHours() * 60 + start.getMinutes() - HOUR_START * 60;
    const endMinutes = end.getHours() * 60 + end.getMinutes() - HOUR_START * 60;
    const top = Math.max(0, (startMinutes / 60) * ROW_HEIGHT);
    const height = Math.min((Math.max(0, endMinutes - startMinutes) / 60) * ROW_HEIGHT, (HOUR_END - HOUR_START) * ROW_HEIGHT - top);
    return { top: `${top}px`, height: `${Math.max(height, 20)}px` };
  };

  /** Разметка «дорожек» для накладывающихся событий в одном дне: каждому событию — laneIndex и totalLanes */
  const getEventLaneLayout = (dayEvents: any[]): Map<string, { laneIndex: number; totalLanes: number }> => {
    const sorted = [...dayEvents].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    const lanes: number[] = []; // конец последнего события в каждой дорожке (минуты от 0:00)
    const result = new Map<string, { laneIndex: number; totalLanes: number }>();
    for (const event of sorted) {
      const start = new Date(event.startTime);
      const end = new Date(event.endTime);
      const startM = start.getHours() * 60 + start.getMinutes();
      const endM = end.getHours() * 60 + end.getMinutes();
      let lane = 0;
      for (; lane < lanes.length; lane++) {
        if (lanes[lane] <= startM) break;
      }
      if (lane === lanes.length) lanes.push(0);
      lanes[lane] = endM;
      result.set(event.id, { laneIndex: lane, totalLanes: 0 });
    }
    const totalLanes = lanes.length;
    result.forEach((v) => { v.totalLanes = totalLanes; });
    return result;
  };

  /** Стиль left/width для карточки при наложении (небольшой зазор между карточками) */
  const getEventOverlapStyle = (eventId: string, laneLayout: Map<string, { laneIndex: number; totalLanes: number }>) => {
    const layout = laneLayout.get(eventId);
    if (!layout || layout.totalLanes <= 1) return { left: "2%", width: "96%" };
    const gap = 2;
    const w = (100 - gap * (layout.totalLanes + 1)) / layout.totalLanes;
    const left = gap + layout.laneIndex * (w + gap);
    return { left: `${left}%`, width: `${w}%` };
  };

  const EVENT_COLOR_PALETTES = [
    {
      card: "border-l-rose-400 border-rose-200/80 dark:border-rose-900/70 bg-rose-100/90 dark:bg-rose-950/45 text-rose-950 dark:text-rose-50",
      inline: "border-l-rose-400 border-rose-200/80 dark:border-rose-900/70 bg-rose-100/95 dark:bg-rose-950/55 text-rose-950 dark:text-rose-50",
      dot: "bg-rose-400",
      badge: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-200",
    },
    {
      card: "border-l-sky-400 border-sky-200/80 dark:border-sky-900/70 bg-sky-100/90 dark:bg-sky-950/45 text-sky-950 dark:text-sky-50",
      inline: "border-l-sky-400 border-sky-200/80 dark:border-sky-900/70 bg-sky-100/95 dark:bg-sky-950/55 text-sky-950 dark:text-sky-50",
      dot: "bg-sky-400",
      badge: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-200",
    },
    {
      card: "border-l-emerald-400 border-emerald-200/80 dark:border-emerald-900/70 bg-emerald-100/90 dark:bg-emerald-950/45 text-emerald-950 dark:text-emerald-50",
      inline: "border-l-emerald-400 border-emerald-200/80 dark:border-emerald-900/70 bg-emerald-100/95 dark:bg-emerald-950/55 text-emerald-950 dark:text-emerald-50",
      dot: "bg-emerald-400",
      badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200",
    },
    {
      card: "border-l-amber-400 border-amber-200/80 dark:border-amber-900/70 bg-amber-100/90 dark:bg-amber-950/45 text-amber-950 dark:text-amber-50",
      inline: "border-l-amber-400 border-amber-200/80 dark:border-amber-900/70 bg-amber-100/95 dark:bg-amber-950/55 text-amber-950 dark:text-amber-50",
      dot: "bg-amber-400",
      badge: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-200",
    },
    {
      card: "border-l-violet-400 border-violet-200/80 dark:border-violet-900/70 bg-violet-100/90 dark:bg-violet-950/45 text-violet-950 dark:text-violet-50",
      inline: "border-l-violet-400 border-violet-200/80 dark:border-violet-900/70 bg-violet-100/95 dark:bg-violet-950/55 text-violet-950 dark:text-violet-50",
      dot: "bg-violet-400",
      badge: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-200",
    },
    {
      card: "border-l-cyan-400 border-cyan-200/80 dark:border-cyan-900/70 bg-cyan-100/90 dark:bg-cyan-950/45 text-cyan-950 dark:text-cyan-50",
      inline: "border-l-cyan-400 border-cyan-200/80 dark:border-cyan-900/70 bg-cyan-100/95 dark:bg-cyan-950/55 text-cyan-950 dark:text-cyan-50",
      dot: "bg-cyan-400",
      badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-200",
    },
    {
      card: "border-l-fuchsia-400 border-fuchsia-200/80 dark:border-fuchsia-900/70 bg-fuchsia-100/90 dark:bg-fuchsia-950/45 text-fuchsia-950 dark:text-fuchsia-50",
      inline: "border-l-fuchsia-400 border-fuchsia-200/80 dark:border-fuchsia-900/70 bg-fuchsia-100/95 dark:bg-fuchsia-950/55 text-fuchsia-950 dark:text-fuchsia-50",
      dot: "bg-fuchsia-400",
      badge: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/60 dark:text-fuchsia-200",
    },
  ] as const;

  const getEventPalette = (event: any) => {
    const key = `${event?.id ?? ""}:${event?.title ?? ""}:${event?.type ?? ""}`;
    const hash = Array.from(key).reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return EVENT_COLOR_PALETTES[hash % EVENT_COLOR_PALETTES.length];
  };

  const getEventInlineClasses = (event: any) => {
    const palette = getEventPalette(event);
    return `border border-l-4 ${palette.inline}`;
  };

  const getEventCardClasses = (event: any) => {
    const palette = getEventPalette(event);
    return `border-l-4 ${palette.card}`;
  };

  const getEventDotClass = (event: any) => getEventPalette(event).dot;

  const getEventBadgeClasses = (event: any) => getEventPalette(event).badge;

  return (
    <div className="space-y-1.5 sm:space-y-2 p-0 w-full min-w-0 max-w-full overflow-hidden">
      {/* Шапка: адаптивно на телефоне — перенос, компактные кнопки */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 sm:gap-3 w-full min-w-0">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <h2 className="text-base sm:text-lg font-bold text-foreground truncate">
            Календарь
          </h2>
          <Button size="sm" className="h-8 rounded-lg text-xs shrink-0 bg-primary text-primary-foreground sm:order-3" onClick={() => { setSelectedEvent(null); setIsFormOpen(true); }}>
            <Plus className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">Событие</span>
          </Button>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="outline" size="sm" className="h-8 w-8 p-0 rounded-lg border-border shrink-0" onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1))}>
            <span className="sr-only">Назад</span>←
          </Button>
          <span className="text-xs sm:text-sm font-medium text-foreground min-w-[90px] sm:min-w-[100px] text-center truncate">
            {format(selectedDate, "LLLL yyyy", { locale: ru })}
          </span>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0 rounded-lg border-border shrink-0" onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1))}>
            <span className="sr-only">Вперёд</span>→
          </Button>
        </div>
        <Button variant="outline" size="sm" className="h-8 rounded-lg border-border text-xs shrink-0" onClick={() => setSelectedDate(new Date())}>
          Сегодня
        </Button>
        <Button variant="outline" size="sm" className="h-8 rounded-lg border-border text-xs shrink-0 hidden sm:flex" onClick={() => {}} title="Настройки и экспорт">
          <Settings className="h-4 w-4 mr-1.5" />
          Настройки
        </Button>
        <div className="flex rounded-lg p-0.5 bg-muted/40 shrink-0 overflow-x-auto hide-scrollbar">
          <Button variant={viewMode === "month" ? "default" : "ghost"} size="sm" className={cn("h-7 text-[10px] sm:text-xs px-2 sm:px-2.5 rounded-md shrink-0", viewMode === "month" && "bg-background shadow-sm")} onClick={() => setViewMode("month")}>Месяц</Button>
          <Button variant={viewMode === "week" ? "default" : "ghost"} size="sm" className={cn("h-7 text-[10px] sm:text-xs px-2 sm:px-2.5 rounded-md shrink-0", viewMode === "week" && "bg-background shadow-sm")} onClick={() => setViewMode("week")}>Неделя</Button>
          <Button variant={viewMode === "3days" ? "default" : "ghost"} size="sm" className={cn("h-7 text-[10px] sm:text-xs px-2 sm:px-2.5 rounded-md shrink-0", viewMode === "3days" && "bg-background shadow-sm")} onClick={() => setViewMode("3days")}>3 дня</Button>
          <Button variant={viewMode === "day" ? "default" : "ghost"} size="sm" className={cn("h-7 text-[10px] sm:text-xs px-2 sm:px-2.5 rounded-md shrink-0", viewMode === "day" && "bg-background shadow-sm")} onClick={() => setViewMode("day")}>День</Button>
          <Button variant={viewMode === "list" ? "default" : "ghost"} size="sm" className={cn("h-7 text-[10px] sm:text-xs px-2 sm:px-2.5 rounded-md shrink-0", viewMode === "list" && "bg-background shadow-sm")} onClick={() => setViewMode("list")}>Список</Button>
        </div>
      </div>

      {viewMode === "month" ? (
        /* Month View */
        <div className="space-y-1.5">
          {/* Month Navigation */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-1 sm:gap-1.5 p-1.5 sm:p-2 bg-card rounded-xl border border-border w-full min-w-0">
            <div className="flex items-center gap-2 text-foreground shrink-0">
              <CalendarIcon className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              <span className="font-semibold text-base sm:text-lg truncate">
                {format(selectedDate, "LLLL yyyy", { locale: ru })}
              </span>
            </div>
            <div className="flex flex-wrap gap-1 sm:gap-2 w-full sm:w-auto min-w-0">
              <Button 
                variant="outline" 
                size="sm"
                className="border-border text-xs sm:text-sm flex-1 min-w-0 sm:flex-initial px-2 sm:px-3 rounded-xl"
                onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1))}
              >
                ← Пред
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                className="border-border text-xs sm:text-sm flex-1 min-w-0 sm:flex-initial px-2 sm:px-3 rounded-xl"
                onClick={() => setSelectedDate(new Date())}
              >
                Сегодня
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                className="border-border text-xs sm:text-sm flex-1 min-w-0 sm:flex-initial px-2 sm:px-3 rounded-xl"
                onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1))}
              >
                След →
              </Button>
            </div>
          </div>

          {/* Month Grid (без drag-and-drop, только клики по событиям) */}
            <div className="rounded-xl border border-border overflow-hidden bg-card min-w-0">
              {/* Weekday Headers — без лишних вертикальных линий */}
              <div className="grid grid-cols-7 border-b border-border">
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => (
                  <div key={day} className="p-1 sm:p-1.5 text-center text-[10px] sm:text-xs font-semibold text-muted-foreground">
                    {day}
                  </div>
                ))}
              </div>
              
              {/* Calendar Days — только нижняя граница ряда, без сетки между ячейками */}
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
                      <div
                        key={dayId}
                        className={`
                          min-h-[44px] sm:min-h-[56px] md:min-h-[64px] p-0.5 sm:p-1 border-b border-border
                          ${!isCurrentMonth ? 'bg-muted/20 opacity-70' : 'bg-card'}
                          ${isToday ? 'ring-2 ring-inset ring-primary' : ''}
                          hover:bg-muted/20 transition-colors
                        `}
                      >
                        <div className={`text-xs sm:text-sm font-semibold mb-0.5 sm:mb-1 ${isToday ? 'text-primary' : isCurrentMonth ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>
                          {format(day, "d")}
                        </div>
                        <div className="space-y-0.5 sm:space-y-1 max-h-[50px] sm:max-h-[70px] overflow-y-auto hide-scrollbar">
                          {dayEvents.slice(0, 3).map((event: any, idx: number) => (
                            <div
                              key={event.id}
                              className={cn("text-[10px] sm:text-xs px-2 py-1 rounded-r-xl rounded-l-md truncate shadow-sm cursor-pointer", getEventInlineClasses(event))}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEvent(event);
                                setIsDetailOpen(true);
                              }}
                            >
                              <Clock className="w-2 h-2 inline mr-0.5" />
                              {format(new Date(event.startTime), "HH:mm")} {event.title}
                            </div>
                          ))}
                          {dayEvents.length > 3 && (
                            <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                              +{dayEvents.length - 3} ещё
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
        </div>
      ) : viewMode === "week" ? (
        <>
        {/* Неделя: одна таблица — по одному ряду на час; при открытии прокрутка к текущему часу */}
        <div ref={weekScrollRef} className="rounded-xl border border-border bg-card overflow-hidden min-w-0 max-h-[70vh] sm:max-h-[75vh] overflow-y-auto overflow-x-auto">
        <div className="grid min-w-0" style={{ gridTemplateColumns: "minmax(44px,56px) repeat(7, minmax(0,1fr))" }}>
          {/* Шапка */}
          <div className="border-b border-r border-border py-1.5 sm:py-2 pl-1.5 sm:pl-2 text-[10px] sm:text-xs font-medium text-foreground">
            Н{weekNumber}
          </div>
          {weekDays.map((day) => {
            const isToday = isSameDay(day, new Date());
            return (
              <div key={day.toISOString()} className="text-center py-1.5 sm:py-2 px-0.5 border-b border-r border-border last:border-r-0 min-w-[2.5rem] sm:min-w-0">
                <div className="text-[9px] sm:text-xs text-muted-foreground uppercase truncate">{format(day, "EEE", { locale: ru })}</div>
                <div className={cn("text-xs sm:text-sm font-semibold rounded inline-block min-w-[1.25rem]", isToday && "bg-red-500 text-white px-1")}>
                  {format(day, "d")}
                </div>
              </div>
            );
          })}
          {/* Сетка по часам: один ряд = один час, одна нижняя граница у ряда */}
          {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i).map((h) => (
            <Fragment key={h}>
              <div className="flex items-start justify-end pr-0.5 sm:pr-1 text-[10px] sm:text-xs text-muted-foreground border-b border-r border-border shrink-0" style={{ height: ROW_HEIGHT, minHeight: ROW_HEIGHT }}>
                {format(setMinutes(setHours(new Date(), h), 0), "HH:mm")}
              </div>
              {weekDays.map((day) => (
                <div key={`${h}-${day.toISOString()}`} className="border-b border-r border-border last:border-r-0 min-w-0" style={{ height: ROW_HEIGHT, minHeight: ROW_HEIGHT }} />
              ))}
            </Fragment>
          ))}
        </div>
          {/* Слой с событиями поверх сетки */}
          <div
            className="relative pointer-events-none mt-0"
            style={{ marginTop: -((HOUR_END - HOUR_START) * ROW_HEIGHT) }}
          >
            <div className="grid min-w-0 pointer-events-auto" style={{ gridTemplateColumns: "minmax(44px,56px) repeat(7, minmax(0,1fr))" }}>
              <div className="col-span-1" style={{ height: (HOUR_END - HOUR_START) * ROW_HEIGHT }} />
          <div
            className="col-span-7 relative"
            style={{ height: (HOUR_END - HOUR_START) * ROW_HEIGHT, minHeight: (HOUR_END - HOUR_START) * ROW_HEIGHT }}
          >
            {/* Слой выделения интервала: клик и протягивание создают событие */}
            {weekDays.map((day, dayIndex) =>
              Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i).map((h) => {
                const isSelected = slotSelectStart && slotSelectEnd && (() => {
                  const minD = Math.min(slotSelectStart.dayIndex, slotSelectEnd.dayIndex);
                  const maxD = Math.max(slotSelectStart.dayIndex, slotSelectEnd.dayIndex);
                  const minH = Math.min(slotSelectStart.hour, slotSelectEnd.hour);
                  const maxH = Math.max(slotSelectStart.hour, slotSelectEnd.hour);
                  return dayIndex >= minD && dayIndex <= maxD && h >= minH && h <= maxH;
                })();
                return (
                  <div
                    key={`slot-${dayIndex}-${h}`}
                    data-day-index={dayIndex}
                    data-hour={h}
                    className={cn(
                      "absolute left-0 cursor-cell border-b border-border/50 transition-colors duration-150",
                      isSelected && "bg-primary/40 dark:bg-primary/35 ring-2 ring-inset ring-primary/60"
                    )}
                    style={{
                      left: `${(100 / 7) * dayIndex}%`,
                      width: `${100 / 7}%`,
                      top: (h - HOUR_START) * ROW_HEIGHT,
                      height: ROW_HEIGHT,
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setSlotSelectStart({ dayIndex, hour: h });
                      setSlotSelectEnd({ dayIndex, hour: h });
                    }}
                  />
                );
              })
            )}
            {showNowLine && nowColumnIndex >= 0 && (
              <div className="absolute h-px bg-red-500 z-10 pointer-events-none" style={{ top: nowTop, left: `${(100 / nowColumnCount) * nowColumnIndex}%`, width: `${100 / nowColumnCount}%` }} />
            )}
            {weekDays.map((day, dayIndex) => {
              const dayEvents = getEventsForDate(day).filter((e: any) => {
                const start = new Date(e.startTime);
                const end = new Date(e.endTime);
                const hStart = start.getHours() + start.getMinutes() / 60;
                const hEnd = end.getHours() + end.getMinutes() / 60;
                return hEnd > HOUR_START && hStart < HOUR_END;
              });
              const laneLayout = getEventLaneLayout(dayEvents);
              return (
                <div key={day.toISOString()} className="absolute top-0 bottom-0 border-l border-border first:border-l-0 z-10" style={{ left: `${(100 / 7) * dayIndex}%`, width: `${100 / 7}%`, pointerEvents: "none" }}>
                  {dayEvents.map((event: any) => {
                    const style = getEventBlockStyle(event, dayIndex);
                    const overlapStyle = getEventOverlapStyle(event.id, laneLayout);
                    return (
                      <div
                        key={event.id}
                        className={cn(
                          "absolute rounded-xl text-xs overflow-hidden cursor-pointer pointer-events-auto shadow-md hover:shadow-lg transition-all duration-200 backdrop-blur-sm border border-white/10 dark:border-white/5",
                          getEventCardClasses(event)
                        )}
                        style={{ ...style, ...overlapStyle, minHeight: 24 }}
                        onClick={() => { setSelectedEvent(event); setIsDetailOpen(true); }}
                      >
                        <div className="p-1.5 truncate font-medium leading-tight">{event.title}</div>
                        <div className="px-1.5 text-[10px] opacity-90">
                          {format(new Date(event.startTime), "HH:mm")} – {format(new Date(event.endTime), "HH:mm")}
                        </div>
                        {event.location && (
                          <div className="px-1.5 pb-1.5 text-[10px] opacity-90 truncate flex items-center gap-0.5">
                            <MapPin className="w-3 h-3 shrink-0" />
                            {event.location}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        </div>
        </div>
        </>
      ) : viewMode === "3days" ? (
        /* 3 дня: та же сетка со скроллом по времени; при открытии — к текущему часу */
        <div ref={threeDaysScrollRef} className="rounded-xl border border-border bg-card overflow-hidden min-w-0 max-h-[75vh] overflow-y-auto">
        <div className="grid min-w-0" style={{ gridTemplateColumns: "56px 1fr 1fr 1fr" }}>
          <div className="border-b border-r border-border py-2 pl-2 text-xs font-medium text-foreground">
            Неделя {getISOWeek(weekStart)}
          </div>
          {threeDays.map((day) => {
            const isToday = isSameDay(day, new Date());
            return (
              <div key={day.toISOString()} className="text-center py-2 px-1 border-b border-l border-border">
                <div className="text-[10px] sm:text-xs text-muted-foreground uppercase">{format(day, "EEE", { locale: ru })}</div>
                <div className={cn("text-sm font-semibold rounded-md inline-block min-w-[1.5rem]", isToday && "bg-red-500 text-white px-1")}>
                  {format(day, "d")}
                </div>
              </div>
            );
          })}
          <div
            className="relative col-start-1 row-start-2 flex flex-col border-r border-border shrink-0"
            style={{ height: (HOUR_END - HOUR_START) * ROW_HEIGHT, minHeight: (HOUR_END - HOUR_START) * ROW_HEIGHT }}
          >
            {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i).map((h) => (
              <div key={h} className="flex items-start justify-end pr-1 text-xs text-muted-foreground shrink-0" style={{ height: ROW_HEIGHT, minHeight: ROW_HEIGHT }}>
                {format(setMinutes(setHours(new Date(), h), 0), "HH:mm")}
              </div>
            ))}
            {showNowLine3 && (
              <div className="absolute right-0 pr-1 -translate-y-1/2 text-xs font-medium text-red-500 z-10 pointer-events-none" style={{ top: nowTop }}>
                {format(now, "HH:mm")}
              </div>
            )}
          </div>
          <div
            className="col-span-3 col-start-2 row-start-2 relative overflow-x-auto min-w-0"
            style={{ height: (HOUR_END - HOUR_START) * ROW_HEIGHT, minHeight: (HOUR_END - HOUR_START) * ROW_HEIGHT }}
          >
            {/* Сетка для вида 3 дня: вертикальные и лёгкие горизонтальные линии */}
            <div className="absolute inset-0 grid grid-cols-3 min-w-[200px] sm:min-w-[280px] pointer-events-none">
              {threeDays.map((day) => (
                <div key={day.toISOString()} className="relative border-r border-border/60 last:border-r-0">
                  {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
                    <div
                      key={i}
                      className="border-b border-border/20"
                      style={{ height: ROW_HEIGHT, minHeight: ROW_HEIGHT }}
                    />
                  ))}
                </div>
              ))}
            </div>
            {showNowLine3 && nowColumnIndex >= 0 && (
              <div className="absolute h-px bg-red-500 z-10 pointer-events-none" style={{ top: nowTop, left: `${(100 / 3) * nowColumnIndex}%`, width: `${100 / 3}%` }} />
            )}
            {threeDays.map((day, dayIndex) => {
              const dayEvents = getEventsForDate(day).filter((e: any) => {
                const start = new Date(e.startTime);
                const end = new Date(e.endTime);
                const hStart = start.getHours() + start.getMinutes() / 60;
                const hEnd = end.getHours() + end.getMinutes() / 60;
                return hEnd > HOUR_START && hStart < HOUR_END;
              });
              const laneLayout = getEventLaneLayout(dayEvents);
              return (
                <div key={day.toISOString()} className="absolute top-0 bottom-0 border-l border-border first:border-l-0" style={{ left: `${(100 / 3) * dayIndex}%`, width: `${100 / 3}%` }}>
                  {dayEvents.map((event: any) => {
                    const style = getEventBlockStyle(event, dayIndex);
                    const overlapStyle = getEventOverlapStyle(event.id, laneLayout);
                    return (
                      <div
                        key={event.id}
                        className={cn(
                          "absolute rounded-xl text-xs overflow-hidden cursor-pointer shadow-md hover:shadow-lg transition-all duration-200 backdrop-blur-sm border border-white/10 dark:border-white/5",
                          getEventCardClasses(event)
                        )}
                        style={{ ...style, ...overlapStyle, minHeight: 24 }}
                        onClick={() => { setSelectedEvent(event); setIsDetailOpen(true); }}
                      >
                        <div className="p-1.5 truncate font-medium leading-tight">{event.title}</div>
                        <div className="px-1.5 text-[10px] opacity-90">
                          {format(new Date(event.startTime), "HH:mm")} – {format(new Date(event.endTime), "HH:mm")}
                        </div>
                        {event.location && (
                          <div className="px-1.5 pb-1.5 text-[10px] opacity-90 truncate flex items-center gap-0.5">
                            <MapPin className="w-3 h-3 shrink-0" />
                            {event.location}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        </div>
      ) : viewMode === "list" ? (
        /* Список: события недели, те же карточки что в виде День */
        <div className="rounded-xl border border-border bg-card overflow-hidden min-w-0">
          <div className="p-2 sm:p-3 border-b border-border">
            <div className="flex items-center gap-2 text-foreground">
              <CalendarIcon className="w-4 h-4 text-primary shrink-0" />
              <span className="font-semibold text-sm sm:text-base">
                {format(weekStart, "d MMM", { locale: ru })} – {format(weekEnd, "d MMM yyyy", { locale: ru })}
              </span>
            </div>
          </div>
          <div className="p-2 sm:p-3 space-y-1.5 max-h-[60vh] overflow-y-auto">
            {(() => {
              const listEvents = weekDays.flatMap((day) => getEventsForDate(day).map((e: any) => ({ ...e, _day: day })));
              listEvents.sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
              if (listEvents.length === 0) {
                return (
                  <div className="text-center py-8">
                    <CalendarIcon className="w-10 h-10 mx-auto mb-2 text-muted-foreground/50" />
                    <p className="text-muted-foreground text-sm">На эту неделю события не запланированы</p>
                  </div>
                );
              }
              return listEvents.map((event: any) => (
                <Card key={event.id} className={cn("rounded-xl border border-border shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer overflow-hidden backdrop-blur-sm", getEventCardClasses(event))} onClick={() => { setSelectedEvent(event); setIsDetailOpen(true); }}>
                  <CardHeader className="pb-1.5 p-2.5 sm:p-3">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-sm sm:text-base break-words">{event.title}</CardTitle>
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-3 mt-1 text-xs opacity-90">
                          <div className="flex items-center">
                            <Clock className="w-3 h-3 sm:w-4 sm:h-4 mr-1 shrink-0" />
                            {format(new Date(event.startTime), "HH:mm")} – {format(new Date(event.endTime), "HH:mm")}
                            <span className="ml-1">· {format(event._day, "EEE d", { locale: ru })}</span>
                          </div>
                          {event.location && (
                            <div className="flex items-center">
                              <MapPin className="w-3 h-3 sm:w-4 sm:h-4 mr-1 shrink-0" />
                              <span className="break-words">{event.location}</span>
                            </div>
                          )}
                          {event.participants && event.participants.length > 0 && (
                            <div className="flex items-center">
                              <Users className="w-3 h-3 sm:w-4 sm:h-4 mr-1 shrink-0" />
                              {event.participants.length} участников
                            </div>
                          )}
                        </div>
                      </div>
                      <Badge className={cn("shrink-0", getEventBadgeClasses(event), "text-xs sm:text-sm")}>
                        {getEventTypeText(event.type)}
                      </Badge>
                    </div>
                  </CardHeader>
                  {event.description && (
                    <CardContent className="p-2.5 sm:p-3 pt-0">
                      <p className="text-xs opacity-90 break-words">{event.description}</p>
                    </CardContent>
                  )}
                </Card>
              ));
            })()}
          </div>
        </div>
      ) : (
        /* Day View — те же карточки что в Список */
        <div className="space-y-2">
          <Card className="rounded-xl border border-border">
            <CardHeader className="p-2.5 sm:p-4">
              <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
                <div className="flex items-center gap-1.5 text-sm sm:text-base">
                  <CalendarIcon className="w-4 h-4 text-primary shrink-0" />
                  <span className="truncate">{format(selectedDate, "d MMMM yyyy, EEEE", { locale: ru })}</span>
                </div>
                <div className="flex flex-wrap gap-1 w-full sm:w-auto min-w-0">
                  <Button variant="outline" size="sm" className="flex-1 min-w-0 sm:flex-initial text-xs px-2 rounded-lg border-border" onClick={() => setSelectedDate(new Date(selectedDate.getTime() - 86400000))}>← Вчера</Button>
                  <Button variant="outline" size="sm" className="flex-1 min-w-0 sm:flex-initial text-xs px-2 rounded-lg border-border" onClick={() => setSelectedDate(new Date())}>Сегодня</Button>
                  <Button variant="outline" size="sm" className="flex-1 min-w-0 sm:flex-initial text-xs px-2 rounded-lg border-border" onClick={() => setSelectedDate(new Date(selectedDate.getTime() + 86400000))}>Завтра →</Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2.5 sm:p-4 pt-0">
              <div className="space-y-1.5">
                {getEventsForDate(selectedDate).length === 0 ? (
                  <div className="text-center py-6">
                    <CalendarIcon className="w-10 h-10 mx-auto mb-2 text-muted-foreground/50" />
                    <p className="text-muted-foreground text-sm">На этот день события не запланированы</p>
                  </div>
                ) : (
                  getEventsForDate(selectedDate).map((event: any) => (
                    <Card key={event.id} className={cn("rounded-xl border border-border shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer overflow-hidden backdrop-blur-sm", getEventCardClasses(event))} onClick={() => { setSelectedEvent(event); setIsDetailOpen(true); }}>
                      <CardHeader className="pb-1.5 p-2.5 sm:p-3">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-sm sm:text-base break-words">{event.title}</CardTitle>
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-3 mt-1 text-xs opacity-90">
                              <div className="flex items-center">
                                <Clock className="w-3 h-3 sm:w-4 sm:h-4 mr-1 shrink-0" />
                                {format(new Date(event.startTime), "HH:mm")} – {format(new Date(event.endTime), "HH:mm")}
                              </div>
                              {event.location && (
                                <div className="flex items-center">
                                  <MapPin className="w-3 h-3 sm:w-4 sm:h-4 mr-1 shrink-0" />
                                  <span className="break-words">{event.location}</span>
                                </div>
                              )}
                              {event.participants && event.participants.length > 0 && (
                                <div className="flex items-center">
                                  <Users className="w-3 h-3 sm:w-4 sm:h-4 mr-1 shrink-0" />
                                  {event.participants.length} участников
                                </div>
                              )}
                            </div>
                          </div>
                          <Badge className={cn("shrink-0", getEventBadgeClasses(event), "text-xs sm:text-sm")}>
                            {getEventTypeText(event.type)}
                          </Badge>
                        </div>
                      </CardHeader>
                      {event.description && (
                        <CardContent className="p-2.5 sm:p-3 pt-0">
                          <p className="text-xs opacity-90 break-words">{event.description}</p>
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

      {/* Детальная карточка события (как в референсе) */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl border-border bg-card p-0 overflow-hidden gap-0">
          {selectedEvent && (
            <div className="p-4 sm:p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className={cn("w-3 h-3 rounded-full shrink-0 mt-1", getEventDotClass(selectedEvent))} />
                <h3 className="text-lg font-semibold text-foreground leading-tight break-words pr-6">
                  {selectedEvent.title}
                </h3>
              </div>
              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <CalendarIcon className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
                  <span className="text-foreground">
                    {format(new Date(selectedEvent.startTime), "EEEE, d MMMM", { locale: ru })};
                    {" "}
                    {format(new Date(selectedEvent.startTime), "HH:mm")}–{format(new Date(selectedEvent.endTime), "HH:mm")}
                  </span>
                </div>
                {selectedEvent.location && (
                  <div className="flex items-start gap-3">
                    <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
                    <span className="text-foreground">{selectedEvent.location}</span>
                  </div>
                )}
                {selectedEvent.description && (
                  <div className="flex items-start gap-3">
                    <Users className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
                    <p className="text-foreground break-words">{selectedEvent.description}</p>
                  </div>
                )}
                {selectedEvent.participants && selectedEvent.participants.length > 0 && (
                  <div className="flex items-start gap-3">
                    <Users className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <p className="text-foreground font-medium text-sm">Участники</p>
                      <ul className="space-y-1">
                        {selectedEvent.participants.map((p: any) => {
                          const currentUserId = AuthService.getCurrentUser()?.id;
                          const isMe = currentUserId && p.userId === currentUserId;
                          const isInvited = p.status === "invited";
                          return (
                            <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                              <span className="text-foreground truncate">{p.userName ?? "?"}</span>
                              <span className={cn(
                                "shrink-0 text-xs",
                                p.status === "accepted" && "text-green-600 dark:text-green-400",
                                p.status === "declined" && "text-rose-600 dark:text-rose-400",
                                p.status === "invited" && "text-muted-foreground"
                              )}>
                                {p.status === "accepted" && "Принято"}
                                {p.status === "declined" && "Отклонено"}
                                {p.status === "invited" && (isMe ? "Приглашение" : "Ожидает")}
                              </span>
                              {isMe && isInvited && (
                                <span className="flex items-center gap-0.5 shrink-0">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-500/10"
                                    onClick={() => respondParticipantMutation.mutate({ eventId: selectedEvent.id, participantId: p.id, status: "accepted" })}
                                    disabled={respondParticipantMutation.isPending}
                                  >
                                    <Check className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-500/10"
                                    onClick={() => respondParticipantMutation.mutate({ eventId: selectedEvent.id, participantId: p.id, status: "declined" })}
                                    disabled={respondParticipantMutation.isPending}
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <Badge className={cn(getEventBadgeClasses(selectedEvent), "text-xs")}>
                    {getEventTypeText(selectedEvent.type)}
                  </Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    setIsDetailOpen(false);
                    setIsFormOpen(true);
                  }}
                >
                  <Edit className="w-4 h-4" />
                  Редактировать
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="gap-2"
                  onClick={() => {
                    if (confirm("Удалить это событие?")) {
                      deleteEventMutation.mutate(selectedEvent.id);
                    }
                  }}
                  disabled={deleteEventMutation.isPending}
                >
                  <Trash2 className="w-4 h-4" />
                  Удалить
                </Button>
                <Button variant="outline" size="sm" onClick={() => setIsDetailOpen(false)}>
                  Закрыть
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <EventForm
        key={draftSlot ? "draft-slot" : selectedEvent?.id ?? "edit"}
        isOpen={isFormOpen}
        onClose={() => {
          setDraftSlot(null);
          setIsFormOpen(false);
        }}
        event={draftSlot ? { startTime: draftSlot.startTime, endTime: draftSlot.endTime } : selectedEvent}
      />
    </div>
  );
}
