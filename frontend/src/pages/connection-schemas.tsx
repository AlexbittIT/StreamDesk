import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
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
  Wrench,
  Save,
  Download,
  Share2,
  List,
  Package,
  BrainCircuit,
  Maximize2,
  Minimize2,
  CheckCircle2,
  AlertTriangle,
  X,
  Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { SchemaCanvas, type SchemaCanvasRef } from "@/components/connection-schemas/schema-canvas";
import { AddEquipmentDialog } from "@/components/connection-schemas/add-equipment-dialog";

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
  connections: Array<{ componentId: string; port?: string; fromPortId?: string; cableType?: string; protocol?: string }>;
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
  protocol?: string;
}

type ComponentConnection = {
  componentId?: string;
  port?: string;
  fromPortId?: string;
  cableType?: string;
  protocol?: string;
};

function normalizeConnections(
  connections: ConnectionSchemaComponent["connections"] | string | null | undefined
): ComponentConnection[] {
  if (Array.isArray(connections)) return connections as ComponentConnection[];
  if (typeof connections === "string") {
    try {
      const parsed = JSON.parse(connections);
      return Array.isArray(parsed) ? (parsed as ComponentConnection[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function ZoneEditForm({
  zone,
  onSave,
  onClose,
}: {
  zone: Zone;
  onSave: (name: string, color: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(zone.name);
  const [color, setColor] = useState(zone.color || "#3b82f6");
  return (
    <>
      <span className="text-white font-medium text-sm">Редактирование зоны</span>
      <Input placeholder="Название" value={name} onChange={(e) => setName(e.target.value)} className="bg-slate-700 border-slate-600 text-white h-8" />
      <div className="flex gap-2 items-center">
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer" />
        <Input value={color} onChange={(e) => setColor(e.target.value)} className="flex-1 bg-slate-700 border-slate-600 text-white h-8 text-sm" />
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="flex-1 h-8" onClick={() => onSave(name.trim(), color)}>Сохранить</Button>
        <Button size="sm" variant="outline" className="h-8" onClick={onClose}>Закрыть</Button>
      </div>
    </>
  );
}

function DeviceEditForm({
  device,
  onSave,
  onClose,
}: {
  device: Device;
  onSave: (data: { name: string; width?: number; height?: number; portsIn?: Device["portsIn"]; portsOut?: Device["portsOut"] }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(device.name);
  const [width, setWidth] = useState(device.properties?.width ?? 260);
  const [height, setHeight] = useState(device.properties?.height ?? 80);
  const [portsInText, setPortsInText] = useState(
    (device.portsIn || []).map((p) => p.name || p.id).join("\n")
  );
  const [portsOutText, setPortsOutText] = useState(
    (device.portsOut || []).map((p) => p.name || p.id).join("\n")
  );
  const handleSave = () => {
    const portsIn: Device["portsIn"] = portsInText
      .split("\n")
      .filter((s) => s.trim())
      .map((s, i) => ({ id: `in-${i}`, name: s.trim(), type: "in" as const }));
    const portsOut: Device["portsOut"] = portsOutText
      .split("\n")
      .filter((s) => s.trim())
      .map((s, i) => ({ id: `out-${i}`, name: s.trim(), type: "out" as const }));
    onSave({ name: name.trim(), width: Number(width) || 260, height: Number(height) || 80, portsIn, portsOut });
  };
  return (
    <>
      <span className="text-white font-medium text-sm">Редактирование оборудования</span>
      <Input placeholder="Название" value={name} onChange={(e) => setName(e.target.value)} className="bg-slate-700 border-slate-600 text-white h-8" />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-slate-400">Ширина</label>
          <Input type="number" min={100} max={600} value={width} onChange={(e) => setWidth(Number(e.target.value))} className="bg-slate-700 border-slate-600 text-white h-8" />
        </div>
        <div>
          <label className="text-xs text-slate-400">Высота</label>
          <Input type="number" min={60} max={400} value={height} onChange={(e) => setHeight(Number(e.target.value))} className="bg-slate-700 border-slate-600 text-white h-8" />
        </div>
      </div>
      <div>
        <label className="text-xs text-slate-400">Входы (каждый с новой строки)</label>
        <textarea
          className="mt-1 w-full rounded border border-slate-600 bg-slate-700 text-white text-sm p-2 min-h-[60px] resize-y"
          value={portsInText}
          onChange={(e) => setPortsInText(e.target.value)}
          placeholder={"HDMI 1\nSDI\n..."}
        />
      </div>
      <div>
        <label className="text-xs text-slate-400">Выходы (каждый с новой строки)</label>
        <textarea
          className="mt-1 w-full rounded border border-slate-600 bg-slate-700 text-white text-sm p-2 min-h-[60px] resize-y"
          value={portsOutText}
          onChange={(e) => setPortsOutText(e.target.value)}
          placeholder={"HDMI\nSDI\n..."}
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="flex-1 h-8" onClick={handleSave}>Сохранить</Button>
        <Button size="sm" variant="outline" className="h-8" onClick={onClose}>Закрыть</Button>
      </div>
    </>
  );
}

interface Violation {
  code: string;
  message: string;
  fromPortId?: string;
  toPortId?: string;
  componentId?: string;
}

interface BuildResult {
  ok: boolean;
  violations: Violation[];
  summary: string;
}

function ValidationPanel({
  violations,
  success,
  onClose,
  onJumpToDevice,
}: {
  violations: Violation[];
  success: boolean;
  onClose: () => void;
  onJumpToDevice?: (deviceId: string) => void;
}) {
  if (success && violations.length === 0) {
    return (
      <div className="m-2 rounded-lg border border-green-500/50 bg-green-50 dark:bg-green-950/40 p-3 shadow-sm">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-green-800 dark:text-green-300">Схема целостна</p>
            <p className="text-sm text-green-700 dark:text-green-400/80 mt-0.5">
              Все связи корректны. Схема успешно прошла проверку.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-green-700/70 dark:text-green-400/70 hover:text-green-900 dark:hover:text-green-200 flex-shrink-0"
            aria-label="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="m-2 rounded-lg border border-red-500/50 bg-red-50 dark:bg-red-950/40 shadow-sm max-h-[40vh] flex flex-col">
      <div className="flex items-start gap-2 p-3 border-b border-red-500/30">
        <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-red-800 dark:text-red-300">
            Найдено нарушений: {violations.length}
          </p>
          <p className="text-sm text-red-700 dark:text-red-400/80 mt-0.5">
            Нажмите на элемент, чтобы подсветить его на схеме.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-red-700/70 dark:text-red-400/70 hover:text-red-900 dark:hover:text-red-200 flex-shrink-0"
          aria-label="Закрыть"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <ul className="overflow-y-auto divide-y divide-red-500/20">
        {violations.map((v, idx) => {
          const targetId = v.componentId;
          const clickable = !!targetId && !!onJumpToDevice;
          return (
            <li
              key={`${v.code}-${idx}`}
              className={cn(
                "flex items-start gap-2 px-3 py-2 text-sm",
                clickable && "cursor-pointer hover:bg-red-100/60 dark:hover:bg-red-900/30"
              )}
              onClick={() => clickable && onJumpToDevice!(targetId!)}
            >
              <span className="flex-shrink-0 mt-0.5 text-red-500" aria-hidden>•</span>
              <span className="flex-1 min-w-0 text-red-800 dark:text-red-200/90">{v.message}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function ConnectionSchemas() {
  const { toast } = useToast();
  const [selectedSchema, setSelectedSchema] = useState<string | null>(null);
  const [isCreatingSchema, setIsCreatingSchema] = useState(false);
  const [isAddingEquipment, setIsAddingEquipment] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [newSchemaName, setNewSchemaName] = useState("");
  const [newSchemaDescription, setNewSchemaDescription] = useState("");
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [newlyCreatedSchemaId, setNewlyCreatedSchemaId] = useState<string | null>(null);
  const [drawZoneMode, setDrawZoneMode] = useState(false);
  const [pendingZoneRect, setPendingZoneRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [drawnZoneName, setDrawnZoneName] = useState("");
  const [drawnZoneColor, setDrawnZoneColor] = useState("#3b82f6");
  const schemaCanvasRef = useRef<SchemaCanvasRef>(null);

  const [buildViolations, setBuildViolations] = useState<Violation[] | null>(null);
  const [buildSuccess, setBuildSuccess] = useState(false);
  useEffect(() => {
    setBuildViolations(null);
    setBuildSuccess(false);
  }, [selectedSchema]);

  // Получение всех схем
  const { data: schemas = [], refetch: refetchSchemas } = useQuery<ConnectionSchema[]>({
    queryKey: ["/api/connection-schemas"],
  });

  useEffect(() => {
    const schemaId = new URLSearchParams(window.location.search).get("schema");
    if (schemaId) {
      setSelectedSchema(schemaId);
      setIsFullScreen(true);
    }
  }, []);

  useEffect(() => {
    if (isFullScreen) {
      document.body.classList.add('fullscreen-overlay-active');
    } else {
      document.body.classList.remove('fullscreen-overlay-active');
    }
    return () => {
      document.body.classList.remove('fullscreen-overlay-active');
    };
  }, [isFullScreen]);

  useEffect(() => {
    if (!isFullScreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullScreen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isFullScreen]);

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

  // Преобразование соединений в кабели (нормализуем connections — с сервера может прийти строка JSON)
  const cables: Cable[] = useMemo(() => {
    if (!selectedSchemaData?.components) return [];
    
    const cableList: Cable[] = [];
    selectedSchemaData.components.forEach(comp => {
      const conns = normalizeConnections(comp.connections);
      if (conns && Array.isArray(conns)) {
        conns.forEach((conn: { componentId?: string; port?: string; fromPortId?: string; cableType?: string; protocol?: string }, index: number) => {
          if (conn.componentId && conn.port) {
            cableList.push({
              id: `${comp.id}-${conn.componentId}-${index}`,
              fromDeviceId: comp.id,
              fromPortId: conn.fromPortId ?? conn.port,
              toDeviceId: conn.componentId,
              toPortId: conn.port,
              cableType: conn.cableType,
              protocol: conn.protocol,
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
        setIsFullScreen(true);
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
    onSuccess: (_data, deletedId) => {
      toast({ title: "Схема удалена", description: "Схема подключения успешно удалена" });
      queryClient.removeQueries({ queryKey: ["/api/connection-schemas", deletedId] });
      queryClient.invalidateQueries({ queryKey: ["/api/connection-schemas"] });
      refetchSchemas();
      if (selectedSchema === deletedId) {
        setSelectedSchema(null);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: "Не удалось удалить схему",
        variant: "destructive",
      });
    },
  });

  const aiGenerateMutation = useMutation({
    mutationFn: async (prompt: string) => {
      if (!selectedSchema) throw new Error("Схема не выбрана");
      const response = await apiRequest("POST", `/api/connection-schemas/${selectedSchema}/ai-generate`, { prompt });
      return response.json();
    },
    onSuccess: async (data) => {
      toast({
        title: "Схема дополнена",
        description: `Добавлено блоков: ${data?.created?.length || 0}. Проверьте порты и поправьте при необходимости.`,
      });
      await refetchSelectedSchema();
    },
    onError: (error: any) => {
      toast({ title: "Не удалось собрать схему", description: error?.message || "Проверьте описание и попробуйте снова", variant: "destructive" });
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
      setPendingZoneRect(null);
      setSelectedZoneId(null);
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
      if (!component) throw new Error("Компонент не найден");
      
      const response = await apiRequest("PUT", `/api/connection-schemas/components/${id}`, {
        position,
        properties: component.properties,
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || "Не удалось обновить устройство");
      }
      return response.json();
    },
    onSuccess: () => {
      refetchSelectedSchema();
    },
  });

  // Удаление компонента (устройство или зона)
  const deleteComponentMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/connection-schemas/components/${id}`);
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || "Не удалось удалить");
      }
    },
    onSuccess: (_data, id) => {
      setSelectedDeviceId((prev) => (prev === id ? null : prev));
      setSelectedZoneId((prev) => (prev === id ? null : prev));
      queryClient.invalidateQueries({ queryKey: ["/api/connection-schemas", selectedSchema] });
      refetchSelectedSchema();
      toast({ title: "Удалено" });
    },
    onError: (e: unknown) => {
      toast({ title: "Ошибка", description: (e as Error)?.message, variant: "destructive" });
    },
  });

  // Обновление компонента (имя, свойства — для зон и устройств)
  const updateComponentMutation = useMutation({
    mutationFn: async ({ id, name, properties }: { id: string; name?: string; properties?: Record<string, unknown> }) => {
      const component = selectedSchemaData?.components?.find(c => c.id === id);
      if (!component) throw new Error("Компонент не найден");
      const response = await apiRequest("PUT", `/api/connection-schemas/components/${id}`, {
        position: component.position,
        name: name !== undefined ? name : component.name,
        properties: properties !== undefined ? properties : component.properties,
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || "Не удалось обновить");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connection-schemas", selectedSchema] });
      refetchSelectedSchema();
      toast({ title: "Сохранено" });
    },
    onError: (e: unknown) => {
      toast({ title: "Ошибка", description: (e as Error)?.message, variant: "destructive" });
    },
  });

  // Добавление соединения (кабель) между портами
  const addConnectionMutation = useMutation({
    mutationFn: async (payload: {
      fromDeviceId: string;
      toDeviceId: string;
      fromPortId: string;
      toPortId: string;
      cableType?: string;
      protocol?: string;
    }) => {
      if (!selectedSchema) throw new Error("Схема не выбрана");
      const res = await fetch(`/api/connection-schemas/${selectedSchema}/connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.status === 422 && data?.violations?.length) {
        const msgs = (data.violations as Violation[]).map((v) => v.message).join("; ");
        throw new Error(msgs);
      }
      if (!res.ok) {
        throw new Error(data?.message || "Не удалось создать соединение");
      }
      return data;
    },
    onMutate: async (payload) => {
      if (!selectedSchema) return;
      await queryClient.cancelQueries({ queryKey: ["/api/connection-schemas", selectedSchema] });
      const prev = queryClient.getQueryData<ConnectionSchema>(["/api/connection-schemas", selectedSchema]);
      if (!prev?.components) return { prev };
      const nextComponents = prev.components.map((c) => {
        if (c.id !== payload.fromDeviceId) return c;
        const connections = [...normalizeConnections(c.connections)];
        const alreadyExists = connections.some((connection) =>
          connection.componentId === payload.toDeviceId &&
          connection.port === payload.toPortId &&
          (connection.fromPortId ?? connection.port) === payload.fromPortId
        );
        if (alreadyExists) return c;
        connections.push({
          componentId: payload.toDeviceId,
          port: payload.toPortId,
          fromPortId: payload.fromPortId,
          cableType: payload.cableType,
          protocol: payload.protocol,
        });
        return { ...c, connections };
      });
      queryClient.setQueryData<ConnectionSchema>(["/api/connection-schemas", selectedSchema], {
        ...prev,
        components: nextComponents,
      });
      return { prev };
    },
    onError: (e: unknown, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(["/api/connection-schemas", selectedSchema], context.prev);
      }
      const msg = (e as Error)?.message || "Не удалось создать соединение";
      toast({ title: "Связь не создана", description: msg, variant: "destructive" });
    },
    onSettled: () => {
      if (selectedSchema) {
        queryClient.invalidateQueries({ queryKey: ["/api/connection-schemas", selectedSchema] });
        refetchSelectedSchema();
      }
    },
    onSuccess: () => {
      toast({ title: "Соединение создано" });
      setBuildViolations(null);
      setBuildSuccess(false);
    },
  });

  // Удаление кабеля (двойной клик по связи): убираем запись из connections источника.
  const deleteConnectionMutation = useMutation({
    mutationFn: async (cable: { fromDeviceId: string; fromPortId: string; toDeviceId: string; toPortId: string }) => {
      const component = selectedSchemaData?.components?.find(c => c.id === cable.fromDeviceId);
      if (!component) throw new Error("Устройство не найдено");
      const connections = normalizeConnections(component.connections).filter((conn) =>
        !(conn.componentId === cable.toDeviceId &&
          conn.port === cable.toPortId &&
          (conn.fromPortId ?? conn.port) === cable.fromPortId)
      );
      const response = await apiRequest("PUT", `/api/connection-schemas/components/${cable.fromDeviceId}`, {
        position: component.position,
        properties: component.properties,
        connections,
      });
      if (!response.ok) throw new Error("Не удалось удалить связь");
      return response.json();
    },
    onSuccess: () => {
      if (selectedSchema) {
        queryClient.invalidateQueries({ queryKey: ["/api/connection-schemas", selectedSchema] });
        refetchSelectedSchema();
      }
      toast({ title: "Связь удалена" });
    },
    onError: (e: any) => {
      toast({ title: "Ошибка", description: e?.message || "Не удалось удалить связь", variant: "destructive" });
    },
  });

  const handleDeleteConnection = (cable: { fromDeviceId: string; fromPortId: string; toDeviceId: string; toPortId: string }) => {
    deleteConnectionMutation.mutate(cable);
  };

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

  const handleDeleteComponent = (id: string) => {
    const component = selectedSchemaData?.components?.find((item) => item.id === id);
    const name = component?.name || "элемент";
    if (window.confirm(`Удалить "${name}" из схемы?`)) {
      deleteComponentMutation.mutate(id);
    }
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

  const handleZoneDrawn = useCallback((rect: { x: number; y: number; width: number; height: number }) => {
    setDrawZoneMode(false);
    setPendingZoneRect(rect);
    setDrawnZoneName("Зона");
    setDrawnZoneColor("#3b82f6");
  }, []);

  const handleAddConnection = useCallback(
    (from: { deviceId: string; portId: string }, to: { deviceId: string; portId: string }, protocol?: string) => {
      addConnectionMutation.mutate({
        fromDeviceId: from.deviceId,
        toDeviceId: to.deviceId,
        fromPortId: from.portId,
        toPortId: to.portId,
        protocol,
      });
    },
    [addConnectionMutation]
  );

  const buildSchemaMutation = useMutation({
    mutationFn: async (schemaId: string) => {
      const response = await apiRequest("POST", `/api/connection-schemas/${schemaId}/build`);
      return response.json() as Promise<BuildResult>;
    },
    onSuccess: (data) => {
      const violations = Array.isArray(data?.violations) ? data.violations : [];
      setBuildViolations(violations);
      setBuildSuccess(data?.ok === true);
      if (data?.ok) {
        toast({ title: "Схема целостна", description: data.summary || "Проверка пройдена успешно." });
      } else {
        toast({
          title: `Найдено нарушений: ${violations.length}`,
          description: "Проблемные элементы подсвечены на схеме.",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      setBuildSuccess(false);
      toast({
        title: "Не удалось проверить схему",
        description: error?.message || "Сервер недоступен или вернул ошибку.",
        variant: "destructive",
      });
    },
  });

  const handleBuild = useCallback(() => {
    if (!selectedSchema) {
      toast({ title: "Выберите схему для проверки", variant: "destructive" });
      return;
    }
    buildSchemaMutation.mutate(selectedSchema);
  }, [selectedSchema, buildSchemaMutation]);

  const dismissBuild = useCallback(() => {
    setBuildViolations(null);
    setBuildSuccess(false);
  }, []);

  const confirmDrawnZone = () => {
    if (!selectedSchema || !pendingZoneRect) return;
    if (!drawnZoneName.trim()) {
      toast({ title: "Ошибка", description: "Введите название зоны", variant: "destructive" });
      return;
    }
    createZoneMutation.mutate({
      schemaId: selectedSchema,
      type: "zone",
      name: drawnZoneName.trim(),
      position: { x: pendingZoneRect.x, y: pendingZoneRect.y },
      properties: {
        width: pendingZoneRect.width,
        height: pendingZoneRect.height,
        color: drawnZoneColor,
      },
    });
    setPendingZoneRect(null);
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
          <div className="flex items-center gap-2 flex-wrap">
          <Link href="/connection-schemas/port-review">
            <Button size="lg" variant="outline">
              Очередь разъёмов
            </Button>
          </Link>
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
        </div>

        {/* Полноэкранный холст */}
        {isFullScreen && selectedSchemaData && createPortal(
          <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col">
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-800 border-b border-slate-700 flex-wrap">
              <span className="text-white font-medium truncate">{selectedSchemaData.name} — полноэкранный режим</span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <AddEquipmentDialog
                  open={isAddingEquipment}
                  onClose={() => setIsAddingEquipment(false)}
                  onAdd={handleAddEquipment}
                />
                <Button
                  size="sm"
                  onClick={() => setIsAddingEquipment(true)}
                  className="bg-slate-700 hover:bg-slate-600 text-white border-slate-600"
                >
                  <Package className="w-4 h-4 sm:mr-2" />
                  Оборудование
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={aiGenerateMutation.isPending}
                  onClick={() => {
                    const prompt = window.prompt("Что нужно собрать на схеме? Например: 4 камеры SDI, ATEM Mini, vMix, роутер, 2 микрофона");
                    if (prompt) aiGenerateMutation.mutate(prompt);
                  }}
                  className="border-slate-600 text-white hover:bg-slate-700"
                >
                  <BrainCircuit className="w-4 h-4 sm:mr-2" />
                  AI
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDrawZoneMode(true)}
                  className="border-slate-600 text-white hover:bg-slate-700"
                  title="Выделить прямоугольник на схеме"
                >
                  <Square className="w-4 h-4 sm:mr-2" />
                  Выделить зону
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleBuild}
                  disabled={buildSchemaMutation.isPending}
                  className="border-slate-600 text-white hover:bg-slate-700"
                  title="Проверить целостность схемы"
                >
                  {buildSchemaMutation.isPending ? (
                    <Loader2 className="w-4 h-4 sm:mr-2 animate-spin" />
                  ) : (
                    <Wrench className="w-4 h-4 sm:mr-2" />
                  )}
                  Собрать
                </Button>
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
            </div>
            <div className="flex-1 min-h-0 relative">
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
                drawZoneMode={drawZoneMode}
                onZoneDrawn={handleZoneDrawn}
                onCancelDrawZone={() => setDrawZoneMode(false)}
                onAddConnection={handleAddConnection}
                onDeleteConnection={handleDeleteConnection}
                onZoneSelect={setSelectedZoneId}
                selectedZoneId={selectedZoneId}
                onDeviceDelete={handleDeleteComponent}
                validationComponentIds={buildViolations?.map((v) => v.componentId).filter(Boolean) as string[] | undefined}
              />
              {((buildViolations && buildViolations.length > 0) || buildSuccess) && (
                <div className="absolute top-14 right-4 z-50 w-[min(420px,calc(100vw-2rem))]">
                  <ValidationPanel
                    violations={buildViolations ?? []}
                    success={buildSuccess}
                    onClose={dismissBuild}
                    onJumpToDevice={(deviceId) => setSelectedDeviceId(deviceId)}
                  />
                </div>
              )}
            </div>
            {/* Редактирование зоны или устройства в полноэкранном режиме */}
            {(selectedZoneId || selectedDeviceId) && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-xl flex flex-col gap-2 min-w-[200px]">
                {selectedZoneId && (() => {
                  const zone = zones.find((z) => z.id === selectedZoneId);
                  if (!zone) return null;
                  return (
                    <ZoneEditForm
                      zone={zone}
                      onSave={(name, color) => {
                        const comp = selectedSchemaData?.components?.find((c) => c.id === zone.id);
                        if (!comp || !selectedSchema) return;
                        updateComponentMutation.mutate({
                          id: zone.id,
                          name,
                          properties: { ...comp.properties, width: zone.width, height: zone.height, color },
                        });
                        setSelectedZoneId(null);
                      }}
                      onClose={() => setSelectedZoneId(null)}
                    />
                  );
                })()}
                {selectedDeviceId && !selectedZoneId && (() => {
                  const device = devices.find((d) => d.id === selectedDeviceId);
                  if (!device) return null;
                  return (
                    <DeviceEditForm
                      device={device}
                      onSave={(data) => {
                        const comp = selectedSchemaData?.components?.find((c) => c.id === device.id);
                        if (!comp) return;
                        updateComponentMutation.mutate({
                          id: device.id,
                          name: data.name,
                          properties: {
                            ...comp.properties,
                            width: data.width,
                            height: data.height,
                            portsIn: data.portsIn,
                            portsOut: data.portsOut,
                          },
                        });
                        setSelectedDeviceId(null);
                      }}
                      onClose={() => setSelectedDeviceId(null)}
                    />
                  );
                })()}
              </div>
            )}
          </div>,
          document.body
        )}

        {/* Диалог названия зоны после выделения на схеме */}
        <Dialog open={!!pendingZoneRect} onOpenChange={(open) => !open && setPendingZoneRect(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Название зоны</DialogTitle>
              <DialogDescription>Выделена область на схеме. Введите название и цвет.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>Название *</Label>
                <Input
                  value={drawnZoneName}
                  onChange={(e) => setDrawnZoneName(e.target.value)}
                  placeholder="Например: Студия А"
                />
              </div>
              <div>
                <Label>Цвет</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    type="color"
                    value={drawnZoneColor}
                    onChange={(e) => setDrawnZoneColor(e.target.value)}
                    className="w-14 h-9"
                  />
                  <Input
                    value={drawnZoneColor}
                    onChange={(e) => setDrawnZoneColor(e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={confirmDrawnZone}>
                  Создать зону
                </Button>
                <Button variant="outline" onClick={() => setPendingZoneRect(null)}>
                  Отмена
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

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
                      onClick={() => {
                        setSelectedSchema(schema.id);
                        setIsFullScreen(true);
                      }}
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
                      <Button size="sm" className="h-9 touch-manipulation" onClick={() => setIsAddingEquipment(true)}>
                        <Package className="w-4 h-4 sm:mr-2" />
                        <span className="hidden sm:inline">Оборудование</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 touch-manipulation"
                        disabled={aiGenerateMutation.isPending}
                        onClick={() => {
                          const prompt = window.prompt("Опишите схему: оборудование, количество, SDI/HDMI/LAN/звук");
                          if (prompt) aiGenerateMutation.mutate(prompt);
                        }}
                      >
                        <BrainCircuit className="w-4 h-4 sm:mr-2" />
                        <span className="hidden sm:inline">AI схема</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 touch-manipulation"
                        onClick={() => setDrawZoneMode(true)}
                        title="Выделить прямоугольник на схеме"
                      >
                        <Square className="w-4 h-4 sm:mr-2" />
                        <span className="hidden sm:inline">Выделить зону</span>
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
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 touch-manipulation"
                        onClick={handleBuild}
                        disabled={buildSchemaMutation.isPending}
                        title="Проверить целостность схемы"
                      >
                        {buildSchemaMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Wrench className="w-4 h-4 mr-2" />
                        )}
                        Собрать
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 min-h-0 p-0 overflow-hidden flex flex-col">
                  {((buildViolations && buildViolations.length > 0) || buildSuccess) && (
                    <ValidationPanel
                      violations={buildViolations ?? []}
                      success={buildSuccess}
                      onClose={dismissBuild}
                      onJumpToDevice={(deviceId) => setSelectedDeviceId(deviceId)}
                    />
                  )}
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
                      fullScreen={false}
                      drawZoneMode={drawZoneMode}
                      onZoneDrawn={handleZoneDrawn}
                      onCancelDrawZone={() => setDrawZoneMode(false)}
                      onAddConnection={handleAddConnection}
                      onDeleteConnection={handleDeleteConnection}
                      onZoneSelect={setSelectedZoneId}
                      selectedZoneId={selectedZoneId}
                      onDeviceDelete={handleDeleteComponent}
                      validationComponentIds={buildViolations?.map((v) => v.componentId).filter(Boolean) as string[] | undefined}
                    />
                  </div>
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
