import { Card, CardContent } from "@/components/ui/card";
import { Monitor, Video, Zap, Calendar } from "lucide-react";
import { tabPermission } from "@shared/schema";

interface StatusCardsProps {
  stats: any;
  user?: any;
}

function canAccessTab(user: any, tabKey: string): boolean {
  if (!user) return true;
  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  const hasTabPermissions = permissions.some((permission: string) => permission.startsWith("tab:"));
  if (hasTabPermissions) return permissions.includes(tabPermission(tabKey));
  return true;
}

export default function StatusCards({ stats, user }: StatusCardsProps) {
  if (!stats) {
    return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 sm:gap-2">
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
      tabKey: "monitoring",
      value: stats.onlineSystems,
      icon: Monitor,
      iconColor: "text-emerald-500",
      bgColor: "bg-emerald-500/10 dark:bg-emerald-500/20",
      glow: "neon-glow-green",
      description: "онлайн"
    },
    {
      title: "Стримы", 
      tabKey: "streams",
      value: stats.activeStreams,
      icon: Video,
      iconColor: "text-cyan-500",
      bgColor: "bg-cyan-500/10 dark:bg-cyan-500/20",
      glow: "",
      indicator: "pulse",
      description: "активных"
    },
    {
      title: "Сеть",
      tabKey: "monitoring",
      value: stats.networkMbps ?? 0,
      icon: Zap,
      iconColor: "text-amber-500", 
      bgColor: "bg-amber-500/10 dark:bg-amber-500/20",
      glow: "",
      description: "Mbps"
    },
    {
      title: "Событий",
      tabKey: "calendar",
      value: stats.todayEvents,
      icon: Calendar,
      iconColor: "text-violet-500",
      bgColor: "bg-violet-500/10 dark:bg-violet-500/20",
      glow: "",
      description: "сегодня"
    }
  ];

  const visibleCards = cards.filter((card) => canAccessTab(user, card.tabKey));

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 w-full min-w-0">
      {visibleCards.map((card, index) => {
        const Icon = card.icon;
        return (
          <Card
            key={index}
            className="overflow-hidden relative border-0 bg-transparent min-w-0"
            data-testid={`status-card-${index}`}
          >
            <CardContent className="p-0 min-w-0">
              <div className="flex items-stretch gap-0 bg-card/80 dark:bg-card/90 backdrop-blur-sm rounded-xl border border-border overflow-hidden min-w-0 border-l-4 border-l-primary/80">
                <div className="flex items-center justify-center w-14 sm:w-24 md:w-28 p-2 sm:p-3 bg-gradient-to-br from-[rgb(var(--color-brand-gradient-start-rgb))] to-[rgb(var(--color-brand-gradient-end-rgb))] shrink-0">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg flex items-center justify-center bg-white/10 shadow-lg">
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-white" />
                  </div>
                </div>

                <div className="flex-1 p-2 sm:p-3 md:p-4 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="flex items-baseline gap-1 flex-wrap">
                        <span className="text-lg sm:text-2xl md:text-3xl font-extrabold text-foreground selected truncate">{card.value}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{card.description}</span>
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 truncate">{card.title}</p>
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
