import React, { memo } from "react";
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

interface PlatformRowProps {
  name: string;
  icon: any;
  stats?: PlatformStats;
  gradient?: string;
}

const PlatformRow = memo(function PlatformRow({ name, icon: Icon, stats, gradient = "from-slate-400 to-slate-500" }: PlatformRowProps) {
  if (!stats) return null;

  return (
    <div className="flex items-center justify-between rounded-xl overflow-hidden bg-white dark:bg-slate-800/90 shadow-sm">
      <div className="flex items-center gap-3 p-3 w-full">
        <div className={`flex items-center justify-center w-12 h-12 rounded-lg shadow bg-gradient-to-br ${gradient}`}>
          <Icon className="text-white w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white truncate">{name}</p>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 truncate mt-0.5">{stats.viewers?.toLocaleString()} зрит.</p>
        </div>
        <div className="text-right flex flex-col items-end justify-center gap-0.5">
          <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{stats.status || "Активно"}</span>
          <p className="text-xs text-slate-500 dark:text-slate-400">{stats.duration || "—"}</p>
        </div>
      </div>
    </div>
  );
});

PlatformRow.displayName = "PlatformRow";

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
    <Card className="bg-transparent border-0">
      <CardHeader className="py-2.5 px-0 sm:px-0 pb-1.5">
        <CardTitle className="text-sm font-semibold text-slate-900 dark:text-white">Статистика стримов</CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-0 pt-0">
        <div className="space-y-2">
          <PlatformRow name="YouTube" icon={Youtube} stats={youtubeStats} gradient="from-red-500 to-pink-500" />
          <PlatformRow name="ВКонтакте" icon={SiVk} stats={vkStats} gradient="from-blue-500 to-indigo-500" />

          {(youtubeStats || vkStats) && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1 px-1">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-600 dark:text-slate-400">Общие просмотры</span>
                <span className="font-semibold text-slate-900 dark:text-white">{totalViewers.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-600 dark:text-slate-400">Средний битрейт</span>
                <span className="font-semibold text-slate-900 dark:text-white">{avgBitrate} Mbps</span>
              </div>
            </div>
          )}

          {!youtubeStats && !vkStats && (
            <div className="text-center py-6">
              <Youtube className="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-slate-500 dark:text-slate-400">Нет активных стримов</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
