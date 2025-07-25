import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Youtube } from "lucide-react";
import { SiVk } from "react-icons/si";

export default function StreamingStats() {
  const { data: youtubeStats } = useQuery({
    queryKey: ["/api/integrations/youtube/stats"],
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  const { data: vkStats } = useQuery({
    queryKey: ["/api/integrations/vk/stats"],
    refetchInterval: 10000,
  });

  const totalViewers = (youtubeStats?.viewers || 0) + (vkStats?.viewers || 0);
  const avgBitrate = Math.round(((youtubeStats?.bitrate || 0) + (vkStats?.bitrate || 0)) / 2 / 1000 * 10) / 10;

  return (
    <Card className="card-shadow">
      <CardHeader>
        <CardTitle>Статистика стримов</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* YouTube Stats */}
          {youtubeStats && (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                  <Youtube className="text-red-600 h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">YouTube</p>
                  <p className="text-xs text-gray-500">{youtubeStats.viewers?.toLocaleString()} зрителей</p>
                </div>
              </div>
              <div className="text-right">
                <div className="w-2 h-2 bg-green-500 rounded-full status-online mb-1"></div>
                <p className="text-xs text-gray-500">{youtubeStats.duration || "1ч 25м"}</p>
              </div>
            </div>
          )}

          {/* VK Stats */}
          {vkStats && (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <SiVk className="text-blue-600 h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">ВКонтакте</p>
                  <p className="text-xs text-gray-500">{vkStats.viewers?.toLocaleString()} зрителей</p>
                </div>
              </div>
              <div className="text-right">
                <div className="w-2 h-2 bg-green-500 rounded-full status-online mb-1"></div>
                <p className="text-xs text-gray-500">{vkStats.duration || "1ч 25м"}</p>
              </div>
            </div>
          )}

          {/* Total Stats */}
          {(youtubeStats || vkStats) && (
            <div className="pt-3 border-t border-gray-100">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Общие просмотры</span>
                <span className="text-sm font-semibold text-gray-900">{totalViewers.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center mt-1">
                <span className="text-sm text-gray-600">Средний битрейт</span>
                <span className="text-sm font-semibold text-gray-900">{avgBitrate} Mbps</span>
              </div>
            </div>
          )}

          {/* No active streams */}
          {!youtubeStats && !vkStats && (
            <div className="text-center py-8 text-gray-500">
              <Youtube className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>Нет активных стримов</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
