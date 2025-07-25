import { Card, CardContent } from "@/components/ui/card";
import { Monitor, Video, Package, Calendar } from "lucide-react";

interface StatusCardsProps {
  stats: any;
}

export default function StatusCards({ stats }: StatusCardsProps) {
  if (!stats) {
    return <div>Loading stats...</div>;
  }

  const cards = [
    {
      title: "Системы онлайн",
      value: stats.onlineSystems,
      icon: Monitor,
      color: "text-green-600",
      bgColor: "bg-green-50",
      progress: 80,
      description: "80% систем активны"
    },
    {
      title: "Активные стримы", 
      value: stats.activeStreams,
      icon: Video,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      indicator: "pulse",
      description: "Все стримы работают стабильно"
    },
    {
      title: "Доступная техника",
      value: stats.availableEquipment,
      icon: Package,
      color: "text-orange-600", 
      bgColor: "bg-orange-50",
      progress: 67,
      description: "6 единиц в использовании"
    },
    {
      title: "События сегодня",
      value: stats.todayEvents,
      icon: Calendar,
      color: "text-gray-600",
      bgColor: "bg-gray-50",
      description: "Следующее событие в 15:00"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <Card key={index} className="card-shadow card-hover">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">{card.title}</p>
                  <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
                </div>
                <div className={`w-12 h-12 ${card.bgColor} rounded-lg flex items-center justify-center`}>
                  <Icon className={`${card.color} h-6 w-6`} />
                </div>
              </div>
              <div className="mt-4">
                {card.progress && (
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${card.color.includes('green') ? 'bg-green-500' : card.color.includes('orange') ? 'bg-orange-500' : 'bg-blue-500'}`}
                      style={{ width: `${card.progress}%` }}
                    ></div>
                  </div>
                )}
                {card.indicator === "pulse" && (
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full status-online"></div>
                    <p className="text-xs text-gray-500">{card.description}</p>
                  </div>
                )}
                {!card.progress && card.indicator !== "pulse" && (
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                    <p className="text-xs text-gray-500">{card.description}</p>
                  </div>
                )}
                {card.progress && (
                  <p className="text-xs text-gray-500 mt-2">{card.description}</p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
