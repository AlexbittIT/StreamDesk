import { Card, CardContent } from "@/components/ui/card";
import { BookOpen } from "lucide-react";

export default function DashboardPeriodWidget() {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const period =
    month >= 0 && month <= 4
      ? `Весенний семестр ${year}`
      : month >= 8
        ? `Осенний семестр ${year}`
        : `Летний период ${year}`;
  const range =
    month >= 0 && month <= 4
      ? `Январь — Май ${year}`
      : month >= 8
        ? `Сентябрь — Декабрь ${year}`
        : `Июнь — Август ${year}`;

  return (
    <Card className="bg-card border-border overflow-hidden rounded-2xl">
      <CardContent className="p-3 min-w-0">
        <div className="flex items-start gap-2.5">
          <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <BookOpen className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">{period}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{range}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
