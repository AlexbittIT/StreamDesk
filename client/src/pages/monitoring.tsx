import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Monitor, Server, Wifi, Activity, AlertTriangle, CheckCircle } from "lucide-react";
import { useWebSocket } from "@/hooks/use-websocket";

export default function Monitoring() {
  const { data: systems, isLoading } = useQuery({
    queryKey: ["/api/systems"],
  });

  const { data: streams } = useQuery({
    queryKey: ["/api/streams", "active=true"],
  });

  // Connect to WebSocket for real-time updates
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
      case "online": return "bg-green-100 text-green-800";
      case "offline": return "bg-red-100 text-red-800";
      case "maintenance": return "bg-yellow-100 text-yellow-800";
      default: return "bg-gray-100 text-gray-800";
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
    return <div>Loading monitoring data...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-gray-900">Мониторинг системы</h2>
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span className="text-sm text-gray-600">
            {isConnected ? 'Подключено' : 'Не подключено'}
          </span>
        </div>
      </div>

      {/* System Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Всего систем</p>
                <p className="text-3xl font-bold text-gray-900">{systemsStats.total}</p>
              </div>
              <Monitor className="w-12 h-12 text-gray-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Онлайн</p>
                <p className="text-3xl font-bold text-green-600">{systemsStats.online}</p>
              </div>
              <CheckCircle className="w-12 h-12 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Офлайн</p>
                <p className="text-3xl font-bold text-red-600">{systemsStats.offline}</p>
              </div>
              <AlertTriangle className="w-12 h-12 text-red-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Доступность</p>
                <p className="text-3xl font-bold text-blue-600">{systemsStats.uptime}%</p>
              </div>
              <Activity className="w-12 h-12 text-blue-400" />
            </div>
            <div className="mt-4">
              <Progress value={systemsStats.uptime} className="h-2" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Systems Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Online Systems */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-green-700">
              <CheckCircle className="w-5 h-5 mr-2" />
              Онлайн системы ({onlineSystems.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {onlineSystems.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Нет онлайн систем</p>
              ) : (
                onlineSystems.map((system: any) => (
                  <div key={system.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="text-green-600">
                        {getSystemTypeIcon(system.type)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{system.name}</p>
                        <p className="text-sm text-gray-600">{system.location}</p>
                        {system.ipAddress && (
                          <p className="text-xs text-gray-500">{system.ipAddress}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge className={getStatusColor(system.status)}>
                        {getStatusText(system.status)}
                      </Badge>
                      {system.lastPing && (
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(system.lastPing).toLocaleTimeString('ru-RU')}
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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-red-700">
              <AlertTriangle className="w-5 h-5 mr-2" />
              Проблемные системы ({offlineSystems.length + maintenanceSystems.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {offlineSystems.length === 0 && maintenanceSystems.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Все системы работают нормально</p>
              ) : (
                <>
                  {offlineSystems.map((system: any) => (
                    <div key={system.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="text-red-600">
                          {getSystemTypeIcon(system.type)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{system.name}</p>
                          <p className="text-sm text-gray-600">{system.location}</p>
                          {system.ipAddress && (
                            <p className="text-xs text-gray-500">{system.ipAddress}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge className={getStatusColor(system.status)}>
                          {getStatusText(system.status)}
                        </Badge>
                        {system.lastPing && (
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(system.lastPing).toLocaleTimeString('ru-RU')}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                  {maintenanceSystems.map((system: any) => (
                    <div key={system.id} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="text-yellow-600">
                          {getSystemTypeIcon(system.type)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{system.name}</p>
                          <p className="text-sm text-gray-600">{system.location}</p>
                          {system.ipAddress && (
                            <p className="text-xs text-gray-500">{system.ipAddress}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge className={getStatusColor(system.status)}>
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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Activity className="w-5 h-5 mr-2" />
              Активные стримы ({streams.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {streams.map((stream: any) => (
                <div key={stream.id} className="p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-900">{stream.title}</h3>
                    <Badge className="bg-green-100 text-green-800">Живой эфир</Badge>
                  </div>
                  <div className="space-y-2 text-sm text-gray-600">
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
