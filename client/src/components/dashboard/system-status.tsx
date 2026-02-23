import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Server, Wifi, WifiOff } from "lucide-react";

interface SystemStatusProps {
  systems?: any[];
}

export default function SystemStatus({ systems }: SystemStatusProps) {
  const onlineCount = systems?.filter(s => s.status === 'online').length || 0;
  const totalCount = systems?.length || 0;

  return (
    <Card className="bg-card/80 dark:bg-card/90 backdrop-blur-sm border border-border rounded-xl border-l-4 border-l-emerald-500/60">
      <CardHeader className="py-2.5 px-3 sm:px-4 pb-1.5">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
            <Server className="w-3.5 h-3.5" />
            Серверы
          </CardTitle>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {onlineCount}/{totalCount} онл.
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-3 sm:px-4 pb-3 pt-0">
        <div className="space-y-1.5">
          {systems?.slice(0, 5).map((system) => (
            <div 
              key={system.id} 
              className="flex items-center justify-between p-1.5 rounded-md bg-slate-50 dark:bg-slate-900/50"
              data-testid={`system-${system.id}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className={`
                  w-6 h-6 shrink-0 rounded flex items-center justify-center
                  ${system.status === 'online' 
                    ? 'bg-emerald-500/10 dark:bg-emerald-500/20' 
                    : 'bg-red-500/10 dark:bg-red-500/20'
                  }
                `}>
                  {system.status === 'online' 
                    ? <Wifi className="w-3 h-3 text-emerald-500" />
                    : <WifiOff className="w-3 h-3 text-red-500" />
                  }
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-medium text-slate-900 dark:text-white truncate block">{system.name}</span>
                  {system.ipAddress && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-500 truncate">{system.ipAddress}</p>
                  )}
                </div>
              </div>
              <div className={`
                px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0
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
            <div className="text-center py-3 text-slate-500 dark:text-slate-400">
              <Server className="w-6 h-6 mx-auto mb-1 opacity-50" />
              <p className="text-xs">Нет данных о серверах</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
