import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Youtube } from "lucide-react";
import { SiVk } from "react-icons/si";

interface PlatformStats {
  viewers: number;
  duration: string;
  bitrate?: number;
  status?: string;
}

export default function StreamingStats() {
  const { data: youtubeStats } = useQuery<PlatformStats>({
    queryKey: ["/api/integrations/youtube/stats"],
    refetchInterval: 10000,
  });

  const { data: vkStats } = useQuery<PlatformStats>({
    queryKey: ["/api/integrations/vk/stats"],
    refetchInterval: 10000,
  });

  const totalViewers = (youtubeStats?.viewers || 0) + (vkStats?.viewers || 0);
  const avgBitrate = Math.round(((youtubeStats?.bitrate || 0) + (vkStats?.bitrate || 0)) / 2 / 1000 * 10) / 10;

  return (
    <Card className="bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700">
      <CardHeader>
        <CardTitle className="text-slate-900 dark:text-white">Статистика стримов</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {youtubeStats && (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                  <Youtube className="text-red-600 dark:text-red-400 h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">YouTube</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{youtubeStats.viewers?.toLocaleString()} зрителей</p>
                </div>
              </div>
              <div className="text-right">
                <div className="w-2 h-2 bg-green-500 rounded-full mb-1"></div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{youtubeStats.duration || "1ч 25м"}</p>
              </div>
            </div>
          )}

          {vkStats && (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                  <SiVk className="text-blue-600 dark:text-blue-400 h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">ВКонтакте</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{vkStats.viewers?.toLocaleString()} зрителей</p>
                </div>
              </div>
              <div className="text-right">
                <div className="w-2 h-2 bg-green-500 rounded-full mb-1"></div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{vkStats.duration || "1ч 25м"}</p>
              </div>
            </div>
          )}

          {(youtubeStats || vkStats) && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600 dark:text-slate-400">Общие просмотры</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">{totalViewers.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center mt-1">
                <span className="text-sm text-slate-600 dark:text-slate-400">Средний битрейт</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">{avgBitrate} Mbps</span>
              </div>
            </div>
          )}

          {!youtubeStats && !vkStats && (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              <Youtube className="w-12 h-12 mx-auto mb-4 text-slate-300 dark:text-slate-600" />
              <p>Нет активных стримов</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
