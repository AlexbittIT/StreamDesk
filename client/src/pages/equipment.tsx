import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, Search, Filter, Plus, Mic, Camera, Lightbulb, Monitor, Gavel, Edit, MapPin, ScanBarcode } from "lucide-react";
import { EquipmentForm } from "@/components/forms/equipment-form";
import { BarcodeScanner } from "@/components/equipment/barcode-scanner";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Equipment } from "@shared/schema";

export default function EquipmentPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState<any>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const { toast } = useToast();

  const { data: equipment = [], isLoading } = useQuery({
    queryKey: ["/api/equipment"],
  });

  const filteredEquipment = equipment.filter((item: any) => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.model?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;
    const matchesType = typeFilter === "all" || item.type === typeFilter;
    
    return matchesSearch && matchesStatus && matchesType;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "available": return "bg-green-100 text-green-800";
      case "in-use": return "bg-blue-100 text-blue-800";
      case "maintenance": return "bg-yellow-100 text-yellow-800";
      case "broken": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "available": return "Доступно";
      case "in-use": return "Используется";
      case "maintenance": return "Обслуживание";
      case "broken": return "Сломано";
      default: return status;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "microphone": return <Mic className="w-5 h-5" />;
      case "camera": return <Camera className="w-5 h-5" />;
      case "lighting": return <Lightbulb className="w-5 h-5" />;
      case "computer": return <Monitor className="w-5 h-5" />;
      default: return <Gavel className="w-5 h-5" />;
    }
  };

  const getTypeText = (type: string) => {
    switch (type) {
      case "microphone": return "Микрофон";
      case "camera": return "Камера";
      case "lighting": return "Освещение";
      case "computer": return "Компьютер";
      default: return "Другое";
    }
  };

  if (isLoading) {
    return <div>Loading equipment...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold text-gray-900">Склад техники</h2>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            onClick={() => setIsScannerOpen(true)}
            data-testid="button-scan-barcode"
          >
            <ScanBarcode className="w-4 h-4 mr-2" />
            Сканировать
          </Button>
          <Button onClick={() => {
            setSelectedEquipment(null);
            setIsFormOpen(true);
          }} data-testid="button-add-equipment">
            <Plus className="w-4 h-4 mr-2" />
            Добавить оборудование
          </Button>
        </div>
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Поиск по названию или модели..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Статус" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                <SelectItem value="available">Доступно</SelectItem>
                <SelectItem value="in-use">Используется</SelectItem>
                <SelectItem value="maintenance">Обслуживание</SelectItem>
                <SelectItem value="broken">Сломано</SelectItem>
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Тип" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все типы</SelectItem>
                <SelectItem value="microphone">Микрофоны</SelectItem>
                <SelectItem value="camera">Камеры</SelectItem>
                <SelectItem value="lighting">Освещение</SelectItem>
                <SelectItem value="computer">Компьютеры</SelectItem>
                <SelectItem value="other">Другое</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={() => {
              setSearchTerm("");
              setStatusFilter("all");
              setTypeFilter("all");
            }}>
              Сбросить фильтры
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Equipment Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredEquipment.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500">Оборудование не найдено</p>
          </div>
        ) : (
          filteredEquipment.map((item: any) => (
            <Card key={item.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-primary bg-opacity-10 rounded-lg flex items-center justify-center text-primary">
                      {getTypeIcon(item.type)}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{item.name}</CardTitle>
                      <p className="text-sm text-gray-500">{getTypeText(item.type)}</p>
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
                        setSelectedEquipment(item);
                        setIsFormOpen(true);
                      }}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {item.model && (
                    <div>
                      <span className="text-gray-500">Модель:</span> {item.model}
                    </div>
                  )}
                  {item.serialNumber && (
                    <div>
                      <span className="text-gray-500">Серийный номер:</span> {item.serialNumber}
                    </div>
                  )}
                  {item.inventoryNumber && (
                    <div>
                      <span className="text-gray-500">Инв. номер:</span> {item.inventoryNumber}
                    </div>
                  )}
                  {item.location && (
                    <div className="flex items-center">
                      <MapPin className="w-3 h-3 mr-1 text-gray-500" />
                      <span className="text-gray-500">Место:</span> {item.location}
                    </div>
                  )}
                  {item.lastUsed && (
                    <div>
                      <span className="text-gray-500">Последнее использование:</span>{" "}
                      {new Date(item.lastUsed).toLocaleDateString("ru-RU")}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Equipment Form */}
      <EquipmentForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        equipment={selectedEquipment}
      />

      {/* Barcode Scanner */}
      <BarcodeScanner
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onEquipmentFound={(foundEquipment: Equipment) => {
          setSelectedEquipment(foundEquipment);
          setIsFormOpen(true);
          toast({ 
            title: "Найдено", 
            description: `Оборудование "${foundEquipment.name}" найдено по штрих-коду` 
          });
        }}
      />
    </div>
  );
}