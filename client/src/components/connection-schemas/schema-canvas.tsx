import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { Stage, Layer, Group, Rect, Text, Line, Circle } from "react-konva";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, Maximize2, Undo2, Redo2, Download, FileImage, FileText, Save } from "lucide-react";
import jsPDF from "jspdf";

interface Port {
  id: string;
  name: string;
  type: "in" | "out";
  portType?: string; // HDMI, SDI, USB, ETH, etc.
}

interface Device {
  id: string;
  name: string;
  type: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  portsIn: Port[];
  portsOut: Port[];
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

interface SchemaCanvasProps {
  schemaId: string;
  devices: Device[];
  zones: Zone[];
  cables: Cable[];
  onDeviceUpdate: (deviceId: string, position: { x: number; y: number }) => void;
  onDeviceSelect?: (deviceId: string | null) => void;
  selectedDeviceId?: string | null;
  fullScreen?: boolean;
}

export interface SchemaCanvasRef {
  getViewportCenter: () => { x: number; y: number };
}

const DEVICE_WIDTH = 200;
const DEVICE_HEIGHT_BASE = 80;
const PORT_HEIGHT = 20;
const PORT_SPACING = 5;
const ZONE_PADDING = 20;

export const SchemaCanvas = forwardRef<SchemaCanvasRef, SchemaCanvasProps>(function SchemaCanvas({
  schemaId,
  devices,
  zones,
  cables,
  onDeviceUpdate,
  onDeviceSelect,
  selectedDeviceId,
  fullScreen = false,
}, ref) {
  const { toast } = useToast();
  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ w: 800, h: 600 });
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [draggedDeviceId, setDraggedDeviceId] = useState<string | null>(null);
  const [history, setHistory] = useState<Device[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useImperativeHandle(ref, () => ({
    getViewportCenter() {
      const cx = (-position.x + stageSize.w / 2) / scale;
      const cy = (-position.y + stageSize.h / 2) / scale;
      return { x: Math.round(cx), y: Math.round(cy) };
    },
  }), [position, scale, stageSize]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      setStageSize({ w: el.clientWidth || 800, h: Math.max(el.clientHeight || 600, 400) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      setScale((s) => {
        const newScale = Math.min(3, Math.max(0.4, s + delta));
        const rect = el.getBoundingClientRect();
        const pointerX = e.clientX - rect.left;
        const pointerY = e.clientY - rect.top;
        setPosition((pos) => {
          const worldX = (-pos.x + pointerX) / s;
          const worldY = (-pos.y + pointerY) / s;
          return {
            x: -worldX * newScale + pointerX,
            y: -worldY * newScale + pointerY,
          };
        });
        return newScale;
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const updateDeviceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Device> }) => {
      const response = await apiRequest("PUT", `/api/connection-schemas/components/${id}`, {
        position: data.position,
        properties: data.properties,
      });
      if (!response.ok) throw new Error("Failed to update device");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Устройство обновлено" });
    },
    onError: () => {
      toast({ title: "Ошибка", description: "Не удалось обновить устройство", variant: "destructive" });
    },
  });

  const saveToHistory = useCallback((devices: Device[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(devices)));
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  const handleDeviceDragEnd = useCallback((deviceId: string, newPosition: { x: number; y: number }) => {
    const device = devices.find(d => d.id === deviceId);
    if (!device) return;

    const updatedDevice = { ...device, position: newPosition };
    const updatedDevices = devices.map(d => d.id === deviceId ? updatedDevice : d);
    
    saveToHistory(updatedDevices);
    onDeviceUpdate(deviceId, newPosition);
    
    // Обновляем в БД
    updateDeviceMutation.mutate({
      id: deviceId,
      data: { position: newPosition, properties: device.properties },
    });
  }, [devices, onDeviceUpdate, updateDeviceMutation, saveToHistory]);

  const calculateDeviceHeight = (device: Device): number => {
    const portsInCount = device.portsIn?.length || 0;
    const portsOutCount = device.portsOut?.length || 0;
    const portsHeight = Math.max(portsInCount, portsOutCount) * (PORT_HEIGHT + PORT_SPACING);
    return DEVICE_HEIGHT_BASE + portsHeight;
  };

  const getPortPosition = (device: Device, port: Port, index: number): { x: number; y: number } => {
    const deviceHeight = calculateDeviceHeight(device);
    const portY = port.type === "in" 
      ? device.position.y 
      : device.position.y + deviceHeight - PORT_HEIGHT;
    
    const ports = port.type === "in" ? device.portsIn : device.portsOut;
    const portSpacing = DEVICE_WIDTH / (ports.length + 1);
    const portX = device.position.x + (index + 1) * portSpacing - 15; // -15 для центрирования порта
    
    return { x: portX, y: portY };
  };

  const getPortColor = (portType?: string): string => {
    const colors: Record<string, string> = {
      HDMI: "#1a1a1a",
      SDI: "#808080",
      USB: "#0066cc",
      ETH: "#ffd700",
      LAN: "#ffd700",
      "USB-C": "#0066cc",
      BNC: "#808080",
      Wireless: "#7c3aed",
      DC: "#4a5568",
    };
    return colors[portType || ""] || "#666666";
  };

  /** Проверка: соединение допустимо только выход → вход (out → in) */
  const isConnectionValid = (fromDevice: Device, fromPort: Port, toDevice: Device, toPort: Port): boolean => {
    return fromPort.type === "out" && toPort.type === "in";
  };

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.1, 3));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - 0.1, 0.5));
  };

  const handleFitAll = () => {
    if (!devices.length) return;
    
    const minX = Math.min(...devices.map(d => d.position.x));
    const minY = Math.min(...devices.map(d => d.position.y));
    const maxX = Math.max(...devices.map(d => d.position.x + DEVICE_WIDTH));
    const maxY = Math.max(...devices.map(d => d.position.y + calculateDeviceHeight(d)));
    
    const width = maxX - minX;
    const height = maxY - minY;
    
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;
      
      const scaleX = containerWidth / (width + 100);
      const scaleY = containerHeight / (height + 100);
      const newScale = Math.min(scaleX, scaleY, 1);
      
      setScale(newScale);
      setPosition({
        x: -minX * newScale + 50,
        y: -minY * newScale + 50,
      });
    }
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      // Восстанавливаем позиции устройств
      const restoredDevices = history[newIndex];
      restoredDevices.forEach(device => {
        onDeviceUpdate(device.id, device.position);
      });
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      const restoredDevices = history[newIndex];
      restoredDevices.forEach(device => {
        onDeviceUpdate(device.id, device.position);
      });
    }
  };

  const exportToPNG = async () => {
    if (!stageRef.current) return;
    
    try {
      const dataURL = stageRef.current.toDataURL({ pixelRatio: 2 });
      const link = document.createElement("a");
      link.download = `schema-${schemaId}.png`;
      link.href = dataURL;
      link.click();
      toast({ title: "Экспорт выполнен", description: "Схема экспортирована в PNG" });
    } catch (error) {
      toast({ title: "Ошибка", description: "Не удалось экспортировать схему", variant: "destructive" });
    }
  };

  const exportToJPEG = async () => {
    if (!stageRef.current) return;
    
    try {
      const dataURL = stageRef.current.toDataURL({ 
        pixelRatio: 2,
        mimeType: "image/jpeg",
        quality: 0.95,
      });
      const link = document.createElement("a");
      link.download = `schema-${schemaId}.jpg`;
      link.href = dataURL;
      link.click();
      toast({ title: "Экспорт выполнен", description: "Схема экспортирована в JPEG" });
    } catch (error) {
      toast({ title: "Ошибка", description: "Не удалось экспортировать схему", variant: "destructive" });
    }
  };

  const exportToPDF = async () => {
    if (!stageRef.current) return;
    
    try {
      const dataURL = stageRef.current.toDataURL({ pixelRatio: 2 });
      const pdf = new jsPDF("landscape", "mm", "a4");
      const imgWidth = 297; // A4 landscape width in mm
      const imgHeight = (stageRef.current.height() / stageRef.current.width()) * imgWidth;
      
      pdf.addImage(dataURL, "PNG", 0, 0, imgWidth, imgHeight);
      pdf.save(`schema-${schemaId}.pdf`);
      toast({ title: "Экспорт выполнен", description: "Схема экспортирована в PDF" });
    } catch (error) {
      toast({ title: "Ошибка", description: "Не удалось экспортировать схему", variant: "destructive" });
    }
  };

  const minX = devices.length > 0 ? Math.min(...devices.map(d => d.position.x)) - 100 : 0;
  const minY = devices.length > 0 ? Math.min(...devices.map(d => d.position.y)) - 100 : 0;
  const maxX = devices.length > 0 ? Math.max(...devices.map(d => d.position.x + DEVICE_WIDTH)) + 100 : 1000;
  const maxY = devices.length > 0 ? Math.max(...devices.map(d => d.position.y + calculateDeviceHeight(d))) + 100 : 1000;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 border-b bg-white dark:bg-slate-900">
        <div className="flex items-center gap-1 border-r pr-2 mr-2">
          <Button variant="ghost" size="sm" onClick={handleZoomIn} title="Увеличить">
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleZoomOut} title="Уменьшить">
            <ZoomOut className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleFitAll} title="Показать все">
            <Maximize2 className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1 border-r pr-2 mr-2">
          <Button variant="ghost" size="sm" onClick={handleUndo} disabled={historyIndex <= 0} title="Отменить">
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleRedo} disabled={historyIndex >= history.length - 1} title="Повторить">
            <Redo2 className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={exportToPNG} title="Экспорт PNG">
            <FileImage className="w-4 h-4 mr-1" />
            PNG
          </Button>
          <Button variant="ghost" size="sm" onClick={exportToJPEG} title="Экспорт JPEG">
            <FileImage className="w-4 h-4 mr-1" />
            JPEG
          </Button>
          <Button variant="ghost" size="sm" onClick={exportToPDF} title="Экспорт PDF">
            <FileText className="w-4 h-4 mr-1" />
            PDF
          </Button>
        </div>
      </div>

      {/* Подсказка: только выход → вход */}
      {!fullScreen && (
        <p className="text-xs text-muted-foreground px-2 py-1 border-b bg-muted/30">
          Соединяйте выход (out) с входом (in). Беспроводные связи отображаются пунктиром.
        </p>
      )}
      {/* Canvas: минимальная высота, сетка, перетаскивание, зум колёсиком как в Figma */}
      <div
        ref={containerRef}
        className={fullScreen ? "flex-1 min-h-0 w-full overflow-hidden" : "flex-1 min-h-[400px] bg-slate-100 dark:bg-slate-900 overflow-hidden"}
        style={{ touchAction: "none" }}
      >
        <Stage
          ref={stageRef}
          width={stageSize.w}
          height={stageSize.h}
          scaleX={scale}
          scaleY={scale}
          x={position.x}
          y={position.y}
          draggable
          onDragEnd={(e) => {
            setPosition({ x: e.target.x(), y: e.target.y() });
          }}
        >
          <Layer>
            {/* Сетка фона (точечная/лёгкая) */}
            {(function drawGrid() {
              const step = 48;
              const w = 2400;
              const h = 1600;
              const lines: number[] = [];
              for (let x = -w; x <= w; x += step) {
                lines.push(x, -h, x, h);
              }
              for (let y = -h; y <= h; y += step) {
                lines.push(-w, y, w, y);
              }
              return (
                <Line
                  points={lines}
                  stroke="rgba(148, 163, 184, 0.2)"
                  strokeWidth={0.5}
                  listening={false}
                />
              );
            })()}
            {/* Zones */}
            {zones.map(zone => (
              <Group key={zone.id}>
                <Rect
                  x={zone.position.x}
                  y={zone.position.y}
                  width={zone.width}
                  height={zone.height}
                  fill={zone.color || "rgba(59, 130, 246, 0.08)"}
                  stroke={zone.color || "#3b82f6"}
                  strokeWidth={2}
                  dash={[8, 6]}
                  cornerRadius={6}
                  shadowColor="black"
                  shadowBlur={4}
                  shadowOpacity={0.1}
                />
                <Text
                  x={zone.position.x + 10}
                  y={zone.position.y + 10}
                  text={zone.name}
                  fontSize={14}
                  fontStyle="bold"
                  fill="#3b82f6"
                />
              </Group>
            ))}

            {/* Cables — только out→in считаются валидными, невалидные рисуем красным */}
            {cables.map(cable => {
              const fromDevice = devices.find(d => d.id === cable.fromDeviceId);
              const toDevice = devices.find(d => d.id === cable.toDeviceId);
              if (!fromDevice || !toDevice) return null;

              const fromPort = [...(fromDevice.portsOut || []), ...(fromDevice.portsIn || [])].find(p => p.id === cable.fromPortId);
              const toPort = [...(toDevice.portsIn || []), ...(toDevice.portsOut || [])].find(p => p.id === cable.toPortId);
              if (!fromPort || !toPort) return null;

              const valid = isConnectionValid(fromDevice, fromPort, toDevice, toPort);
              const fromPortIndex = (fromPort.type === "out" ? fromDevice.portsOut : fromDevice.portsIn)?.findIndex(p => p.id === cable.fromPortId) ?? 0;
              const toPortIndex = (toPort.type === "in" ? toDevice.portsIn : toDevice.portsOut)?.findIndex(p => p.id === cable.toPortId) ?? 0;
              const fromPos = getPortPosition(fromDevice, fromPort, fromPortIndex);
              const toPos = getPortPosition(toDevice, toPort, toPortIndex);

              const isWireless = cable.cableType === "wireless" || fromPort.portType === "Wireless" || toPort.portType === "Wireless";
              const strokeColor = valid ? (isWireless ? "#7c3aed" : "#334155") : "#dc2626";

              return (
                <Line
                  key={cable.id}
                  points={[fromPos.x, fromPos.y + PORT_HEIGHT / 2, toPos.x, toPos.y + PORT_HEIGHT / 2]}
                  stroke={strokeColor}
                  strokeWidth={2.5}
                  lineCap="round"
                  lineJoin="round"
                  dash={isWireless ? [8, 6] : undefined}
                />
              );
            })}

            {/* Devices */}
            {devices.map(device => {
              const deviceHeight = calculateDeviceHeight(device);
              const isSelected = selectedDeviceId === device.id;
              
              return (
                <Group
                  key={device.id}
                  x={device.position.x}
                  y={device.position.y}
                  draggable
                  onDragStart={() => {
                    setDraggedDeviceId(device.id);
                    if (onDeviceSelect) onDeviceSelect(device.id);
                  }}
                  onDragEnd={(e) => {
                    const newPos = {
                      x: e.target.x(),
                      y: e.target.y(),
                    };
                    handleDeviceDragEnd(device.id, newPos);
                    setDraggedDeviceId(null);
                  }}
                  onClick={() => {
                    if (onDeviceSelect) onDeviceSelect(device.id);
                  }}
                >
                  {/* Device body */}
                  <Rect
                    width={DEVICE_WIDTH}
                    height={deviceHeight}
                    fill={isSelected ? "#2563eb" : "#1e293b"}
                    stroke={isSelected ? "#60a5fa" : "#475569"}
                    strokeWidth={isSelected ? 3 : 2}
                    cornerRadius={8}
                    shadowColor="black"
                    shadowBlur={6}
                    shadowOpacity={0.2}
                    shadowOffsetY={2}
                  />

                  {/* Device name */}
                  <Text
                    x={10}
                    y={deviceHeight / 2 - 10}
                    width={DEVICE_WIDTH - 20}
                    text={device.name}
                    fontSize={14}
                    fontStyle="bold"
                    fill="#ffffff"
                    align="center"
                    verticalAlign="middle"
                  />
                  {device.manufacturer && (
                    <Text
                      x={10}
                      y={deviceHeight / 2 + 5}
                      width={DEVICE_WIDTH - 20}
                      text={device.manufacturer}
                      fontSize={10}
                      fill="#9ca3af"
                      align="center"
                    />
                  )}

                  {/* Labels IN / OUT для наглядности, где входы и выходы */}
                  <Text
                    x={4}
                    y={4}
                    text="IN"
                    fontSize={10}
                    fill="#e5e7eb"
                  />
                  <Text
                    x={4}
                    y={deviceHeight - PORT_HEIGHT - 12}
                    text="OUT"
                    fontSize={10}
                    fill="#e5e7eb"
                  />

                  {/* Input ports */}
                  {device.portsIn?.map((port, index) => {
                    const portSpacing = DEVICE_WIDTH / (device.portsIn.length + 1);
                    const portX = (index + 1) * portSpacing - 15; // -15 для центрирования порта
                    const portColor = getPortColor(port.portType);
                    
                    return (
                      <Group key={port.id} x={portX} y={0}>
                        <Rect
                          width={30}
                          height={PORT_HEIGHT}
                          fill={portColor}
                          stroke="#ffffff"
                          strokeWidth={1}
                          cornerRadius={2}
                        />
                        <Text
                          x={2}
                          y={2}
                          width={26}
                          text={port.name}
                          fontSize={8}
                          fill="#ffffff"
                          align="center"
                        />
                      </Group>
                    );
                  })}

                  {/* Output ports */}
                  {device.portsOut?.map((port, index) => {
                    const portSpacing = DEVICE_WIDTH / (device.portsOut.length + 1);
                    const portX = (index + 1) * portSpacing - 15; // -15 для центрирования порта
                    const portY = deviceHeight - PORT_HEIGHT;
                    const portColor = getPortColor(port.portType);
                    
                    return (
                      <Group key={port.id} x={portX} y={portY}>
                        <Rect
                          width={30}
                          height={PORT_HEIGHT}
                          fill={portColor}
                          stroke="#ffffff"
                          strokeWidth={1}
                          cornerRadius={2}
                        />
                        <Text
                          x={2}
                          y={2}
                          width={26}
                          text={port.name}
                          fontSize={8}
                          fill="#ffffff"
                          align="center"
                        />
                      </Group>
                    );
                  })}
                </Group>
              );
            })}
          </Layer>
        </Stage>
      </div>
    </div>
  );
});

