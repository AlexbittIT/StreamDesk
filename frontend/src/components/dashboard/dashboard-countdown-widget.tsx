import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Sun } from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

interface DashboardCountdownWidgetProps {
  nextEvent?: { startTime: string; title: string } | null;
}

export default function DashboardCountdownWidget({ nextEvent }: DashboardCountdownWidgetProps) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const target = nextEvent ? new Date(nextEvent.startTime) : null;
  const isPast = target ? target.getTime() <= now.getTime() : true;
  const text = nextEvent ? `До события: ${nextEvent.title}` : "Ближайшее событие";
  const distance = target && !isPast ? formatDistanceToNow(target, { locale: ru, addSuffix: false }) : nextEvent ? "0 дн. 0 ч. 0 мин." : "Нет запланированных";

  return (
    <Card className="bg-card/80 dark:bg-card/90 backdrop-blur-sm border border-border overflow-hidden rounded-xl border-l-4 border-l-amber-500/70">
      <CardContent className="p-3 min-w-0">
        <div className="flex items-start gap-2.5">
          <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
            <Sun className="h-5 w-5 text-amber-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">{text}</p>
            <p className="text-lg font-bold text-primary mt-1 tabular-nums">
              {distance}
            </p>
            <Link href="/calendar">
              <span className="text-sm text-primary hover:underline mt-2 inline-flex items-center gap-1 cursor-pointer">
                → Перейти в календарь
              </span>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
