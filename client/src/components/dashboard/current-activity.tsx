import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Video, Camera } from "lucide-react";

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
      statusColor: 'text-green-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-500',
      duration: stream.startTime ? `${Math.floor((Date.now() - new Date(stream.startTime).getTime()) / (1000 * 60))}м` : null
    })),
    ...upcomingEvents.map(event => ({
      ...event,
      type: 'event',
      icon: Camera,
      status: 'Подготовка',
      statusColor: 'text-orange-600',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-500',
      timeLeft: `через ${Math.floor((new Date(event.startTime).getTime() - Date.now()) / (1000 * 60))} мин`
    }))
  ];

  return (
    <Card className="card-shadow">
      <CardHeader>
        <CardTitle>Текущая активность</CardTitle>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Video className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>Нет текущей активности</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activities.map((activity, index) => {
              const Icon = activity.icon;
              return (
                <div
                  key={index}
                  className={`flex items-center justify-between p-4 ${activity.bgColor} rounded-lg border-l-4 ${activity.borderColor}`}
                >
                  <div className="flex items-center space-x-4">
                    <div className={`w-10 h-10 ${activity.type === 'stream' ? 'bg-blue-500' : 'bg-orange-500'} rounded-lg flex items-center justify-center`}>
                      <Icon className="text-white h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{activity.title}</p>
                      <p className="text-sm text-gray-600">
                        {activity.location} • {activity.type === 'stream' ? 'В эфире' : `Начало в ${new Date(activity.startTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center space-x-2">
                      <div className={`w-2 h-2 ${activity.type === 'stream' ? 'bg-green-500 status-online' : 'bg-orange-500'} rounded-full`}></div>
                      <span className={`text-sm ${activity.statusColor}`}>{activity.status}</span>
                    </div>
                    <p className="text-xs text-gray-500">
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
