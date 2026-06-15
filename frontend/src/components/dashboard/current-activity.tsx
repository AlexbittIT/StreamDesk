import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Video, Camera, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

interface CurrentActivityProps {
  streams?: any[];
  events?: any[];
}

export default function CurrentActivity({ streams, events }: CurrentActivityProps) {
  const activeStreams = streams?.filter(stream => stream.status === "live") || [];
  const upcomingEvents = events?.filter(event => {
    const eventTime = new Date(event.startTime);
    const now = new Date();
    const in2Hours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    return eventTime > now && eventTime <= in2Hours;
  }) || [];

  const activities = [
    ...activeStreams.map(stream => ({
      ...stream,
      type: 'stream',
      icon: Video,
      status: 'В эфире',
      duration: stream.startTime ? `${Math.floor((Date.now() - new Date(stream.startTime).getTime()) / (1000 * 60))}м` : null
    })),
    ...upcomingEvents.map(event => ({
      ...event,
      type: 'event',
      icon: Camera,
      status: 'Подготовка',
      timeLeft: `через ${Math.floor((new Date(event.startTime).getTime() - Date.now()) / (1000 * 60))} мин`
    }))
  ];

  return (
    <Card className="bg-card/80 dark:bg-card/90 backdrop-blur-sm border border-border rounded-xl overflow-hidden min-w-0 border-l-4 border-l-red-500/70">
      <CardHeader className="py-2 px-3 sm:px-3 pb-1">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shrink-0" />
          <CardTitle className="text-sm font-semibold text-foreground">Текущая активность</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-0 sm:px-0 pb-0 pt-0">
        {activities.length === 0 ? (
          <div className="text-center py-4">
            <Radio className="w-8 h-8 mx-auto mb-1.5 text-slate-300 dark:text-slate-600" />
            <p className="text-xs text-slate-500 dark:text-slate-400">Нет активных трансляций</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Запланированные события появятся здесь</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {activities.map((activity, index) => {
              const Icon = activity.icon;
              const isStream = activity.type === 'stream';
              return (
                <div
                  key={index}
                  className={cn(
                    "flex items-center justify-between rounded-r-xl overflow-hidden bg-card/70 dark:bg-card/80 backdrop-blur-sm border border-border min-w-0 border-l-4",
                    isStream ? "border-l-red-500/70" : "border-l-amber-500/70"
                  )}
                  data-testid={`activity-${index}`}
                >
                  <div className={`flex items-center gap-3 p-3 w-full`}>
                    <div className={`flex items-center justify-center w-12 h-12 rounded-lg shadow ${isStream ? 'bg-gradient-to-br from-red-500 to-pink-500' : 'bg-gradient-to-br from-amber-400 to-orange-400'}`}>
                      <Icon className="text-white w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white truncate">{activity.title}</p>
                      <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {activity.location} • {isStream ? 'В эфире' : `Начало в ${new Date(activity.startTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`}
                      </p>
                    </div>
                    <div className="text-right flex flex-col items-end justify-center gap-0.5">
                      <span className={`text-sm font-semibold ${isStream ? 'text-red-500' : 'text-amber-500'}`}>{activity.status}</span>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{activity.duration || activity.timeLeft}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
