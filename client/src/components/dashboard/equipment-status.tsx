import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mic, Camera, Lightbulb, Monitor, Gavel } from "lucide-react";

interface EquipmentStatusProps {
  equipment?: any[];
}

export default function EquipmentStatus({ equipment }: EquipmentStatusProps) {
  const equipmentInUse = equipment?.filter(item => item.status === "in-use") || [];

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "microphone": return <Mic className="text-primary h-4 w-4" />;
      case "camera": return <Camera className="text-primary h-4 w-4" />;
      case "lighting": return <Lightbulb className="text-primary h-4 w-4" />;
      case "computer": return <Monitor className="text-primary h-4 w-4" />;
      default: return <Gavel className="text-primary h-4 w-4" />;
    }
  };

  return (
    <Card className="card-shadow">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Техника в использовании</CardTitle>
          <Button variant="ghost" size="sm" className="text-primary hover:text-blue-700">
            Склад
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {equipmentInUse.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Gavel className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>Вся техника доступна</p>
          </div>
        ) : (
          <div className="space-y-3">
            {equipmentInUse.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-primary bg-opacity-10 rounded-lg flex items-center justify-center">
                    {getTypeIcon(item.type)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-500">{item.location}</p>
                  </div>
                </div>
                <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
