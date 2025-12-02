import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, Search, Plus, Mic, Camera, Lightbulb, Monitor, Gavel, Edit, MapPin, ScanBarcode } from "lucide-react";
import { EquipmentForm } from "@/components/forms/equipment-form";
import { BarcodeScanner } from "@/components/equipment/barcode-scanner";
import type { Equipment } from "@shared/schema";

export default function EquipmentPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const { data: equipment = [], isLoading } = useQuery<Equipment[]>({
    queryKey: ["/api/equipment"],
  });

  const filteredEquipment = equipment.filter((item: Equipment) => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.model?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;
    const matchesType = typeFilter === "all" || item.type === typeFilter;
    
    return matchesSearch && matchesStatus && matchesType;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "available": return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
      case "in-use": return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
      case "maintenance": return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
      case "broken": return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
      default: return "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300";
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
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Склад техники</h2>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button 
            variant="outline" 
            className="flex-1 sm:flex-none border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={() => setIsScannerOpen(true)}
            data-testid="button-scan-barcode"
          >
            <ScanBarcode className="w-4 h-4 mr-2" />
            Сканировать
          </Button>
          <Button 
            className="flex-1 sm:flex-none bg-primary hover:bg-primary/90 text-white shadow-sm"
            onClick={() => {
              setSelectedEquipment(null);
              setIsFormOpen(true);
            }} 
            data-testid="button-add-equipment"
          >
            <Plus className="w-4 h-4 mr-2" />
            Добавить
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Поиск по названию или модели..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
          />
        </div>
            
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[150px] bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
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
          <SelectTrigger className="w-full sm:w-[140px] bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
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

        <Button 
          variant="outline" 
          className="border-slate-300 dark:border-slate-600"
          onClick={() => {
            setSearchTerm("");
            setStatusFilter("all");
            setTypeFilter("all");
          }}
        >
          Сбросить
        </Button>
      </div>

      {/* Equipment Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredEquipment.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <Package className="w-12 h-12 mx-auto mb-4 text-slate-300 dark:text-slate-600" />
            <p className="text-slate-500 dark:text-slate-400">Оборудование не найдено</p>
          </div>
        ) : (
          filteredEquipment.map((item: Equipment) => (
            <Card key={item.id} className="hover:shadow-lg transition-all bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-primary/10 dark:bg-primary/20 rounded-lg flex items-center justify-center text-primary">
                      {getTypeIcon(item.type)}
                    </div>
                    <div>
                      <CardTitle className="text-lg text-slate-900 dark:text-white">{item.name}</CardTitle>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{getTypeText(item.type)}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge className={getStatusColor(item.status)}>
                      {getStatusText(item.status)}
                    </Badge>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="hover:bg-slate-100 dark:hover:bg-slate-700"
                      onClick={() => {
                        setSelectedEquipment(item);
                        setIsFormOpen(true);
                      }}
                    >
                      <Edit className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
                  {item.model && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Модель:</span>
                      <span className="font-medium">{item.model}</span>
                    </div>
                  )}
                  {item.serialNumber && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Серийный номер:</span>
                      <span className="font-medium font-mono text-xs">{item.serialNumber}</span>
                    </div>
                  )}
                  {item.inventoryNumber && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Инв. номер:</span>
                      <span className="font-medium">{item.inventoryNumber}</span>
                    </div>
                  )}
                  {item.location && (
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-slate-400" />
                      <span className="text-slate-500 dark:text-slate-400">Место:</span>
                      <span className="font-medium ml-auto">{item.location}</span>
                    </div>
                  )}
                  {item.lastUsed && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Последнее использование:</span>
                      <span className="font-medium">{new Date(item.lastUsed).toLocaleDateString("ru-RU")}</span>
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
          setIsScannerOpen(false);
        }}
      />
    </div>
  );
}