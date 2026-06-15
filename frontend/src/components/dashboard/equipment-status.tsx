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
      case "microphone": return <Mic className="h-3 w-3" />;
      case "camera": return <Camera className="h-3 w-3" />;
      case "lighting": return <Lightbulb className="h-3 w-3" />;
      case "computer": return <Monitor className="h-3 w-3" />;
      default: return <Package className="h-3 w-3" />;
    }
  };

  return (
    <Card className="bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700">
      <CardHeader className="py-2.5 px-3 sm:px-4 pb-1.5">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
            <Package className="w-3.5 h-3.5" />
            Техника
          </CardTitle>
          <Link href="/equipment">
            <Badge variant="outline" className="cursor-pointer text-[10px] py-0 px-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-600">
              Все →
            </Badge>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="px-3 sm:px-4 pb-3 pt-0">
        {equipmentInUse.length === 0 ? (
          <div className="text-center py-3">
            <div className="w-7 h-7 mx-auto mb-1.5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center">
              <Package className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">Вся техника доступна</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {equipmentInUse.slice(0, 4).map((item) => (
              <div 
                key={item.id} 
                className="flex items-center justify-between p-1.5 rounded-md bg-slate-50 dark:bg-slate-900/50"
                data-testid={`equipment-${item.id}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 shrink-0 bg-amber-500/10 dark:bg-amber-500/20 rounded flex items-center justify-center text-amber-600 dark:text-amber-400">
                    {getTypeIcon(item.type)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-900 dark:text-white truncate">{item.name}</p>
                    {item.location && (
                      <p className="text-[10px] text-slate-500 dark:text-slate-500 flex items-center gap-0.5 truncate">
                        <MapPin className="w-2.5 h-2.5 shrink-0" />
                        {item.location}
                      </p>
                    )}
                  </div>
                </div>
                <div className="w-1.5 h-1.5 bg-amber-500 rounded-full shrink-0" />
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
