import { Card, CardContent } from "@/components/ui/card";
import { Monitor, Video, Zap, Calendar } from "lucide-react";

interface StatusCardsProps {
  stats: any;
}

export default function StatusCards({ stats }: StatusCardsProps) {
  if (!stats) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700 animate-pulse">
            <CardContent className="p-4">
              <div className="h-12 bg-slate-200 dark:bg-slate-700 rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: "Системы",
      value: stats.onlineSystems,
      icon: Monitor,
      iconColor: "text-emerald-500",
      bgColor: "bg-emerald-500/10 dark:bg-emerald-500/20",
      glow: "neon-glow-green",
      description: "онлайн"
    },
    {
      title: "Стримы", 
      value: stats.activeStreams,
      icon: Video,
      iconColor: "text-cyan-500",
      bgColor: "bg-cyan-500/10 dark:bg-cyan-500/20",
      glow: "",
      indicator: "pulse",
      description: "активных"
    },
    {
      title: "Скорость",
      value: "120",
      icon: Zap,
      iconColor: "text-amber-500", 
      bgColor: "bg-amber-500/10 dark:bg-amber-500/20",
      glow: "",
      description: "Mbps"
    },
    {
      title: "Событий",
      value: stats.todayEvents,
      icon: Calendar,
      iconColor: "text-violet-500",
      bgColor: "bg-violet-500/10 dark:bg-violet-500/20",
      glow: "",
      description: "сегодня"
    }
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <Card 
            key={index} 
            className={`
              bg-white dark:bg-slate-800/90 
              border-slate-200 dark:border-slate-700 
              hover:border-slate-300 dark:hover:border-slate-600
              transition-all hover:shadow-lg dark:hover:shadow-black/20
            `}
            data-testid={`status-card-${index}`}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 ${card.bgColor} rounded-lg flex items-center justify-center`}>
                  <Icon className={`${card.iconColor} h-5 w-5`} />
                </div>
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold text-slate-900 dark:text-white">{card.value}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{card.description}</span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{card.title}</p>
                </div>
                {card.indicator === "pulse" && (
                  <div className="ml-auto">
                    <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
