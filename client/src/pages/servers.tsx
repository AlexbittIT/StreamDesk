import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Server, Filter, Plus, Globe, Settings, Edit, Activity } from "lucide-react";
import { SystemForm } from "@/components/forms/system-form";
import { useToast } from "@/hooks/use-toast";

export default function Servers() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedSystem, setSelectedSystem] = useState<any>(null);
  const { toast } = useToast();

  const { data: systems = [], isLoading } = useQuery({
    queryKey: ["/api/systems"],
  });

  const filteredSystems = (systems as any[]).filter((item: any) => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.ipAddress?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "online": return "bg-green-100 text-green-800";
      case "offline": return "bg-red-100 text-red-800";
      case "maintenance": return "bg-yellow-100 text-yellow-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "online": return "Онлайн";
      case "offline": return "Офлайн";
      case "maintenance": return "Обслуживание";
      default: return status;
    }
  };

  if (isLoading) {
    return <div>Загрузка серверов...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button onClick={() => {
          setSelectedSystem(null);
          setIsFormOpen(true);
        }}>
          <Plus className="w-4 h-4 mr-2" />
          Добавить сервер
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Filter className="w-5 h-5 mr-2" />
            Фильтры
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Статус" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                <SelectItem value="online">Онлайн</SelectItem>
                <SelectItem value="offline">Офлайн</SelectItem>
                <SelectItem value="maintenance">Обслуживание</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={() => setStatusFilter("all")}>
              Сбросить фильтры
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Systems Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredSystems.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <Server className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500">Серверы не найдены</p>
          </div>
        ) : (
          filteredSystems.map((item: any) => (
            <Card key={item.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-primary bg-opacity-10 rounded-lg flex items-center justify-center text-primary">
                      <Server className="w-6 h-6" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{item.name}</CardTitle>
                      <p className="text-sm text-gray-500">{item.type}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge className={getStatusColor(item.status)}>
                      {getStatusText(item.status)}
                    </Badge>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => {
                        setSelectedSystem(item);
                        setIsFormOpen(true);
                      }}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">IP адрес:</span>
                    <span className="text-sm font-mono">{item.ipAddress}</span>
                  </div>
                  
                  {item.port && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Порт:</span>
                      <span className="text-sm font-mono">{item.port}</span>
                    </div>
                  )}
                  
                  {item.specifications && typeof item.specifications === 'object' && Object.keys(item.specifications).length > 0 && (
                    <div>
                      <span className="text-sm text-gray-500">Характеристики:</span>
                      <div className="text-sm mt-1 space-y-1">
                        {Object.entries(item.specifications).map(([key, value]) => (
                          <div key={key} className="flex justify-between">
                            <span className="text-gray-500 capitalize">{key}:</span>
                            <span className="font-mono">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {item.lastChecked && (
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>Последняя проверка:</span>
                      <span>{new Date(item.lastChecked).toLocaleString("ru-RU")}</span>
                    </div>
                  )}
                  
                  <div className="flex space-x-2 mt-4">
                    <Button variant="outline" size="sm" className="flex-1">
                      <Activity className="w-4 h-4 mr-1" />
                      Мониторинг
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1">
                      <Settings className="w-4 h-4 mr-1" />
                      Настройки
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* System Form */}
      <SystemForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        system={selectedSystem}
      />
    </div>
  );
}