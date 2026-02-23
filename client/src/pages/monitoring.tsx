import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Monitor, Server, Wifi, Activity, AlertTriangle, CheckCircle, RefreshCw, TrendingUp } from "lucide-react";
import { useWebSocket } from "@/hooks/use-websocket";
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

export default function Monitoring() {
  const { data: systems, isLoading, refetch } = useQuery({
    queryKey: ["/api/systems"],
    refetchInterval: 30000, // Автоматическое обновление каждые 30 секунд
  });

  const { data: streams } = useQuery({
    queryKey: ["/api/streams", "active=true"],
    refetchInterval: 60000,
  });

  // Connect to WebSocket for real-time updates (опционально)
  // WebSocket не критичен - приложение должно работать без него
  const { isConnected } = useWebSocket();

  const onlineSystems = systems?.filter((system: any) => system.status === "online") || [];
  const offlineSystems = systems?.filter((system: any) => system.status === "offline") || [];
  const maintenanceSystems = systems?.filter((system: any) => system.status === "maintenance") || [];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "online": return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "offline": return <AlertTriangle className="w-4 h-4 text-red-600" />;
      case "maintenance": return <Activity className="w-4 h-4 text-yellow-600" />;
      default: return <Monitor className="w-4 h-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "online": return "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300";
      case "offline": return "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300";
      case "maintenance": return "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "online": return "Онлайн";
      case "offline": return "Офлайн";
      case "maintenance": return "Обслуживание";
      default: return status;
    }
  };

  const getSystemTypeIcon = (type: string) => {
    switch (type) {
      case "server": return <Server className="w-6 h-6" />;
      case "computer": return <Monitor className="w-6 h-6" />;
      case "network": return <Wifi className="w-6 h-6" />;
      default: return <Monitor className="w-6 h-6" />;
    }
  };

  const systemsStats = {
    total: systems?.length || 0,
    online: onlineSystems.length,
    offline: offlineSystems.length,
    maintenance: maintenanceSystems.length,
    uptime: systems?.length ? Math.round((onlineSystems.length / systems.length) * 100) : 0,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Загрузка данных мониторинга...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 w-full min-w-0 max-w-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Отслеживание состояния всех систем в реальном времени
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full shrink-0 ${isConnected ? 'bg-green-500' : 'bg-muted-foreground/50'}`} title={isConnected ? 'Обновления в реальном времени' : 'WebSocket не подключён (запустите сервер с WS)'}></div>
            <span className="text-sm text-muted-foreground">
              {isConnected ? 'Обновления в реальном времени' : 'Обновление по кнопке'}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetch();
              queryClient.invalidateQueries({ queryKey: ["/api/systems"] });
            }}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Обновить
          </Button>
        </div>
      </div>

      {/* System Overview — плитки с иконками и акцентами */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <Card className="rounded-2xl border-border shadow-sm overflow-hidden">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Всего систем</p>
                <p className="text-2xl sm:text-3xl font-bold text-foreground mt-1">{systemsStats.total}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                <Monitor className="w-6 h-6 text-slate-600 dark:text-slate-300" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-green-200 dark:border-green-900/50 shadow-sm overflow-hidden">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Онлайн</p>
                <p className="text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-400 mt-1">{systemsStats.online}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/40 flex items-center justify-center shrink-0">
                <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-red-200 dark:border-red-900/50 shadow-sm overflow-hidden">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Офлайн</p>
                <p className="text-2xl sm:text-3xl font-bold text-red-600 dark:text-red-400 mt-1">{systemsStats.offline}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-blue-200 dark:border-blue-900/50 shadow-sm overflow-hidden">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-muted-foreground">Доступность</p>
                <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400 mt-1">{systemsStats.uptime}%</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                <TrendingUp className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <div className="mt-4">
              <Progress value={systemsStats.uptime} className="h-2 rounded-full" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Systems Grid — современные карточки */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Online Systems */}
        <Card className="rounded-2xl border border-border shadow-sm overflow-hidden bg-card/50 dark:bg-card/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg text-foreground">
              <span className="w-9 h-9 rounded-xl bg-green-500/15 dark:bg-green-500/20 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
              </span>
              Онлайн системы ({onlineSystems.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {onlineSystems.length === 0 ? (
                <p className="text-muted-foreground text-center py-6 rounded-xl bg-muted/30">Нет онлайн систем</p>
              ) : (
                onlineSystems.map((system: any) => (
                  <div
                    key={system.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl border border-green-200/60 dark:border-green-800/40 bg-green-50/80 dark:bg-green-950/30 hover:bg-green-50 dark:hover:bg-green-950/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/40 flex items-center justify-center shrink-0 text-green-600 dark:text-green-400">
                        {getSystemTypeIcon(system.type)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{system.name}</p>
                        <p className="text-sm text-muted-foreground truncate">{system.location}</p>
                        {system.ipAddress && (
                          <p className="text-xs text-muted-foreground/80 font-mono">{system.ipAddress}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge className={cn("rounded-lg font-medium", getStatusColor(system.status))}>
                        {getStatusText(system.status)}
                      </Badge>
                      {system.lastPing && (
                        <p className="text-xs text-muted-foreground mt-1.5">
                          {new Date(system.lastPing).toLocaleTimeString("ru-RU")}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Offline/Problem Systems */}
        <Card className="rounded-2xl border border-border shadow-sm overflow-hidden bg-card/50 dark:bg-card/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg text-foreground">
              <span className="w-9 h-9 rounded-xl bg-amber-500/15 dark:bg-amber-500/20 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </span>
              Проблемные системы ({offlineSystems.length + maintenanceSystems.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {offlineSystems.length === 0 && maintenanceSystems.length === 0 ? (
                <p className="text-muted-foreground text-center py-6 rounded-xl bg-muted/30">Все системы работают нормально</p>
              ) : (
                <>
                  {offlineSystems.map((system: any) => (
                    <div
                      key={system.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl border border-red-200/60 dark:border-red-800/40 bg-red-50/80 dark:bg-red-950/30 hover:bg-red-50/100 dark:hover:bg-red-950/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0 text-red-600 dark:text-red-400">
                          {getSystemTypeIcon(system.type)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{system.name}</p>
                          <p className="text-sm text-muted-foreground truncate">{system.location}</p>
                          {system.ipAddress && (
                            <p className="text-xs text-muted-foreground/80 font-mono">{system.ipAddress}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <Badge className={cn("rounded-lg font-medium", getStatusColor(system.status))}>
                          {getStatusText(system.status)}
                        </Badge>
                        {system.lastPing && (
                          <p className="text-xs text-muted-foreground mt-1.5">
                            {new Date(system.lastPing).toLocaleTimeString("ru-RU")}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                  {maintenanceSystems.map((system: any) => (
                    <div
                      key={system.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl border border-amber-200/60 dark:border-amber-800/40 bg-amber-50/80 dark:bg-amber-950/30 hover:bg-amber-50/100 dark:hover:bg-amber-950/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0 text-amber-600 dark:text-amber-400">
                          {getSystemTypeIcon(system.type)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{system.name}</p>
                          <p className="text-sm text-muted-foreground truncate">{system.location}</p>
                          {system.ipAddress && (
                            <p className="text-xs text-muted-foreground/80 font-mono">{system.ipAddress}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <Badge className={cn("rounded-lg font-medium", getStatusColor(system.status))}>
                          {getStatusText(system.status)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Streams Monitoring */}
      {streams && streams.length > 0 && (
        <Card className="rounded-2xl border border-border shadow-sm overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Activity className="w-4 h-4 text-primary" />
              </span>
              Активные стримы ({streams.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {streams.map((stream: any) => (
                <div key={stream.id} className="p-4 rounded-xl border border-border bg-card/50">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-foreground truncate">{stream.title}</h3>
                    <Badge className="rounded-lg bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300 shrink-0">Живой эфир</Badge>
                  </div>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Платформа:</span>
                      <span className="font-medium">{stream.platform}</span>
                    </div>
                    {stream.bitrate && (
                      <div className="flex justify-between">
                        <span>Битрейт:</span>
                        <span className="font-medium">{stream.bitrate} kbps</span>
                      </div>
                    )}
                    {stream.fps && (
                      <div className="flex justify-between">
                        <span>FPS:</span>
                        <span className="font-medium">{stream.fps}</span>
                      </div>
                    )}
                    {stream.viewerCount !== null && (
                      <div className="flex justify-between">
                        <span>Зрители:</span>
                        <span className="font-medium">{stream.viewerCount}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
