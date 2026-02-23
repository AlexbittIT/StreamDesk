import { Card, CardContent } from "@/components/ui/card";
import { CalendarDays, Construction } from "lucide-react";
import { cn } from "@/lib/utils";

export default function RoomBookingPage() {
  return (
    <div className="space-y-2 sm:space-y-2.5 p-0 w-full min-w-0 max-w-full overflow-hidden">
      <h2 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
        <CalendarDays className="h-5 w-5 text-primary shrink-0" />
        Бронирование комнат
      </h2>

      <Card className="bg-card border-border rounded-2xl overflow-hidden">
        <CardContent className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Construction className="h-8 w-8 text-primary" />
          </div>
          <p className="text-lg font-medium text-foreground mb-1">
            Раздел в разработке
          </p>
          <p className={cn("text-sm text-muted-foreground max-w-md")}>
            Скоро здесь можно будет бронировать аудитории и переговорные. Пока что пользуйтесь календарём для планирования событий.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
