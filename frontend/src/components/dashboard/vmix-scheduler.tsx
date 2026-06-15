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

function cp1251Byte(char: string): number {
  const code = char.charCodeAt(0);
  if (code >= 0x410 && code <= 0x44f) return code - 0x350;
  const extra: Record<number, number> = {
    0x401: 0xa8, 0x451: 0xb8, 0x402: 0x80, 0x403: 0x81, 0x201a: 0x82, 0x453: 0x83,
    0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x20ac: 0x88, 0x2030: 0x89,
    0x409: 0x8a, 0x2039: 0x8b, 0x40a: 0x8c, 0x40c: 0x8d, 0x40b: 0x8e, 0x40f: 0x8f,
    0x452: 0x90, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95,
    0x2013: 0x96, 0x2014: 0x97, 0x2122: 0x99, 0x459: 0x9a, 0x203a: 0x9b, 0x45a: 0x9c,
    0x45c: 0x9d, 0x45b: 0x9e, 0x45f: 0x9f, 0xa0: 0xa0, 0x40e: 0xa1, 0x45e: 0xa2,
    0x408: 0xa3, 0xa4: 0xa4, 0x490: 0xa5, 0xa6: 0xa6, 0xa7: 0xa7, 0xa9: 0xa9,
    0x404: 0xaa, 0xab: 0xab, 0xac: 0xac, 0xad: 0xad, 0xae: 0xae, 0x407: 0xaf,
    0xb0: 0xb0, 0xb1: 0xb1, 0x406: 0xb2, 0x456: 0xb3, 0x491: 0xb4, 0xb5: 0xb5,
    0xb6: 0xb6, 0xb7: 0xb7, 0x454: 0xba, 0xbb: 0xbb, 0x458: 0xbc, 0x405: 0xbd,
    0x455: 0xbe, 0x457: 0xbf,
  };
  return extra[code] ?? code;
}

function fixMojibake(value: string) {
  if (!/[\u0420\u0421][\u0400-\u04ff]|\u0432\u0402|\u0412\u00b7/.test(value)) return value;
  try {
    const bytes = Uint8Array.from(Array.from(value).map(cp1251Byte));
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return decoded.includes("\ufffd") ? value : decoded;
  } catch {
    return value;
  }
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
    <Card className="bg-card border-border rounded-xl overflow-hidden min-w-0">
      <CardHeader className="py-2 px-3 sm:px-3 pb-1">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
            <Video className="w-4 h-4 text-primary" />
            vMix Scheduler
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {data?.connected ? (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800 text-[10px] py-0 px-1.5">
                <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
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
      <CardContent className="px-3 pb-2.5 pt-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <RefreshCw className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="space-y-1.5">
            {data?.nextEvent && (
              <div className="p-1.5 bg-primary/5 dark:bg-primary/10 rounded-lg border border-primary/20">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-primary font-medium mb-0.5">Следующий эфир</div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{fixMojibake(data.nextEvent.title)}</div>
                    <div className="flex items-center gap-1 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <Clock className="w-3 h-3 shrink-0" />
                      {formatEventDate(data.nextEvent.startTime)}
                    </div>
                  </div>
                  <Badge className={`flex-shrink-0 text-[10px] py-0 px-1.5 ${getEventStatusColor(data.nextEvent.status)}`}>
                    {getEventStatusText(data.nextEvent.status)}
                  </Badge>
                </div>
              </div>
            )}

            {data?.events && data.events.length > 0 ? (
              <div className="space-y-1.5">
                <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase">
                  Расписание
                </div>
                {data.events.slice(0, 4).map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-700 last:border-0"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                        <Calendar className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-900 dark:text-white truncate">{fixMojibake(event.title)}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">{formatEventDate(event.startTime)}</div>
                      </div>
                    </div>
                    <Badge className={`flex-shrink-0 text-[10px] py-0 px-1.5 ${getEventStatusColor(event.status)}`}>
                      {getEventStatusText(event.status)}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-3 text-slate-500 dark:text-slate-400">
                <Calendar className="w-6 h-6 mx-auto mb-1 text-slate-300 dark:text-slate-600" />
                <p className="text-xs">Нет запланированных трансляций</p>
              </div>
            )}

            {data?.lastSync && (
              <div className="pt-1.5 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-[10px]">
                <span className="text-slate-400 dark:text-slate-500">
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
