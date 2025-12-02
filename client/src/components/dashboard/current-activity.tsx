import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Video, Camera, Radio } from "lucide-react";

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
    <Card className="bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <CardTitle className="text-slate-900 dark:text-white">Текущая активность</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-center py-8">
            <Radio className="w-12 h-12 mx-auto mb-4 text-slate-300 dark:text-slate-600" />
            <p className="text-slate-500 dark:text-slate-400">Нет активных трансляций</p>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Запланированные события появятся здесь</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activities.map((activity, index) => {
              const Icon = activity.icon;
              const isStream = activity.type === 'stream';
              return (
                <div
                  key={index}
                  className={`
                    flex items-center justify-between p-3 rounded-lg
                    ${isStream 
                      ? 'bg-gradient-to-r from-red-500/10 to-transparent dark:from-red-500/20 border-l-4 border-red-500' 
                      : 'bg-gradient-to-r from-amber-500/10 to-transparent dark:from-amber-500/20 border-l-4 border-amber-500'
                    }
                  `}
                  data-testid={`activity-${index}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`
                      w-10 h-10 rounded-lg flex items-center justify-center
                      ${isStream ? 'bg-red-500' : 'bg-amber-500'}
                    `}>
                      <Icon className="text-white h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">{activity.title}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {activity.location} • {isStream ? 'В эфире' : `Начало в ${new Date(activity.startTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${isStream ? 'bg-red-500 animate-pulse' : 'bg-amber-500'}`} />
                      <span className={`text-sm font-medium ${isStream ? 'text-red-500' : 'text-amber-500'}`}>
                        {activity.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {activity.duration || activity.timeLeft}
                    </p>
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
