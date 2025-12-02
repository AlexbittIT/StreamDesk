import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Server, Wifi, WifiOff } from "lucide-react";

interface SystemStatusProps {
  systems?: any[];
}

export default function SystemStatus({ systems }: SystemStatusProps) {
  const onlineCount = systems?.filter(s => s.status === 'online').length || 0;
  const totalCount = systems?.length || 0;

  return (
    <Card className="bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
            <Server className="w-4 h-4" />
            Серверы
          </CardTitle>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {onlineCount}/{totalCount} онлайн
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {systems?.slice(0, 5).map((system) => (
            <div 
              key={system.id} 
              className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50"
              data-testid={`system-${system.id}`}
            >
              <div className="flex items-center gap-3">
                <div className={`
                  w-8 h-8 rounded-lg flex items-center justify-center
                  ${system.status === 'online' 
                    ? 'bg-emerald-500/10 dark:bg-emerald-500/20' 
                    : 'bg-red-500/10 dark:bg-red-500/20'
                  }
                `}>
                  {system.status === 'online' 
                    ? <Wifi className="w-4 h-4 text-emerald-500" />
                    : <WifiOff className="w-4 h-4 text-red-500" />
                  }
                </div>
                <div>
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{system.name}</span>
                  {system.ipAddress && (
                    <p className="text-xs text-slate-500 dark:text-slate-500">{system.ipAddress}</p>
                  )}
                </div>
              </div>
              <div className={`
                px-2 py-1 rounded text-xs font-medium
                ${system.status === 'online' 
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' 
                  : 'bg-red-500/10 text-red-600 dark:text-red-400'
                }
              `}>
                {system.status === 'online' ? 'Online' : 'Offline'}
              </div>
            </div>
          ))}
          {(!systems || systems.length === 0) && (
            <div className="text-center py-4 text-slate-500 dark:text-slate-400">
              <Server className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Нет данных о серверах</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
