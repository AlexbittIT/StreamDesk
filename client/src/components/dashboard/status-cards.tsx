import { Card, CardContent } from "@/components/ui/card";
import { Monitor, Video, Zap, Calendar } from "lucide-react";

interface StatusCardsProps {
  stats: any;
}

export default function StatusCards({ stats }: StatusCardsProps) {
  if (!stats) {
    return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
      {[...Array(4)].map((_, i) => (
          <Card key={i} className="bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700 animate-pulse">
            <CardContent className="p-2.5 sm:p-3">
              <div className="h-9 bg-slate-200 dark:bg-slate-700 rounded" />
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
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <Card
            key={index}
            className={"overflow-hidden relative border-0 bg-transparent"}
            data-testid={`status-card-${index}`}
          >
            <CardContent className="p-0">
              <div className="flex items-stretch gap-0 bg-white dark:bg-slate-800/95 rounded-xl shadow-sm overflow-hidden">
                <div className="flex items-center justify-center w-24 sm:w-28 p-3 bg-gradient-to-br from-[rgb(var(--color-brand-gradient-start-rgb))] to-[rgb(var(--color-brand-gradient-end-rgb))]">
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-white/10 shadow-lg">
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                </div>

                <div className="flex-1 p-3 sm:p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white selected">{card.value}</span>
                        <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">{card.description}</span>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 truncate">{card.title}</p>
                    </div>
                    {card.indicator === "pulse" && (
                      <div className="flex-shrink-0">
                        <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 animate-pulse shadow" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
