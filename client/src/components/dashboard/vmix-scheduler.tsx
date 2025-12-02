import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Clock, Video, RefreshCw, ExternalLink, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, parseISO, isPast, isToday, isTomorrow } from "date-fns";
import { ru } from "date-fns/locale";

interface VmixEvent {
  id: string;
  title: string;
  startTime: string;
  endTime?: string;
  status: "scheduled" | "live" | "completed" | "error";
  preset?: string;
  channel?: string;
}

interface VmixSchedulerData {
  connected: boolean;
  events: VmixEvent[];
  lastSync?: string;
  nextEvent?: VmixEvent;
}

export default function VmixScheduler() {
  const { data, isLoading, refetch, isRefetching } = useQuery<VmixSchedulerData>({
    queryKey: ["/api/integrations/vmix/scheduler"],
    refetchInterval: 60000,
  });

  const getEventStatusColor = (status: string) => {
    switch (status) {
      case "live": return "bg-red-500 text-white animate-pulse";
      case "scheduled": return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
      case "completed": return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
      case "error": return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
      default: return "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300";
    }
  };

  const getEventStatusText = (status: string) => {
    switch (status) {
      case "live": return "В эфире";
      case "scheduled": return "Запланировано";
      case "completed": return "Завершено";
      case "error": return "Ошибка";
      default: return status;
    }
  };

  const formatEventDate = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      if (isToday(date)) {
        return `Сегодня, ${format(date, "HH:mm")}`;
      } else if (isTomorrow(date)) {
        return `Завтра, ${format(date, "HH:mm")}`;
      } else {
        return format(date, "d MMM, HH:mm", { locale: ru });
      }
    } catch {
      return dateStr;
    }
  };

  return (
    <Card className="bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
            <Video className="w-5 h-5 text-primary" />
            vMix Scheduler
          </CardTitle>
          <div className="flex items-center gap-2">
            {data?.connected ? (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Online
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:border-slate-600">
                <AlertCircle className="w-3 h-3 mr-1" />
                Offline
              </Badge>
            )}
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => refetch()}
              disabled={isRefetching}
              className="h-8 w-8 p-0"
              data-testid="button-refresh-vmix"
            >
              <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="space-y-3">
            {data?.nextEvent && (
              <div className="p-3 bg-primary/5 dark:bg-primary/10 rounded-lg border border-primary/20">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="text-xs text-primary font-medium mb-1">Следующий эфир</div>
                    <div className="font-semibold text-slate-900 dark:text-white">{data.nextEvent.title}</div>
                    <div className="flex items-center gap-2 mt-1 text-sm text-slate-500 dark:text-slate-400">
                      <Clock className="w-3.5 h-3.5" />
                      {formatEventDate(data.nextEvent.startTime)}
                    </div>
                  </div>
                  <Badge className={getEventStatusColor(data.nextEvent.status)}>
                    {getEventStatusText(data.nextEvent.status)}
                  </Badge>
                </div>
              </div>
            )}

            {data?.events && data.events.length > 0 ? (
              <div className="space-y-2">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                  Расписание
                </div>
                {data.events.slice(0, 4).map((event) => (
                  <div 
                    key={event.id} 
                    className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700 last:border-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                        <Calendar className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{event.title}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{formatEventDate(event.startTime)}</div>
                      </div>
                    </div>
                    <Badge className={`flex-shrink-0 ${getEventStatusColor(event.status)}`}>
                      {getEventStatusText(event.status)}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-slate-500 dark:text-slate-400">
                <Calendar className="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                <p className="text-sm">Нет запланированных трансляций</p>
              </div>
            )}

            {data?.lastSync && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  Обновлено: {format(parseISO(data.lastSync), "HH:mm")}
                </span>
                <a 
                  href="https://vmix.rullz.ru" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  Открыть в vMix
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
