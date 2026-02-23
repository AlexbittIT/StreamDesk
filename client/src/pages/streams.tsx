import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Video, Users, Activity, TrendingUp, Youtube, Plus } from "lucide-react";
import { SiVk } from "react-icons/si";

export default function Streams() {
  const { data: streams, isLoading: streamsLoading } = useQuery({
    queryKey: ["/api/streams"],
  });

  const { data: activeStreams } = useQuery({
    queryKey: ["/api/streams", "active=true"],
  });

  const { data: youtubeStats } = useQuery({
    queryKey: ["/api/integrations/youtube/stats"],
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const { data: vkStats } = useQuery({
    queryKey: ["/api/integrations/vk/stats"],
    refetchInterval: 30000,
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "live": return "bg-red-100 text-red-800";
      case "preparing": return "bg-yellow-100 text-yellow-800";
      case "ended": return "bg-gray-100 text-gray-800";
      case "offline": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "live": return "В эфире";
      case "preparing": return "Подготовка";
      case "ended": return "Завершен";
      case "offline": return "Офлайн";
      default: return status;
    }
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform.toLowerCase()) {
      case "youtube": return <Youtube className="w-5 h-5 text-red-600" />;
      case "vk": return <SiVk className="w-5 h-5 text-blue-600" />;
      default: return <Video className="w-5 h-5" />;
    }
  };

  const totalViewers = (youtubeStats?.viewers || 0) + (vkStats?.viewers || 0);

  if (streamsLoading) {
    return <div>Loading streams...</div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6 w-full min-w-0 max-w-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div />
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Создать стрим
        </Button>
      </div>

      {/* Live Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Активные стримы</p>
                <p className="text-3xl font-bold text-red-600">{activeStreams?.length || 0}</p>
              </div>
              <Video className="w-12 h-12 text-red-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Общие зрители</p>
                <p className="text-3xl font-bold text-blue-600">{totalViewers.toLocaleString()}</p>
              </div>
              <Users className="w-12 h-12 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">YouTube зрители</p>
                <p className="text-3xl font-bold text-red-600">{youtubeStats?.viewers?.toLocaleString() || '0'}</p>
              </div>
              <Youtube className="w-12 h-12 text-red-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">VK зрители</p>
                <p className="text-3xl font-bold text-blue-600">{vkStats?.viewers?.toLocaleString() || '0'}</p>
              </div>
              <SiVk className="w-12 h-12 text-blue-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Platform Statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* YouTube Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-red-700">
              <Youtube className="w-6 h-6 mr-2" />
              YouTube
            </CardTitle>
          </CardHeader>
          <CardContent>
            {youtubeStats ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Статус:</span>
                  <Badge className="bg-red-100 text-red-800">
                    {youtubeStats.status === 'live' ? 'В эфире' : 'Офлайн'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Зрители:</span>
                  <span className="font-semibold">{youtubeStats.viewers?.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Битрейт:</span>
                  <span className="font-semibold">{youtubeStats.bitrate}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">FPS:</span>
                  <span className="font-semibold">{youtubeStats.fps}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Длительность:</span>
                  <span className="font-semibold">{youtubeStats.duration}</span>
                </div>
                
                {/* Quality indicator */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Качество стрима:</span>
                    <span className="font-semibold text-green-600">Отличное</span>
                  </div>
                  <Progress value={95} className="h-2" />
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Youtube className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>Нет активных стримов на YouTube</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* VK Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-blue-700">
              <SiVk className="w-6 h-6 mr-2" />
              ВКонтакте
            </CardTitle>
          </CardHeader>
          <CardContent>
            {vkStats ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Статус:</span>
                  <Badge className="bg-blue-100 text-blue-800">
                    {vkStats.status === 'live' ? 'В эфире' : 'Офлайн'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Зрители:</span>
                  <span className="font-semibold">{vkStats.viewers?.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Битрейт:</span>
                  <span className="font-semibold">{vkStats.bitrate}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">FPS:</span>
                  <span className="font-semibold">{vkStats.fps}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Длительность:</span>
                  <span className="font-semibold">{vkStats.duration}</span>
                </div>
                
                {/* Quality indicator */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Качество стрима:</span>
                    <span className="font-semibold text-green-600">Отличное</span>
                  </div>
                  <Progress value={92} className="h-2" />
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <SiVk className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>Нет активных стримов ВКонтакте</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* All Streams List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Activity className="w-5 h-5 mr-2" />
            Все стримы
          </CardTitle>
        </CardHeader>
        <CardContent>
          {streams && streams.length > 0 ? (
            <div className="space-y-4">
              {streams.map((stream: any) => (
                <div key={stream.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                      {getPlatformIcon(stream.platform)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{stream.title}</h3>
                      <div className="flex items-center space-x-4 text-sm text-gray-600">
                        <span className="capitalize">{stream.platform}</span>
                        {stream.resolution && <span>{stream.resolution}</span>}
                        {stream.startTime && (
                          <span>{new Date(stream.startTime).toLocaleString('ru-RU')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-4">
                    {stream.viewerCount !== null && (
                      <div className="text-right">
                        <p className="text-sm text-gray-600">Зрители</p>
                        <p className="font-semibold">{stream.viewerCount.toLocaleString()}</p>
                      </div>
                    )}
                    <Badge className={getStatusColor(stream.status)}>
                      {getStatusText(stream.status)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Video className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500">Стримы не найдены</p>
              <Button className="mt-4">
                <Plus className="w-4 h-4 mr-2" />
                Создать первый стрим
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
