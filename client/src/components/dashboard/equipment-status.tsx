import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic, Camera, Lightbulb, Monitor, Package, MapPin } from "lucide-react";
import { Link } from "wouter";

interface EquipmentStatusProps {
  equipment?: any[];
}

export default function EquipmentStatus({ equipment }: EquipmentStatusProps) {
  const equipmentInUse = equipment?.filter(item => item.status === "in-use") || [];

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "microphone": return <Mic className="h-4 w-4" />;
      case "camera": return <Camera className="h-4 w-4" />;
      case "lighting": return <Lightbulb className="h-4 w-4" />;
      case "computer": return <Monitor className="h-4 w-4" />;
      default: return <Package className="h-4 w-4" />;
    }
  };

  return (
    <Card className="bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
            <Package className="w-4 h-4" />
            Техника
          </CardTitle>
          <Link href="/equipment">
            <Badge 
              variant="outline" 
              className="cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-600"
            >
              Все →
            </Badge>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {equipmentInUse.length === 0 ? (
          <div className="text-center py-4">
            <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center">
              <Package className="w-5 h-5 text-emerald-500" />
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">Вся техника доступна</p>
          </div>
        ) : (
          <div className="space-y-2">
            {equipmentInUse.slice(0, 4).map((item) => (
              <div 
                key={item.id} 
                className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50"
                data-testid={`equipment-${item.id}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-amber-500/10 dark:bg-amber-500/20 rounded-lg flex items-center justify-center text-amber-600 dark:text-amber-400">
                    {getTypeIcon(item.type)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{item.name}</p>
                    {item.location && (
                      <p className="text-xs text-slate-500 dark:text-slate-500 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {item.location}
                      </p>
                    )}
                  </div>
                </div>
                <div className="w-2 h-2 bg-amber-500 rounded-full" />
              </div>
            ))}
            {equipmentInUse.length > 4 && (
              <p className="text-xs text-center text-slate-500 dark:text-slate-400 pt-1">
                +{equipmentInUse.length - 4} ещё
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
