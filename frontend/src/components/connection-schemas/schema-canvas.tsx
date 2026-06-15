import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, Maximize2, Undo2, Redo2, FileImage, FileText } from "lucide-react";
import { SIGNAL_COLOR_PRESET } from "./signal-colors";

interface Port {
  id: string;
  name: string;
  type: "in" | "out";
  portType?: string;
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
  protocol?: string;
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
  /** Режим выделения зоны: пользователь рисует прямоугольник на схеме */
  drawZoneMode?: boolean;
  onZoneDrawn?: (rect: { x: number; y: number; width: number; height: number }) => void;
  onCancelDrawZone?: () => void;
  onZoneSelect?: (zoneId: string | null) => void;
  selectedZoneId?: string | null;
  /** Создание кабеля: от выходного порта к входному */
  onAddConnection?: (from: { deviceId: string; portId: string }, to: { deviceId: string; portId: string }, protocol?: string) => void;
  /** Удаление устройства (правый клик → Удалить) */
  onDeviceDelete?: (deviceId: string) => void;
}

export interface SchemaCanvasRef {
  getViewportCenter: () => { x: number; y: number };
}

const SCENE_WIDTH = 16000;
const SCENE_HEIGHT = 12000;
const DEVICE_WIDTH_MIN = 200;
const DEVICE_WIDTH_DEFAULT = 260;
const PORT_BOX_WIDTH = 30;
const DEVICE_WIDTH_PADDING = 60;
const PORT_ROW_PADDING = 28;
const PORT_BOX_MIN_WIDTH = 34;
const DEVICE_HEIGHT_BASE = 80;
const PORT_HEIGHT = 20;
const PORT_SPACING = 5;
const GRID_STEP = 48;
const CABLE_EXIT_OFFSET = 26;
const CABLE_LABEL_OFFSET = 14;

export const SchemaCanvas = forwardRef<SchemaCanvasRef, SchemaCanvasProps>(function SchemaCanvas({
  schemaId,
  devices,
  zones,
  cables,
  onDeviceUpdate,
  onDeviceSelect,
  selectedDeviceId,
  fullScreen = false,
  drawZoneMode = false,
  onZoneDrawn,
  onCancelDrawZone,
  onZoneSelect,
  selectedZoneId,
  onAddConnection,
  onDeviceDelete,
}, ref) {
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [stageSize, setStageSize] = useState({ w: 800, h: 600 });
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [history, setHistory] = useState<Device[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [dragState, setDragState] = useState<{ deviceId: string; startPos: { x: number; y: number }; offset: { x: number; y: number } } | null>(null);
  const [panState, setPanState] = useState<{ startX: number; startY: number; startPos: { x: number; y: number } } | null>(null);
  const [localPositions, setLocalPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [zoneDrawStart, setZoneDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [zoneDrawCurrent, setZoneDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const [cableDrag, setCableDrag] = useState<{
    fromDeviceId: string;
    fromPortId: string;
    fromPos: { x: number; y: number };
    fromType: "in" | "out";
  } | null>(null);
  const [cableDragCurrent, setCableDragCurrent] = useState<{ x: number; y: number } | null>(null);
  const [hoveredPort, setHoveredPort] = useState<{ deviceId: string; portId: string; type: "in" | "out" } | null>(null);
  const [autoFitted, setAutoFitted] = useState(false);
  const [deviceContextMenu, setDeviceContextMenu] = useState<{ x: number; y: number; deviceId: string } | null>(null);
  const deviceContextMenuRef = useRef<HTMLDivElement>(null);

  const cancelCableDrag = useCallback(() => {
    setCableDrag(null);
    setCableDragCurrent(null);
    setHoveredPort(null);
  }, []);

  useImperativeHandle(ref, () => ({
    getViewportCenter() {
      const cx = (-position.x + stageSize.w / 2) / scale;
      const cy = (-position.y + stageSize.h / 2) / scale;
      return { x: Math.round(cx), y: Math.round(cy) };
    },
  }), [position, scale, stageSize]);

  useEffect(() => {
    if (!deviceContextMenu) return;
    const close = () => setDeviceContextMenu(null);
    const onDocClick = (e: MouseEvent) => {
      if (deviceContextMenuRef.current?.contains(e.target as Node)) return;
      close();
    };
    const t = setTimeout(() => document.addEventListener("click", onDocClick, true), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", onDocClick, true);
    };
  }, [deviceContextMenu]);

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

  const screenToScene = useCallback((clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: (clientX - rect.left - position.x) / scale,
      y: (clientY - rect.top - position.y) / scale,
    };
  }, [position, scale]);

  const handleWheel = useCallback((e: React.WheelEvent | WheelEvent) => {
    e.preventDefault();
    const delta = (e as WheelEvent).deltaY > 0 ? -0.08 : 0.08;
    const newScale = Math.min(3, Math.max(0.4, scale + delta));
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const sceneX = (e.clientX - rect.left - position.x) / scale;
      const sceneY = (e.clientY - rect.top - position.y) / scale;
      setPosition({
        x: e.clientX - rect.left - sceneX * newScale,
        y: e.clientY - rect.top - sceneY * newScale,
      });
    }
    setScale(newScale);
  }, [scale, position]);

  // Зум колёсиком: passive: false чтобы preventDefault срабатывал
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      handleWheel(e);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [handleWheel]);

  const saveToHistory = useCallback((nextDevices: Device[]) => {
    setHistory((prev) => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(JSON.parse(JSON.stringify(nextDevices)));
      setTimeout(() => setHistoryIndex(newHistory.length - 1), 0);
      return newHistory;
    });
  }, [historyIndex]);

  // При смене схемы сбрасываем авто-подгонку, чтобы заново центрировать или «Показать все»
  useEffect(() => {
    setAutoFitted(false);
  }, [schemaId]);

  // Старт с центра холста при пустой схеме; при появлении устройств — «Показать все»
  useEffect(() => {
    if (!devices.length) {
      setAutoFitted(false);
      setPosition({
        x: stageSize.w / 2 - SCENE_WIDTH / 2,
        y: stageSize.h / 2 - SCENE_HEIGHT / 2,
      });
      setScale(1);
      return;
    }
    if (!autoFitted) {
      handleFitAll();
      setAutoFitted(true);
    }
  }, [devices.length, autoFitted, stageSize.w, stageSize.h]);

  const handleDeviceDragEnd = useCallback((deviceId: string, newPosition: { x: number; y: number }) => {
    setLocalPositions((prev) => ({ ...prev, [deviceId]: newPosition }));
    const updatedDevices = devices.map((d) => (d.id === deviceId ? { ...d, position: newPosition } : d));
    saveToHistory(updatedDevices);
    onDeviceUpdate(deviceId, newPosition);
  }, [devices, onDeviceUpdate, saveToHistory]);

  useEffect(() => {
    if (!zoneDrawStart || !onZoneDrawn) return;
    const onMove = (e: PointerEvent) => {
      const scene = screenToScene(e.clientX, e.clientY);
      setZoneDrawCurrent({ x: scene.x, y: scene.y });
    };
    const onUp = (e: PointerEvent) => {
      const scene = screenToScene(e.clientX, e.clientY);
      const x1 = Math.min(zoneDrawStart.x, scene.x);
      const y1 = Math.min(zoneDrawStart.y, scene.y);
      const x2 = Math.max(zoneDrawStart.x, scene.x);
      const y2 = Math.max(zoneDrawStart.y, scene.y);
      const width = Math.max(20, x2 - x1);
      const height = Math.max(20, y2 - y1);
      onZoneDrawn({ x: x1, y: y1, width, height });
      setZoneDrawStart(null);
      setZoneDrawCurrent(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [zoneDrawStart, onZoneDrawn, screenToScene]);

  useEffect(() => {
    if (!cableDrag || !onAddConnection) return;
    const onMove = (e: PointerEvent) => {
      setCableDragCurrent(screenToScene(e.clientX, e.clientY));
    };
    const onUp = (e: PointerEvent) => {
      const scene = screenToScene(e.clientX, e.clientY);
      let connected = false;

      const applyConnection = (targetDeviceId: string, targetPortId: string, targetType: "in" | "out") => {
        if (targetDeviceId === cableDrag.fromDeviceId) return;
        let from = { deviceId: cableDrag.fromDeviceId, portId: cableDrag.fromPortId };
        let to = { deviceId: targetDeviceId, portId: targetPortId };
        if (cableDrag.fromType === "in" && targetType === "out") {
          from = { deviceId: targetDeviceId, portId: targetPortId };
          to = { deviceId: cableDrag.fromDeviceId, portId: cableDrag.fromPortId };
        } else if (!(cableDrag.fromType === "out" && targetType === "in")) {
          return;
        }
        onAddConnection(from, to);
        connected = true;
      };

      const targetType: "in" | "out" = cableDrag.fromType === "out" ? "in" : "out";
      const hitRadius = 26;

      const findPortByScene = () => {
        for (const dev of devices) {
          if (dev.id === cableDrag.fromDeviceId) continue;
          const pos = localPositions[dev.id] ?? dev.position;
          const ports = targetType === "in" ? dev.portsIn || [] : dev.portsOut || [];
          const devH = calculateDeviceHeight(dev);
          const layout = getPortLayout(dev, targetType);
          for (let index = 0; index < ports.length; index++) {
            const portCenterX = pos.x + (layout[index]?.centerX ?? 0);
            const portCenterY =
              targetType === "in"
                ? pos.y + PORT_HEIGHT / 2
                : pos.y + devH - PORT_HEIGHT / 2;
            const dx = scene.x - portCenterX;
            const dy = scene.y - portCenterY;
            if (dx * dx + dy * dy <= hitRadius * hitRadius) {
              return { deviceId: dev.id, portId: ports[index].id, targetType };
            }
          }
        }
        return null;
      };

      const portEl = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("[data-port-device-id]");
      if (portEl) {
        const toDeviceId = portEl.getAttribute?.("data-port-device-id");
        const toPortId = portEl.getAttribute?.("data-port-id");
        const portType = (portEl.getAttribute?.("data-port-type") as "in" | "out" | null) || null;
        if (toDeviceId && toPortId && portType === targetType) {
          applyConnection(toDeviceId, toPortId, portType);
        }
      }
      if (!connected) {
        const hit = findPortByScene();
        if (hit) applyConnection(hit.deviceId, hit.portId, hit.targetType);
      }
      cancelCableDrag();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [cableDrag, onAddConnection, screenToScene, devices, localPositions, cancelCableDrag]);

  useEffect(() => {
    if (!cableDrag) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelCableDrag();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cableDrag, cancelCableDrag]);

  // Глобальное перетаскивание устройств; обновления по requestAnimationFrame для плавности
  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;
  const screenToSceneRef = useRef(screenToScene);
  screenToSceneRef.current = screenToScene;
  useEffect(() => {
    if (!dragState) return;
    let rafId = 0;
    const onMove = (e: PointerEvent) => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const state = dragStateRef.current;
        if (!state) return;
        const scene = screenToSceneRef.current(e.clientX, e.clientY);
        setLocalPositions((prev) => ({
          ...prev,
          [state.deviceId]: {
            x: scene.x - state.offset.x,
            y: scene.y - state.offset.y,
          },
        }));
      });
    };
    const finish = (e: PointerEvent) => {
      if (rafId) cancelAnimationFrame(rafId);
      const state = dragStateRef.current;
      if (!state) return;
      const scene = screenToSceneRef.current(e.clientX, e.clientY);
      const newPos = { x: scene.x - state.offset.x, y: scene.y - state.offset.y };
      handleDeviceDragEnd(state.deviceId, newPos);
      setDragState(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [dragState, handleDeviceDragEnd]);

  // Панорама: используем pointer-события и всегда снимаем при pointerup/pointercancel
  useEffect(() => {
    if (!panState) return;
    const onMove = (e: PointerEvent) => {
      setPosition((prev) => ({
        x: prev.x + (e.clientX - panState.startX),
        y: prev.y + (e.clientY - panState.startY),
      }));
      setPanState((p) => (p ? { ...p, startX: e.clientX, startY: e.clientY } : null));
    };
    const release = () => {
      setPanState(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, [panState]);

  const getPortBoxWidth = (port?: Port): number => {
    const name = (port?.name || "").trim();
    return Math.max(PORT_BOX_MIN_WIDTH, Math.min(140, name.length * 7 + 16));
  };

  const getPortLayout = (device: Device, type: "in" | "out") => {
    const ports = type === "in" ? device.portsIn || [] : device.portsOut || [];
    const widths = ports.map((port) => getPortBoxWidth(port));
    const totalPortsWidth = widths.reduce((sum, width) => sum + width, 0);
    const totalSpacing = Math.max(0, ports.length - 1) * PORT_SPACING;
    const contentWidth = totalPortsWidth + totalSpacing;
    const deviceWidth = getDeviceWidth(device);
    const startX = Math.max(PORT_ROW_PADDING, (deviceWidth - contentWidth) / 2);
    let currentX = startX;
    return ports.map((port, index) => {
      const width = widths[index];
      const layout = { port, x: currentX, width, centerX: currentX + width / 2 };
      currentX += width + PORT_SPACING;
      return layout;
    });
  };

  /** Ширина карточки: из настроек или авто по количеству портов (чтобы все влезали в ряд). */
  const getDeviceWidth = (device: Device): number => {
    const calcRowWidth = (ports: Port[] = []) =>
      ports.reduce((sum, port) => sum + getPortBoxWidth(port), 0) + Math.max(0, ports.length - 1) * PORT_SPACING + PORT_ROW_PADDING * 2;
    const widthFromPorts = Math.max(calcRowWidth(device.portsIn), calcRowWidth(device.portsOut), DEVICE_WIDTH_DEFAULT);
    const customW = device.properties?.width as number | undefined;
    const baseWidth = Math.max(DEVICE_WIDTH_DEFAULT, widthFromPorts);
    if (customW != null && customW >= DEVICE_WIDTH_MIN) return Math.max(customW, baseWidth);
    return baseWidth;
  };
  /** Высота карточки: компактная, не растёт с числом портов (только ширина «длинная»). Один ряд IN, один ряд OUT. */
  const calculateDeviceHeight = (device: Device): number => {
    const customH = device.properties?.height as number | undefined;
    if (customH != null && customH >= DEVICE_HEIGHT_BASE) return customH;
    const hasIn = (device.portsIn?.length ?? 0) > 0;
    const hasOut = (device.portsOut?.length ?? 0) > 0;
    const rows = (hasIn ? 1 : 0) + (hasOut ? 1 : 0) || 1;
    return DEVICE_HEIGHT_BASE + rows * (PORT_HEIGHT + PORT_SPACING);
  };

  const getPortPosition = (device: Device, port: Port, index: number): { x: number; y: number } => {
    const deviceHeight = calculateDeviceHeight(device);
    const pos = localPositions[device.id] ?? device.position;
    const layout = getPortLayout(device, port.type);
    const item = layout[index];
    const portY = port.type === "in" ? pos.y : pos.y + deviceHeight - PORT_HEIGHT;
    const portX = pos.x + (item?.x ?? 0);
    return { x: portX, y: portY };
  };

  const normalizeConnectionType = (value?: string): string => {
    const raw = (value || "").trim().toUpperCase();
    if (!raw) return "";
    const cleaned = raw
      .replace(/\b(INPUT|OUTPUT|IN|OUT|PORT|ПОРТ|ВХОД|ВЫХОД)\b/g, " ")
      .replace(/[#:()[\],]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (cleaned.includes("USB C") || cleaned.includes("USBC") || cleaned.includes("TYPE C")) return "USB-C";
    if (cleaned.includes("DISPLAYPORT") || cleaned === "DP") return "DP";
    if (cleaned.includes("HDMI")) return "HDMI";
    if (cleaned.includes("SDI")) return "SDI";
    if (cleaned.includes("RJ45")) return "RJ45";
    if (cleaned.includes("ETHERNET") || cleaned.includes("ETHERNET")) return "ETH";
    if (cleaned.includes("LAN")) return "LAN";
    if (cleaned.includes("USB")) return "USB";
    if (cleaned.includes("BNC")) return "BNC";
    if (cleaned.includes("XLR")) return "XLR";
    if (cleaned.includes("TRS") || cleaned.includes("JACK")) return "TRS";
    if (cleaned.includes("RCA")) return "RCA";
    if (cleaned.includes("WIRELESS") || cleaned.includes("WIFI") || cleaned.includes("RF")) return "WIRELESS";
    if (cleaned.includes("NDI")) return "NDI";
    if (cleaned.includes("AES")) return "AES";
    if (cleaned.includes("MADI")) return "MADI";
    if (cleaned === "AC" || cleaned.includes("220V")) return "AC";
    if (cleaned.includes("DC")) return "DC";
    return cleaned;
  };

  const getSignalColor = (signal?: string): string => {
    const normalized = normalizeConnectionType(signal);
    return SIGNAL_COLOR_PRESET[normalized] || SIGNAL_COLOR_PRESET.DEFAULT;
  };

  const getCableEndpoints = (
    from: { x: number; y: number },
    to: { x: number; y: number },
    fromType: "in" | "out",
    toType?: "in" | "out",
  ) => {
    return {
      start: {
        x: from.x,
        y: from.y + (fromType === "out" ? CABLE_EXIT_OFFSET : -CABLE_EXIT_OFFSET),
      },
      end: {
        x: to.x,
        y: to.y + (toType ? (toType === "out" ? CABLE_EXIT_OFFSET : -CABLE_EXIT_OFFSET) : 0),
      },
    };
  };

  /**
   * Ортогональный маршрут кабеля с одним углом.
   * Адаптивно: если устройства расположены более горизонтально — сначала горизонталь, потом вертикаль;
   * если более вертикально — сначала вертикаль, потом горизонталь. Линия всегда ровная (без диагоналей).
   */
  const getCablePath = (from: { x: number; y: number }, to: { x: number; y: number }, laneOffset = 0) => {
    const dx = Math.abs(to.x - from.x);
    const dy = Math.abs(to.y - from.y);
    const midX = (from.x + to.x) / 2 + laneOffset;
    const midY = (from.y + to.y) / 2 + laneOffset;
    // Горизонтально далеко — первый отрезок горизонтальный; иначе вертикальный
    if (dx >= dy) {
      return `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`;
    }
    return `M ${from.x} ${from.y} L ${from.x} ${midY} L ${to.x} ${midY} L ${to.x} ${to.y}`;
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
      XLR: "#4b5563",
      TRS: "#4b5563",
      RCA: "#4b5563",
      DP: "#2563eb",
    };
    return colors[normalizeConnectionType(portType)] || "#666666";
  };

  const getSignalCategory = (portType?: string): "video" | "audio" | "network" | "power" | "control" | "other" => {
    const t = normalizeConnectionType(portType);
    if (["HDMI", "SDI", "DP", "DISPLAYPORT"].includes(t)) return "video";
    if (["XLR", "TRS", "RCA", "JACK"].includes(t)) return "audio";
    if (["ETH", "LAN", "RJ45"].includes(t)) return "network";
    if (["DC", "AC"].includes(t)) return "power";
    if (["USB", "USB-C"].includes(t)) return "control";
    return "other";
  };

  const isConnectionValid = (fromPort: Port, toPort: Port): boolean => {
    if (!(fromPort.type === "out" && toPort.type === "in")) return false;
    const catFrom = getSignalCategory(fromPort.portType);
    const catTo = getSignalCategory(toPort.portType);
    if (catFrom === "other" || catTo === "other") return true;
    if (catFrom === catTo) return true;
    // Допускаем USB как универсальный (часто управление/захват)
    if (catFrom === "control" || catTo === "control") return true;
    return false;
  };

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.1, 3));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.1, 0.5));

  const handleFitAll = () => {
    if (!devices.length) return;
    const minX = Math.min(...devices.map((d) => d.position.x));
    const minY = Math.min(...devices.map((d) => d.position.y));
    const maxX = Math.max(...devices.map((d) => d.position.x + getDeviceWidth(d)));
    const maxY = Math.max(...devices.map((d) => d.position.y + calculateDeviceHeight(d)));
    const width = maxX - minX + 100;
    const height = maxY - minY + 100;
    const scaleX = stageSize.w / width;
    const scaleY = stageSize.h / height;
    const newScale = Math.min(scaleX, scaleY, 1);
    setScale(newScale);
    setPosition({ x: -minX * newScale + 50, y: -minY * newScale + 50 });
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      const restored = history[newIndex];
      restored?.forEach((d) => onDeviceUpdate(d.id, d.position));
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      const restored = history[newIndex];
      restored?.forEach((d) => onDeviceUpdate(d.id, d.position));
    }
  };

  const exportToSVG = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const bounds = getExportBounds();
    clone.setAttribute("viewBox", `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);
    clone.setAttribute("width", String(bounds.width));
    clone.setAttribute("height", String(bounds.height));
    const s = new XMLSerializer();
    const str = '<?xml version="1.0" encoding="UTF-8"?>' + s.serializeToString(clone);
    const blob = new Blob([str], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.download = `schema-${schemaId}.svg`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Экспорт выполнен", description: "Схема экспортирована в SVG (вектор)" });
  };

  const exportToPNG = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const bounds = getExportBounds();
    clone.setAttribute("viewBox", `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);
    clone.setAttribute("width", String(bounds.width));
    clone.setAttribute("height", String(bounds.height));
    const svgData = new XMLSerializer().serializeToString(clone);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1200, Math.round(bounds.width * 2));
    canvas.height = Math.max(800, Math.round(bounds.height * 2));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>${svgData}`], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.download = `schema-${schemaId}.png`;
      a.href = dataUrl;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Экспорт выполнен", description: "Схема экспортирована в PNG" });
    };
    img.src = url;
  };

  const exportToPDF = async () => {
    const svg = svgRef.current;
    if (!svg) return;
    try {
      const { default: jsPDF } = await import("jspdf");
      const clone = svg.cloneNode(true) as SVGSVGElement;
      const bounds = getExportBounds();
      clone.setAttribute("viewBox", `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);
      clone.setAttribute("width", String(bounds.width));
      clone.setAttribute("height", String(bounds.height));
      const svgData = new XMLSerializer().serializeToString(clone);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1600, Math.round(bounds.width * 2));
      canvas.height = Math.max(900, Math.round(bounds.height * 2));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const img = new Image();
      const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>${svgData}`], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve();
        };
        img.onerror = reject;
        img.src = url;
      });
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL("image/png");
      const pdf = new jsPDF("landscape", "mm", "a4");
      const imgWidth = 297;
      const imgHeight = (canvas.height / canvas.width) * imgWidth;
      pdf.addImage(dataUrl, "PNG", 0, 0, imgWidth, imgHeight);
      pdf.save(`schema-${schemaId}.pdf`);
      toast({ title: "Экспорт выполнен", description: "Схема экспортирована в PDF" });
    } catch (e) {
      toast({ title: "Ошибка", description: "Не удалось экспортировать в PDF", variant: "destructive" });
    }
  };

  const getDevicePosition = (device: Device) => localPositions[device.id] ?? device.position;

  const getExportBounds = () => {
    if (!devices.length && !zones.length) {
      return { x: 0, y: 0, width: stageSize.w || 1920, height: stageSize.h || 1080 };
    }

    const deviceLeft = devices.map((d) => getDevicePosition(d).x);
    const deviceTop = devices.map((d) => getDevicePosition(d).y);
    const deviceRight = devices.map((d) => getDevicePosition(d).x + getDeviceWidth(d));
    const deviceBottom = devices.map((d) => getDevicePosition(d).y + calculateDeviceHeight(d));

    const zoneLeft = zones.map((z) => z.position.x);
    const zoneTop = zones.map((z) => z.position.y);
    const zoneRight = zones.map((z) => z.position.x + z.width);
    const zoneBottom = zones.map((z) => z.position.y + z.height);

    const minX = Math.min(...deviceLeft, ...zoneLeft, 0) - 80;
    const minY = Math.min(...deviceTop, ...zoneTop, 0) - 80;
    const maxX = Math.max(...deviceRight, ...zoneRight, stageSize.w || 0) + 80;
    const maxY = Math.max(...deviceBottom, ...zoneBottom, stageSize.h || 0) + 80;

    return {
      x: Math.max(0, minX),
      y: Math.max(0, minY),
      width: Math.max(800, maxX - minX),
      height: Math.max(450, maxY - minY),
    };
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-2 border-b bg-white dark:bg-slate-900">
        <div className="flex items-center gap-1 border-r pr-2 mr-2">
          <Button variant="ghost" size="sm" onClick={handleZoomIn} title="Увеличить (или колёсико мыши)">
            <ZoomIn className="w-4 h-4 mr-0.5" />
            <span className="text-xs">+</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={handleZoomOut} title="Уменьшить">
            <ZoomOut className="w-4 h-4 mr-0.5" />
            <span className="text-xs">−</span>
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
          <Button variant="ghost" size="sm" onClick={exportToSVG} title="Экспорт SVG (вектор)">
            <FileText className="w-4 h-4 mr-1" />
            SVG
          </Button>
          <Button variant="ghost" size="sm" onClick={exportToPNG} title="Экспорт PNG">
            <FileImage className="w-4 h-4 mr-1" />
            PNG
          </Button>
          <Button variant="ghost" size="sm" onClick={exportToPDF} title="Экспорт PDF">
            <FileText className="w-4 h-4 mr-1" />
            PDF
          </Button>
        </div>
      </div>

      {!fullScreen && (
        <p className="text-xs text-muted-foreground px-2 py-1 border-b bg-muted/30">
          Соединяйте выход (out) с входом (in). Векторная графика — масштабирование без потери качества.
        </p>
      )}
      {drawZoneMode && (
        <div className="flex items-center justify-between gap-2 text-xs font-medium text-primary px-2 py-1.5 border-b bg-primary/10">
          <span>Выделите область на схеме: нажмите и протяните мышь.</span>
          {onCancelDrawZone && (
            <Button type="button" variant="ghost" size="sm" className="h-7 text-primary" onClick={onCancelDrawZone}>
              Отмена
            </Button>
          )}
        </div>
      )}
      {cableDrag && (
        <div className="flex items-center justify-between gap-2 text-xs font-medium text-sky-200 px-2 py-1.5 border-b bg-sky-950/70">
          <span>Соединение активно. Нажмите `Esc` или кнопку справа, чтобы отменить линию.</span>
          <Button type="button" variant="ghost" size="sm" className="h-7 text-sky-200" onClick={cancelCableDrag}>
            Отменить линию
          </Button>
        </div>
      )}

      <div
        ref={containerRef}
        className={fullScreen ? "flex-1 min-h-0 w-full overflow-hidden" : "flex-1 min-h-[400px] bg-slate-100 dark:bg-slate-900 overflow-hidden"}
        style={{ touchAction: "none", willChange: "transform" }}
      >
        <div
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: "0 0",
            width: SCENE_WIDTH,
            height: SCENE_HEIGHT,
            cursor: panState ? "grabbing" : dragState ? "grabbing" : "default",
          }}
          onPointerDown={(e) => {
            if ((e.target as SVGElement).closest("[data-device-id]")) return;
            if ((e.target as SVGElement).closest("[data-zone-id]")) return;
            e.preventDefault();
            const scene = screenToScene(e.clientX, e.clientY);
            if (drawZoneMode && onZoneDrawn) {
              setZoneDrawStart({ x: scene.x, y: scene.y });
              setZoneDrawCurrent({ x: scene.x, y: scene.y });
            } else {
              onZoneSelect?.(null);
              onDeviceSelect?.(null);
              setPanState({ startX: e.clientX, startY: e.clientY, startPos: { ...position } });
            }
          }}
        >
          <svg
            ref={svgRef}
            width={SCENE_WIDTH}
            height={SCENE_HEIGHT}
            viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`}
            className="select-none"
            style={{ display: "block" }}
          >
            <defs>
              <pattern id="grid" width={GRID_STEP} height={GRID_STEP} patternUnits="userSpaceOnUse">
                <path d={`M ${GRID_STEP} 0 L 0 0 0 ${GRID_STEP}`} fill="none" stroke="rgba(148, 163, 184, 0.2)" strokeWidth="0.5" />
              </pattern>
              <style>{`@keyframes cable-signal { to { stroke-dashoffset: -24; } }`}</style>
            </defs>
            <rect width={SCENE_WIDTH} height={SCENE_HEIGHT} fill="url(#grid)" />
            <rect width={SCENE_WIDTH} height={SCENE_HEIGHT} fill="transparent" style={{ pointerEvents: "none" }} />

            {/* Превью зоны при выделении на карте */}
            {drawZoneMode && zoneDrawStart && zoneDrawCurrent && (
              <rect
                x={Math.min(zoneDrawStart.x, zoneDrawCurrent.x)}
                y={Math.min(zoneDrawStart.y, zoneDrawCurrent.y)}
                width={Math.abs(zoneDrawCurrent.x - zoneDrawStart.x)}
                height={Math.abs(zoneDrawCurrent.y - zoneDrawStart.y)}
                fill="rgba(59, 130, 246, 0.2)"
                stroke="#3b82f6"
                strokeWidth={2}
                strokeDasharray="6 4"
                rx={4}
              />
            )}

            {zones.map((zone) => {
              const isSelected = selectedZoneId === zone.id;
              return (
                <g
                  key={zone.id}
                  data-zone-id={zone.id}
                  style={{ cursor: onZoneSelect && !drawZoneMode ? "pointer" : "default" }}
                  onClick={() => !drawZoneMode && onZoneSelect?.(zone.id)}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (!drawZoneMode) onZoneSelect?.(zone.id);
                  }}
                >
                  <rect
                    x={zone.position.x}
                    y={zone.position.y}
                    width={zone.width}
                    height={zone.height}
                    fill={zone.color || "rgba(59, 130, 246, 0.08)"}
                    fillOpacity={1}
                    stroke={String(zone.color || "#3b82f6").startsWith("rgba") ? String(zone.color).replace(/,\s*0\.\d+\)/, ", 0.75)") : (zone.color || "#3b82f6")}
                    strokeWidth={isSelected ? 4 : 2}
                    strokeDasharray="12 10"
                    rx={6}
                  />
                  <text x={zone.position.x + 14} y={zone.position.y + 24} fontSize={15} fontWeight="bold" fill="#cbd5e1" pointerEvents="none">
                    {zone.name}
                  </text>
                </g>
              );
            })}

            {devices.map((device) => {
              const deviceWidth = getDeviceWidth(device);
              const deviceHeight = calculateDeviceHeight(device);
              const pos = getDevicePosition(device);
              const isSelected = selectedDeviceId === device.id;
              return (
                <g
                  key={device.id}
                  data-device-id={device.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  style={{ cursor: dragState?.deviceId === device.id ? "grabbing" : "grab" }}
                  onPointerDown={(e) => {
                    if (drawZoneMode) return;
                    if ((e.target as SVGElement).closest?.("[data-port-id]")) return;
                    e.stopPropagation();
                    const scene = screenToScene(e.clientX, e.clientY);
                    setDragState({
                      deviceId: device.id,
                      startPos: { ...pos },
                      offset: { x: scene.x - pos.x, y: scene.y - pos.y },
                    });
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDeviceContextMenu({ x: e.clientX, y: e.clientY, deviceId: device.id });
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <rect
                    width={deviceWidth}
                    height={deviceHeight}
                    fill={isSelected ? "#2563eb" : "#1e293b"}
                    stroke={isSelected ? "#60a5fa" : "#475569"}
                    strokeWidth={isSelected ? 3 : 2}
                    rx={8}
                  />
                  <text
                    x={deviceWidth / 2}
                    y={deviceHeight / 2 - 4}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={14}
                    fontWeight="bold"
                    fill="#fff"
                  >
                    {device.name}
                  </text>
                  {(device.properties?.consideredModel || device.model || device.manufacturer) && (
                    <text
                      x={deviceWidth / 2}
                      y={deviceHeight / 2 + 12}
                      textAnchor="middle"
                      fontSize={10}
                      fill="#9ca3af"
                    >
                      {String(device.properties?.consideredModel || device.model || device.manufacturer).slice(0, 42)}
                    </text>
                  )}
                  <text x={4} y={14} fontSize={10} fill="#e5e7eb">
                    IN
                  </text>
                  <text x={4} y={deviceHeight - PORT_HEIGHT - 4} fontSize={10} fill="#e5e7eb">
                    OUT
                  </text>
                  {getPortLayout(device, "in").map(({ port, x: portX, width: portWidth, centerX }, index) => {
                    const fill = getPortColor(port.portType);
                    const isHovered = hoveredPort?.deviceId === device.id && hoveredPort?.portId === port.id && hoveredPort?.type === "in";
                    return (
                      <g
                        key={port.id}
                        transform={`translate(${portX}, 0)`}
                        data-port-device-id={device.id}
                        data-port-id={port.id}
                        data-port-type="in"
                        onPointerDown={(e) => {
                          if (drawZoneMode || !onAddConnection) return;
                          e.stopPropagation();
                          const portCenterScene = {
                            x: pos.x + centerX,
                            y: pos.y + PORT_HEIGHT / 2,
                          };
                          setCableDrag({
                            fromDeviceId: device.id,
                            fromPortId: port.id,
                            fromPos: { x: portCenterScene.x - portWidth / 2, y: portCenterScene.y - PORT_HEIGHT / 2 },
                            fromType: "in",
                          });
                          setCableDragCurrent(portCenterScene);
                        }}
                        onPointerEnter={() => setHoveredPort({ deviceId: device.id, portId: port.id, type: "in" })}
                        onPointerLeave={() => setHoveredPort((p) => (p?.portId === port.id ? null : p))}
                        style={{ cursor: cableDrag ? "crosshair" : "default" }}
                      >
                        <rect width={portWidth} height={PORT_HEIGHT} fill={fill} stroke="#fff" strokeWidth={1} rx={2} />
                        {isHovered && !cableDrag && (
                          <circle cx={portWidth / 2} cy={PORT_HEIGHT / 2} r={6} fill="none" stroke="#3b82f6" strokeWidth={2} strokeDasharray="3 2" />
                        )}
                        <text x={portWidth / 2} y={PORT_HEIGHT / 2} textAnchor="middle" dominantBaseline="middle" fontSize={7} fill="#fff" pointerEvents="none" title={port.name}>
                          {port.name || ""}
                        </text>
                      </g>
                    );
                  })}
                  {getPortLayout(device, "out").map(({ port, x: portX, width: portWidth, centerX }, index) => {
                    const portY = deviceHeight - PORT_HEIGHT;
                    const fill = getPortColor(port.portType);
                    const isHovered = hoveredPort?.deviceId === device.id && hoveredPort?.portId === port.id && hoveredPort?.type === "out";
                    const portCenterScene = {
                      x: pos.x + centerX,
                      y: pos.y + deviceHeight - PORT_HEIGHT / 2,
                    };
                    return (
                      <g
                        key={port.id}
                        transform={`translate(${portX}, ${portY})`}
                        data-port-device-id={device.id}
                        data-port-id={port.id}
                        data-port-type="out"
                        onPointerDown={(e) => {
                          if (drawZoneMode || !onAddConnection) return;
                          e.stopPropagation();
                          setCableDrag({
                            fromDeviceId: device.id,
                            fromPortId: port.id,
                            fromPos: { x: portCenterScene.x - portWidth / 2, y: portCenterScene.y - PORT_HEIGHT / 2 },
                            fromType: "out",
                          });
                          setCableDragCurrent(portCenterScene);
                        }}
                        onPointerEnter={() => setHoveredPort({ deviceId: device.id, portId: port.id, type: "out" })}
                        onPointerLeave={() => setHoveredPort((p) => (p?.portId === port.id ? null : p))}
                        style={{ cursor: cableDrag ? "crosshair" : "crosshair" }}
                        title="Потяните для соединения с входом"
                      >
                        <rect width={portWidth} height={PORT_HEIGHT} fill={fill} stroke="#fff" strokeWidth={1} rx={2} />
                        {isHovered && !cableDrag && (
                          <circle cx={portWidth / 2} cy={PORT_HEIGHT / 2} r={6} fill="none" stroke="#3b82f6" strokeWidth={2} strokeDasharray="3 2" />
                        )}
                        <text x={portWidth / 2} y={PORT_HEIGHT / 2} textAnchor="middle" dominantBaseline="middle" fontSize={7} fill="#fff" pointerEvents="none" title={port.name}>
                          {port.name || ""}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {/* Кабели поверх устройств — линия и анимация сигнала видны */}
            {cableDrag && cableDragCurrent && (
              (() => {
                const startPoint = {
                  x: cableDrag.fromPos.x + 15,
                  y: cableDrag.fromPos.y + PORT_HEIGHT / 2,
                };
                const endPoint = {
                  x: cableDragCurrent.x,
                  y: cableDragCurrent.y,
                };
                const endpoints = getCableEndpoints(startPoint, endPoint, cableDrag.fromType);
                return (
                  <>
                    <path
                      d={`M ${startPoint.x} ${startPoint.y} L ${endpoints.start.x} ${endpoints.start.y}`}
                      stroke="#60a5fa"
                      strokeWidth={4}
                      strokeLinecap="round"
                      fill="none"
                    />
                    <path
                      d={getCablePath(endpoints.start, endpoints.end)}
                      stroke="#60a5fa"
                      strokeWidth={4}
                      strokeLinecap="round"
                      fill="none"
                    />
                    <path
                      d={`M ${endpoints.end.x} ${endpoints.end.y} L ${endPoint.x} ${endPoint.y}`}
                      stroke="#60a5fa"
                      strokeWidth={4}
                      strokeLinecap="round"
                      fill="none"
                    />
                  </>
                );
              })()
            )}

            {cables.map((cable, cableIndex) => {
              const fromDevice = devices.find((d) => d.id === cable.fromDeviceId);
              const toDevice = devices.find((d) => d.id === cable.toDeviceId);
              if (!fromDevice || !toDevice) return null;
              const fromPort =
                [...(fromDevice.portsOut || []), ...(fromDevice.portsIn || [])].find((p) => p.id === cable.fromPortId) ||
                (fromDevice.portsOut?.length ? fromDevice.portsOut[0] : fromDevice.portsIn?.[0]);
              const toPort =
                [...(toDevice.portsIn || []), ...(toDevice.portsOut || [])].find((p) => p.id === cable.toPortId) ||
                (toDevice.portsIn?.length ? toDevice.portsIn[0] : toDevice.portsOut?.[0]);
              if (!fromPort || !toPort) return null;
              const valid = isConnectionValid(fromPort, toPort);
              const fromIdx = (fromPort.type === "out" ? fromDevice.portsOut : fromDevice.portsIn)?.findIndex((p) => p.id === fromPort.id) ?? 0;
              const toIdx = (toPort.type === "in" ? toDevice.portsIn : toDevice.portsOut)?.findIndex((p) => p.id === toPort.id) ?? 0;
              const fromPos = getPortPosition(fromDevice, fromPort, fromIdx);
              const toPos = getPortPosition(toDevice, toPort, toIdx);
              const isWireless = cable.cableType === "wireless" || fromPort.portType === "Wireless" || toPort.portType === "Wireless";
              const startPoint = { x: fromPos.x + 15, y: fromPos.y + PORT_HEIGHT / 2 };
              const endPoint = { x: toPos.x + 15, y: toPos.y + PORT_HEIGHT / 2 };
              const endpoints = getCableEndpoints(startPoint, endPoint, fromPort.type, toPort.type);
              const laneOffset = ((cableIndex % 11) - 5) * 18;
              const pathD = getCablePath(endpoints.start, endpoints.end, laneOffset);
              const dx = Math.abs(endpoints.end.x - endpoints.start.x);
              const dy = Math.abs(endpoints.end.y - endpoints.start.y);
              const midX = dx >= dy ? (endpoints.start.x + endpoints.end.x) / 2 + laneOffset : (startPoint.x + endPoint.x) / 2;
              const midY = dx >= dy ? (startPoint.y + endPoint.y) / 2 : (endpoints.start.y + endpoints.end.y) / 2 + laneOffset;
              const protocolLabel = cable.protocol || cable.cableType || fromPort.portType;
              const signalColor = getSignalColor(protocolLabel || fromPort.portType || toPort.portType);
              const stroke = valid ? signalColor : "#dc2626";
              return (
                <g key={cable.id}>
                  <path
                    d={`M ${startPoint.x} ${startPoint.y} L ${endpoints.start.x} ${endpoints.start.y}`}
                    stroke={stroke}
                    strokeWidth={3.5}
                    strokeLinecap="round"
                    strokeDasharray={isWireless ? "8 6" : undefined}
                    fill="none"
                  />
                  <path
                    d={pathD}
                    stroke={stroke}
                    strokeWidth={3.5}
                    strokeLinecap="round"
                    strokeDasharray={isWireless ? "8 6" : undefined}
                    fill="none"
                  />
                  <path
                    d={`M ${endpoints.end.x} ${endpoints.end.y} L ${endPoint.x} ${endPoint.y}`}
                    stroke={stroke}
                    strokeWidth={3.5}
                    strokeLinecap="round"
                    strokeDasharray={isWireless ? "8 6" : undefined}
                    fill="none"
                  />
                  {valid && !isWireless && (
                    <path
                      d={pathD}
                      stroke={signalColor}
                      strokeWidth={5}
                      strokeLinecap="round"
                      strokeDasharray="9 16"
                      strokeDashoffset="0"
                      opacity={0.55}
                      style={{ animation: "cable-signal 1.2s linear infinite" }}
                      fill="none"
                    />
                  )}
                  {protocolLabel && (
                    <text
                      x={midX}
                      y={midY - CABLE_LABEL_OFFSET}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={10}
                      fill={signalColor}
                      fillOpacity={0.95}
                      stroke="rgba(15, 23, 42, 0.92)"
                      strokeWidth={4}
                      paintOrder="stroke"
                    >
                      {protocolLabel}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      {deviceContextMenu && (
        <div
          ref={deviceContextMenuRef}
          className="fixed z-[100] min-w-[180px] rounded-lg border border-slate-600 bg-slate-800 py-1 shadow-xl"
          style={{ left: deviceContextMenu.x, top: deviceContextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700"
            onClick={() => {
              onDeviceSelect?.(deviceContextMenu.deviceId);
              setDeviceContextMenu(null);
            }}
          >
            Редактировать (размер, текст, входы)
          </button>
          {onDeviceDelete && (
            <button
              type="button"
              className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-700"
              onClick={() => {
                onDeviceDelete(deviceContextMenu.deviceId);
                setDeviceContextMenu(null);
              }}
            >
              Удалить устройство
            </button>
          )}
        </div>
      )}
    </div>
  );
});
