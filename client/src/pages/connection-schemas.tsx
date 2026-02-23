import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { 
  Network, 
  Plus, 
  Trash2, 
  Edit,
  Square,
  Type,
  Wrench,
  Save,
  Download,
  Share2,
  List,
  Package,
  Maximize2,
  Minimize2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { SchemaCanvas, type SchemaCanvasRef } from "@/components/connection-schemas/schema-canvas";
import { AddEquipmentDialog } from "@/components/connection-schemas/add-equipment-dialog";
import { AddZoneDialog } from "@/components/connection-schemas/add-zone-dialog";

interface ConnectionSchema {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  components?: ConnectionSchemaComponent[];
}

interface ConnectionSchemaComponent {
  id: string;
  schemaId: string;
  type: string;
  name: string;
  position: { x: number; y: number };
  properties: Record<string, any>;
  connections: Array<{ componentId: string; port?: string; cableType?: string }>;
  createdAt: string;
  updatedAt: string;
}

interface Device {
  id: string;
  name: string;
  type: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  portsIn: Array<{ id: string; name: string; type: "in"; portType?: string }>;
  portsOut: Array<{ id: string; name: string; type: "out"; portType?: string }>;
  manufacturer?: string;
  model?: string;
  properties?: Record<string, any>;
}

interface Zone {
  id: string;
  name: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  color?: string;
}

interface Cable {
  id: string;
  fromDeviceId: string;
  fromPortId: string;
  toDeviceId: string;
  toPortId: string;
  cableType?: string;
}

export default function ConnectionSchemas() {
  const { toast } = useToast();
  const [selectedSchema, setSelectedSchema] = useState<string | null>(null);
  const [isCreatingSchema, setIsCreatingSchema] = useState(false);
  const [isAddingEquipment, setIsAddingEquipment] = useState(false);
  const [isAddingZone, setIsAddingZone] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [newSchemaName, setNewSchemaName] = useState("");
  const [newSchemaDescription, setNewSchemaDescription] = useState("");
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [newlyCreatedSchemaId, setNewlyCreatedSchemaId] = useState<string | null>(null);
  const schemaCanvasRef = useRef<SchemaCanvasRef>(null);

  // Получение всех схем
  const { data: schemas = [], refetch: refetchSchemas } = useQuery<ConnectionSchema[]>({
    queryKey: ["/api/connection-schemas"],
  });

  // Получение выбранной схемы с компонентами
  const { data: selectedSchemaData, refetch: refetchSelectedSchema } = useQuery<ConnectionSchema>({
    queryKey: ["/api/connection-schemas", selectedSchema],
    queryFn: async () => {
      if (!selectedSchema) return null;
      const response = await apiRequest("GET", `/api/connection-schemas/${selectedSchema}`);
      return response.json();
    },
    enabled: !!selectedSchema,
  });

  // Преобразование компонентов в устройства для canvas
  const devices: Device[] = useMemo(() => {
    if (!selectedSchemaData?.components) return [];
    
    return selectedSchemaData.components
      .filter(comp => comp.type !== "zone" && comp.type !== "cable")
      .map(comp => ({
        id: comp.id,
        name: comp.name,
        type: comp.type,
        position: comp.position || { x: 0, y: 0 },
        portsIn: (comp.properties?.portsIn as Device["portsIn"]) || [],
        portsOut: (comp.properties?.portsOut as Device["portsOut"]) || [],
        manufacturer: comp.properties?.manufacturer as string,
        model: comp.properties?.model as string,
        properties: comp.properties,
      }));
  }, [selectedSchemaData]);

  // Преобразование компонентов в зоны
  const zones: Zone[] = useMemo(() => {
    if (!selectedSchemaData?.components) return [];
    
    return selectedSchemaData.components
      .filter(comp => comp.type === "zone")
      .map(comp => ({
        id: comp.id,
        name: comp.name,
        position: comp.position || { x: 0, y: 0 },
        width: comp.properties?.width as number || 300,
        height: comp.properties?.height as number || 200,
        color: comp.properties?.color as string,
      }));
  }, [selectedSchemaData]);

  // Преобразование соединений в кабели
  const cables: Cable[] = useMemo(() => {
    if (!selectedSchemaData?.components) return [];
    
    const cableList: Cable[] = [];
    selectedSchemaData.components.forEach(comp => {
      if (comp.connections && Array.isArray(comp.connections)) {
        comp.connections.forEach((conn, index) => {
          if (conn.componentId && conn.port) {
            cableList.push({
              id: `${comp.id}-${conn.componentId}-${index}`,
              fromDeviceId: comp.id,
              fromPortId: conn.port,
              toDeviceId: conn.componentId,
              toPortId: conn.port,
              cableType: conn.cableType,
            });
          }
        });
      }
    });
    
    return cableList;
  }, [selectedSchemaData]);

  // Создание схемы
  const createSchemaMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      try {
        const response = await apiRequest("POST", "/api/connection-schemas", data);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: "Не удалось создать схему" }));
          throw new Error(errorData.message || "Не удалось создать схему");
        }
        const result = await response.json();
        return result;
      } catch (error: any) {
        console.error("Error creating schema:", error);
        throw error;
      }
    },
    onSuccess: async (data) => {
      toast({ title: "Схема создана", description: "Схема подключения успешно создана" });
      setIsCreatingSchema(false);
      setNewSchemaName("");
      setNewSchemaDescription("");
      queryClient.invalidateQueries({ queryKey: ["/api/connection-schemas"] });
      await queryClient.refetchQueries({ queryKey: ["/api/connection-schemas"] });
      if (data?.id) {
        setSelectedSchema(data.id);
        setNewlyCreatedSchemaId(data.id);
        setTimeout(() => setNewlyCreatedSchemaId(null), 2500);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось создать схему",
        variant: "destructive",
      });
    },
  });

  // Удаление схемы
  const deleteSchemaMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/connection-schemas/${id}`);
      if (!response.ok) {
        throw new Error("Не удалось удалить схему");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Схема удалена", description: "Схема подключения успешно удалена" });
      refetchSchemas();
      if (selectedSchema) {
        setSelectedSchema(null);
      }
    },
    onError: () => {
      toast({
        title: "Ошибка",
        description: "Не удалось удалить схему",
        variant: "destructive",
      });
    },
  });

  // Создание зоны
  const createZoneMutation = useMutation({
    mutationFn: async (data: {
      schemaId: string;
      type: string;
      name: string;
      position: { x: number; y: number };
      properties?: Record<string, any>;
    }) => {
      const response = await apiRequest("POST", `/api/connection-schemas/${data.schemaId}/components`, data);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Не удалось создать зону" }));
        throw new Error(errorData.message || "Не удалось создать зону");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Зона создана", description: "Зона успешно добавлена в схему" });
      refetchSelectedSchema();
      setIsAddingZone(false);
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось создать зону",
        variant: "destructive",
      });
    },
  });

  // Создание компонента (устройства)
  const createComponentMutation = useMutation({
    mutationFn: async (data: {
      schemaId: string;
      type: string;
      name: string;
      position: { x: number; y: number };
      properties?: Record<string, any>;
      connections?: any[];
    }) => {
      const response = await apiRequest("POST", `/api/connection-schemas/${data.schemaId}/components`, data);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Не удалось создать компонент" }));
        throw new Error(errorData.message || "Не удалось создать компонент");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Оборудование добавлено", description: "Оборудование успешно добавлено в схему" });
      refetchSelectedSchema();
      setIsAddingEquipment(false);
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось добавить оборудование",
        variant: "destructive",
      });
    },
  });

  // Обновление позиции устройства
  const updateDevicePosition = useMutation({
    mutationFn: async ({ id, position }: { id: string; position: { x: number; y: number } }) => {
      const component = selectedSchemaData?.components?.find(c => c.id === id);
      if (!component) return;
      
      const response = await apiRequest("PUT", `/api/connection-schemas/components/${id}`, {
        position,
        properties: component.properties,
      });
      if (!response.ok) throw new Error("Failed to update device");
      return response.json();
    },
    onSuccess: () => {
      refetchSelectedSchema();
    },
  });

  const handleCreateSchema = () => {
    if (!newSchemaName.trim()) {
      toast({
        title: "Ошибка",
        description: "Введите название схемы",
        variant: "destructive",
      });
      return;
    }
    createSchemaMutation.mutate({
      name: newSchemaName.trim(),
      description: newSchemaDescription.trim() || undefined,
    });
  };

  const handleAddEquipment = (equipment: {
    id?: string;
    name: string;
    manufacturer?: string;
    model?: string;
    type: string;
    portsIn: Array<{ id: string; name: string; type: "in"; portType?: string }>;
    portsOut: Array<{ id: string; name: string; type: "out"; portType?: string }>;
    specifications?: Record<string, any>;
  }) => {
    if (!selectedSchema) {
      toast({
        title: "Ошибка",
        description: "Выберите схему",
        variant: "destructive",
      });
      return;
    }

    // Размещаем в центре текущего вида (как в Figma), чтобы не переносить пользователя на другой край
    const center = schemaCanvasRef.current?.getViewportCenter();
    const x = center ? Math.round(center.x - 100) : Math.floor(devices.length / 3) * 250 + 50;
    const y = center ? Math.round(center.y - 40) : (devices.length % 3) * 150 + 50;

    createComponentMutation.mutate({
      schemaId: selectedSchema,
      type: equipment.type,
      name: equipment.name,
      position: { x, y },
      properties: {
        manufacturer: equipment.manufacturer,
        model: equipment.model,
        portsIn: equipment.portsIn,
        portsOut: equipment.portsOut,
        ...equipment.specifications,
      },
      connections: [],
    });
  };

  const handleDeviceUpdate = (deviceId: string, position: { x: number; y: number }) => {
    updateDevicePosition.mutate({ id: deviceId, position });
  };

  const handleAddZone = (zone: Omit<Zone, "id">) => {
    if (!selectedSchema) {
      toast({
        title: "Ошибка",
        description: "Выберите схему",
        variant: "destructive",
      });
      return;
    }

    createZoneMutation.mutate({
      schemaId: selectedSchema,
      type: "zone",
      name: zone.name,
      position: zone.position,
      properties: {
        width: zone.width,
        height: zone.height,
        color: zone.color,
      },
    });
  };

  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <div className="container max-w-[1920px] mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-4 sm:space-y-6">
        {/* Заголовок */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent truncate">
              Схемы подключения
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">
              Создание и управление схемами подключения оборудования
            </p>
          </div>
          <Dialog open={isCreatingSchema} onOpenChange={setIsCreatingSchema}>
            <DialogTrigger asChild>
              <Button size="lg" onClick={() => setIsCreatingSchema(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Создать схему
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Новая схема подключения</DialogTitle>
                <DialogDescription>
                  Создайте новую схему для визуализации подключений оборудования
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Название схемы *</Label>
                  <Input 
                    placeholder="Например: NEW YEAR" 
                    value={newSchemaName}
                    onChange={(e) => setNewSchemaName(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Описание</Label>
                  <Input 
                    placeholder="Описание схемы (опционально)" 
                    value={newSchemaDescription}
                    onChange={(e) => setNewSchemaDescription(e.target.value)}
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button 
                    className="flex-1" 
                    onClick={handleCreateSchema}
                    disabled={createSchemaMutation.isPending}
                  >
                    {createSchemaMutation.isPending ? "Создание..." : "Создать"}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setIsCreatingSchema(false)}
                    disabled={createSchemaMutation.isPending}
                  >
                    Отмена
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Полноэкранный холст */}
        {isFullScreen && selectedSchemaData && (
          <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
              <span className="text-white font-medium">{selectedSchemaData.name} — полноэкранный режим</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsFullScreen(false)}
                className="border-slate-600 text-white hover:bg-slate-700"
              >
                <Minimize2 className="w-4 h-4 mr-2" />
                Выйти
              </Button>
            </div>
            <div className="flex-1 min-h-0">
              <SchemaCanvas
                ref={schemaCanvasRef}
                schemaId={selectedSchema}
                devices={devices}
                zones={zones}
                cables={cables}
                onDeviceUpdate={handleDeviceUpdate}
                onDeviceSelect={setSelectedDeviceId}
                selectedDeviceId={selectedDeviceId}
                fullScreen
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6 min-h-0 h-[calc(100vh-180px)] sm:h-[calc(100vh-200px)]">
          {/* Список схем — на мобильном сверху, компактно */}
          <div className="lg:col-span-1 min-w-0 flex flex-col min-h-[140px] sm:min-h-0">
            <Card className="shadow-lg flex flex-col flex-1 min-h-0">
              <CardHeader className="p-3 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Схемы</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Выберите схему для редактирования</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 flex-1 overflow-y-auto hide-scrollbar p-3 sm:p-6 pt-0">
                {schemas.length > 0 ? (
                  schemas.map((schema) => (
                    <div
                      key={schema.id}
                      ref={(el) => {
                        if (el && newlyCreatedSchemaId === schema.id) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
                      }}
                      className={cn(
                        "p-3 rounded-lg border-2 cursor-pointer transition-all",
                        selectedSchema === schema.id
                          ? "border-primary bg-primary/5"
                          : "border-transparent hover:border-muted-foreground/50",
                        newlyCreatedSchemaId === schema.id && "ring-2 ring-primary ring-offset-2 animate-pulse"
                      )}
                      onClick={() => setSelectedSchema(schema.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold truncate">{schema.name}</h3>
                          {schema.description && (
                            <p className="text-sm text-muted-foreground truncate">{schema.description}</p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm("Удалить схему?")) {
                              deleteSchemaMutation.mutate(schema.id);
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Network className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p className="text-sm">Нет созданных схем</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Редактор схемы: канвас с перемещением и рисованием */}
          <div className="lg:col-span-3 min-h-0 flex flex-col min-w-0">
            {selectedSchemaData ? (
              <Card className="shadow-lg flex flex-col flex-1 min-h-[320px] sm:min-h-[420px] md:min-h-[520px]">
                <CardHeader className="p-3 sm:p-6">
                  <div className="flex flex-col gap-3 sm:gap-0 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <CardTitle className="text-base sm:text-lg truncate">{selectedSchemaData.name}</CardTitle>
                      {selectedSchemaData.description && (
                        <CardDescription className="mt-1 truncate">{selectedSchemaData.description}</CardDescription>
                      )}
                      <p className="text-xs text-muted-foreground mt-1 hidden sm:block">
                        Перетаскивайте блоки; зум и панорама — в панели над схемой.
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <AddEquipmentDialog
                        open={isAddingEquipment}
                        onClose={() => setIsAddingEquipment(false)}
                        onAdd={handleAddEquipment}
                      />
                      <AddZoneDialog
                        open={isAddingZone}
                        onClose={() => setIsAddingZone(false)}
                        onAdd={handleAddZone}
                      />
                      <Button size="sm" className="h-9 touch-manipulation" onClick={() => setIsAddingEquipment(true)}>
                        <Package className="w-4 h-4 sm:mr-2" />
                        <span className="hidden sm:inline">Оборудование</span>
                      </Button>
                      <Button size="sm" variant="outline" className="h-9 touch-manipulation" onClick={() => setIsAddingZone(true)}>
                        <Square className="w-4 h-4 sm:mr-2" />
                        <span className="hidden sm:inline">Зона</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 touch-manipulation"
                        onClick={() => setIsFullScreen(true)}
                        title="На весь экран"
                      >
                        <Maximize2 className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline" className="h-9 touch-manipulation hidden md:inline-flex">
                        <Type className="w-4 h-4 mr-2" />
                        Текст
                      </Button>
                      <Button size="sm" variant="outline" className="h-9 touch-manipulation hidden md:inline-flex">
                        <Wrench className="w-4 h-4 mr-2" />
                        Собрать
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 min-h-0 p-0 overflow-hidden">
                  <SchemaCanvas
                    ref={schemaCanvasRef}
                    schemaId={selectedSchema}
                    devices={devices}
                    zones={zones}
                    cables={cables}
                    onDeviceUpdate={handleDeviceUpdate}
                    onDeviceSelect={setSelectedDeviceId}
                    selectedDeviceId={selectedDeviceId}
                    fullScreen={false}
                  />
                </CardContent>
              </Card>
            ) : (
              <Card className="shadow-lg h-full flex items-center justify-center">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Network className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-sm">Выберите схему для редактирования</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
