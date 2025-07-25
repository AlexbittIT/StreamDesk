import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, ClipboardCheck, CalendarPlus, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function QuickActions() {
  const { toast } = useToast();

  const handleAction = (action: string) => {
    toast({
      title: "Действие выполнено",
      description: `${action} - функция будет реализована в следующих версиях`,
    });
  };

  const actions = [
    {
      title: "Новый стрим",
      icon: Plus,
      color: "hover:border-primary hover:bg-primary hover:bg-opacity-5",
      iconColor: "text-primary",
      action: "Создание нового стрима"
    },
    {
      title: "Проверить технику",
      icon: ClipboardCheck,
      color: "hover:border-secondary hover:bg-secondary hover:bg-opacity-5",
      iconColor: "text-secondary",
      action: "Проверка техники"
    },
    {
      title: "Добавить событие",
      icon: CalendarPlus,
      color: "hover:border-accent hover:bg-accent hover:bg-opacity-5",
      iconColor: "text-accent",
      action: "Добавление события"
    },
    {
      title: "Отчет",
      icon: BarChart3,
      color: "hover:border-gray-400 hover:bg-gray-50",
      iconColor: "text-gray-600",
      action: "Генерация отчета"
    }
  ];

  return (
    <Card className="card-shadow">
      <CardHeader>
        <CardTitle>Быстрые действия</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {actions.map((action, index) => {
            const Icon = action.icon;
            return (
              <Button
                key={index}
                variant="outline"
                className={`flex flex-col items-center p-4 h-auto border border-gray-200 ${action.color} transition-colors`}
                onClick={() => handleAction(action.action)}
              >
                <Icon className={`${action.iconColor} h-8 w-8 mb-2`} />
                <span className="text-sm font-medium text-gray-900">{action.title}</span>
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
