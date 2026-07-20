import { useState, useRef, useEffect, useMemo, useCallback, forwardRef, useImperativeHandle } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, Maximize2, Undo2, Redo2, FileImage, FileText } from "lucide-react";
import { CONNECTOR_STYLES, connectorCategory, normalizeConnectorCode } from "./signal-colors";
import { ConnectorIconDefs } from "./connector-icons";
import { SchemaDevice, type PortDragState } from "./schema-device";
import { checkConnectorCompatibility } from "./signal-compatibility";
import { categoryColor } from "./category-colors";
import {
  PORT_PILL_HEIGHT,
  deviceSize,
  findPortLayout,
  hitTestPort,
  portDirection,
  type PositionedPort,
} from "./schema-geometry";
import {
  pointsToPath,
  polylineMidpoint,
  routeCables,
  type RouteRequest,
} from "./schema-routing";
import { ZONE_STATUS_META, ZONE_STATUS_ORDER, zoneStatusColor } from "@/lib/zone-status";
import { cn } from "@/lib/utils";

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
  /** Вершины произвольного контура (в координатах сцены). Если заданы — зона рисуется полигоном. */
  points?: { x: number; y: number }[];
  /** ID ответственного за зону — для отметки «моих» зон у работника. */
  assigneeId?: string;
  /** Статус зоны — определяет цвет заливки и особую подсветку «Проблемы». */
  status?: string;
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
  /** Режим выделения зоны: пользователь рисует произвольный контур кликами */
  drawZoneMode?: boolean;
  onZoneDrawn?: (zone: { x: number; y: number; width: number; height: number; points: { x: number; y: number }[] }) => void;
  onCancelDrawZone?: () => void;
  onZoneSelect?: (zoneId: string | null) => void;
  selectedZoneId?: string | null;
  /** ID текущего пользователя — зоны, назначенные ему, помечаются на схеме. */
  currentUserId?: string;
  /** Удаление зоны (правый клик → Удалить) */
  onZoneDelete?: (zoneId: string) => void;
  /** Создание кабеля: от выходного порта к входному */
  onAddConnection?: (from: { deviceId: string; portId: string }, to: { deviceId: string; portId: string }, protocol?: string) => void;
  /** Удаление кабеля (двойной клик по связи) */
  onDeleteConnection?: (cable: Cable) => void;
  /** Удаление устройства (правый клик → Удалить) */
  onDeviceDelete?: (deviceId: string) => void;
  /** ID компонентов с ошибками валидации — для красной подсветки на холсте. */
  validationComponentIds?: string[];
  /**
   * Категории сигналов, оставленные чипами-фильтрами («video», «audio», …). Остальные
   * приглушаются, но не скрываются — иначе легко решить, что связи просто нет.
   * Пустой массив или undefined — фильтр не применён.
   */
  activeCategories?: string[] | null;
}

export interface SchemaCanvasRef {
  getViewportCenter: () => { x: number; y: number } | null;
  isReady: () => boolean;
}

/** Порядок наложения зон: выделенная — выше «Проблемы», «Проблема» — выше обычных. */
function zoneStackRank(zone: Zone, selectedZoneId?: string | null): number {
  if (zone.id === selectedZoneId) return 2;
  if ((zone.status || "not_started") === "problem") return 1;
  return 0;
}

const SCENE_WIDTH = 16000;
const SCENE_HEIGHT = 12000;
/** Габариты-заглушки, когда устройство не найдено (размеры реальных карточек — в schema-geometry). */
const DEVICE_WIDTH_DEFAULT = 260;
const DEVICE_HEIGHT_BASE = 96;
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
  currentUserId,
  onZoneDelete,
  onAddConnection,
  onDeleteConnection,
  onDeviceDelete,
  validationComponentIds,
  activeCategories,
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
  const [draggingDeviceId, setDraggingDeviceId] = useState<string | null>(null);
  const [panState, setPanState] = useState<{ startX: number; startY: number; startPos: { x: number; y: number } } | null>(null);
  const [localPositions, setLocalPositions] = useState<Record<string, { x: number; y: number }>>({});
  // Полигон зоны, рисуемый последовательными кликами (замыкается кликом по первой вершине)
  const [zonePoints, setZonePoints] = useState<{ x: number; y: number }[]>([]);
  const [zoneCursor, setZoneCursor] = useState<{ x: number; y: number } | null>(null);
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
  const [zoneContextMenu, setZoneContextMenu] = useState<{ x: number; y: number; zoneId: string } | null>(null);
  const deviceContextMenuRef = useRef<HTMLDivElement>(null);
  const zoneContextMenuRef = useRef<HTMLDivElement>(null);
  const [stageReady, setStageReady] = useState(false);

  const cancelCableDrag = useCallback(() => {
    setCableDrag(null);
    setCableDragCurrent(null);
    setHoveredPort(null);
  }, []);

  useImperativeHandle(ref, () => ({
    getViewportCenter() {
      if (!stageReady) return null;
      const cx = (-position.x + stageSize.w / 2) / scale;
      const cy = (-position.y + stageSize.h / 2) / scale;
      return { x: Math.round(cx), y: Math.round(cy) };
    },
    isReady() {
      return stageReady;
    },
  }), [position, scale, stageSize, stageReady]);

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
    if (!zoneContextMenu) return;
    const close = () => setZoneContextMenu(null);
    const onDocClick = (e: MouseEvent) => {
      if (zoneContextMenuRef.current?.contains(e.target as Node)) return;
      close();
    };
    const t = setTimeout(() => document.addEventListener("click", onDocClick, true), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", onDocClick, true);
    };
  }, [zoneContextMenu]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      setStageSize({ w: el.clientWidth || 800, h: Math.max(el.clientHeight || 600, 400) });
      setStageReady(true);
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

  // Старт с центра холста при пустой схеме; при устройствах — «Показать все»
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

  /** Проверяет, пересекается ли прямоугольник с каким-либо устройством (кроме исключённого). */
  const checkDeviceCollision = (
    deviceId: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): boolean => {
    const PADDING = 4;
    for (const d of devices) {
      if (d.id === deviceId) continue;
      const dw = getDeviceWidth(d);
      const dh = calculateDeviceHeight(d);
      const dp = localPositions[d.id] ?? d.position;
      const overlapX = x < dp.x + dw + PADDING && x + w + PADDING > dp.x;
      const overlapY = y < dp.y + dh + PADDING && y + h + PADDING > dp.y;
      if (overlapX && overlapY) return true;
    }
    return false;
  };

  /** Находит позицию без коллизий рядом с целевой. */
  const findNonCollidingPosition = (
    deviceId: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): { x: number; y: number } => {
    if (!checkDeviceCollision(deviceId, x, y, w, h)) return { x, y };
    const step = 20;
    // Спираль наружу
    for (let r = step; r <= 200; r += step) {
      for (const dx of [-r, r]) {
        for (const dy of [-r, r]) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (!checkDeviceCollision(deviceId, nx, ny, w, h)) return { x: nx, y: ny };
        }
      }
    }
    return { x, y };
  };

  const handleDeviceDragEnd = useCallback((deviceId: string, newPosition: { x: number; y: number }) => {
    const device = devices.find((d) => d.id === deviceId);
    const w = device ? getDeviceWidth(device) : DEVICE_WIDTH_DEFAULT;
    const h = device ? calculateDeviceHeight(device) : DEVICE_HEIGHT_BASE;
    const clamped = {
      x: Math.max(0, Math.min(SCENE_WIDTH - w, newPosition.x)),
      y: Math.max(0, Math.min(SCENE_HEIGHT - h, newPosition.y)),
    };
    // Находим позицию без коллизий
    const finalPos = findNonCollidingPosition(deviceId, clamped.x, clamped.y, w, h);
    setLocalPositions((prev) => ({ ...prev, [deviceId]: finalPos }));
    const updatedDevices = devices.map((d) => (d.id === deviceId ? { ...d, position: finalPos } : d));
    saveToHistory(updatedDevices);
    onDeviceUpdate(deviceId, finalPos);
  }, [devices, onDeviceUpdate, saveToHistory]);

  // Порог замыкания контура (в пикселях экрана) → в координатах сцены зависит от масштаба
  const ZONE_CLOSE_PX = 12;

  /** Завершает полигон: передаёт вершины и их габаритный прямоугольник, открывает окно названия. */
  const finishZonePolygon = useCallback((points: { x: number; y: number }[]) => {
    if (points.length < 3 || !onZoneDrawn) return;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const width = Math.max(20, Math.max(...xs) - x);
    const height = Math.max(20, Math.max(...ys) - y);
    onZoneDrawn({ x, y, width, height, points: points.map((p) => ({ x: p.x, y: p.y })) });
    setZonePoints([]);
    setZoneCursor(null);
  }, [onZoneDrawn]);

  /** Клик в режиме выделения: ставит вершину либо замыкает контур по первой точке. */
  const handleZoneClick = (scene: { x: number; y: number }) => {
    if (zonePoints.length >= 3) {
      const first = zonePoints[0];
      const threshold = ZONE_CLOSE_PX / scale;
      if (Math.hypot(scene.x - first.x, scene.y - first.y) <= threshold) {
        finishZonePolygon(zonePoints);
        return;
      }
    }
    setZonePoints((prev) => [...prev, scene]);
  };

  // Выход из режима выделения — сбрасываем незавершённый полигон
  useEffect(() => {
    if (!drawZoneMode) {
      setZonePoints([]);
      setZoneCursor(null);
    }
  }, [drawZoneMode]);

  // Esc отменяет текущий полигон и выходит из режима выделения
  useEffect(() => {
    if (!drawZoneMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        // См. отмену протягивания кабеля: Esc гасим, чтобы страница не вышла из полного экрана.
        e.stopPropagation();
        setZonePoints([]);
        setZoneCursor(null);
        onCancelDrawZone?.();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [drawZoneMode, onCancelDrawZone]);

  useEffect(() => {
    if (!cableDrag || !onAddConnection) return;
    const onMove = (e: PointerEvent) => {
      setCableDragCurrent(screenToScene(e.clientX, e.clientY));
    };
    const onUp = (e: PointerEvent) => {
      const scene = screenToScene(e.clientX, e.clientY);
      let connected = false;

      const applyConnection = (targetDeviceId: string, targetPortId: string, targetType: "in" | "out") => {
        if (targetDeviceId === cableDrag.fromDeviceId) {
          toast({ title: "Связь не создана", description: "Нельзя соединить устройство с самим собой.", variant: "destructive" });
          connected = true;
          return;
        }
        let from = { deviceId: cableDrag.fromDeviceId, portId: cableDrag.fromPortId };
        let to = { deviceId: targetDeviceId, portId: targetPortId };
        if (cableDrag.fromType === "in" && targetType === "out") {
          from = { deviceId: targetDeviceId, portId: targetPortId };
          to = { deviceId: cableDrag.fromDeviceId, portId: cableDrag.fromPortId };
        } else if (!(cableDrag.fromType === "out" && targetType === "in")) {
          const dirFrom = cableDrag.fromType === "in" ? "вход" : "выход";
          const dirTo = targetType === "in" ? "вход" : "выход";
          toast({ title: "Связь не создана", description: `Нельзя соединять ${dirFrom} с ${dirTo}. Сигнал должен идти от выхода ко входу.`, variant: "destructive" });
          connected = true;
          return;
        }

        // Типы разъёмов: видео не переходит в аудио, питание не смешивается с сигналом.
        const findPort = (deviceId: string, portId: string) => {
          const device = devices.find((d) => d.id === deviceId);
          if (!device) return undefined;
          return [...(device.portsOut || []), ...(device.portsIn || [])].find((p) => p.id === portId);
        };
        const compatibility = checkConnectorCompatibility(
          findPort(from.deviceId, from.portId)?.portType,
          findPort(to.deviceId, to.portId)?.portType,
        );
        if (!compatibility.ok) {
          toast({ title: "Связь не создана", description: compatibility.reason, variant: "destructive" });
          connected = true;
          return;
        }

        onAddConnection(from, to);
        connected = true;
      };

      const targetType: "in" | "out" = cableDrag.fromType === "out" ? "in" : "out";

      /**
       * Запасной поиск порта — по прямоугольнику пилюли, а не по радиусу вокруг точки крепления.
       * Срабатывает, когда elementFromPoint вернул не порт: поверх карточек лежит широкий
       * прозрачный слой кабелей, перехватывающий клики.
       *
       * Ищем ЛЮБОЙ порт, включая «неправильные» — своё же устройство и совпадающее направление.
       * Раньше они отсеивались здесь, и попытка соединить вход со входом просто ничего не делала:
       * пользователь не понимал, промахнулся он или так нельзя. Решение о допустимости принимает
       * applyConnection — он же и объясняет отказ.
       */
      const findPortByScene = () => {
        for (const dev of devices) {
          const pos = localPositions[dev.id] ?? dev.position;
          const hit = hitTestPort(dev, pos, scene);
          if (!hit) continue;
          // Возврат на тот же порт, с которого начали — это отмена, а не ошибка.
          if (dev.id === cableDrag.fromDeviceId && hit.port.id === cableDrag.fromPortId) return null;
          return { deviceId: dev.id, portId: hit.port.id, targetType: hit.port.type };
        }
        return null;
      };

      const portEl = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("[data-port-device-id]");
      if (portEl) {
        const toDeviceId = portEl.getAttribute?.("data-port-device-id");
        const toPortId = portEl.getAttribute?.("data-port-id");
        const portType = (portEl.getAttribute?.("data-port-type") as "in" | "out" | null) || null;
        // Направление здесь не проверяем: разбор и объяснение отказа — задача applyConnection,
        // иначе недопустимый сброс выглядит как промах мимо порта.
        const sameOrigin = toDeviceId === cableDrag.fromDeviceId && toPortId === cableDrag.fromPortId;
        if (toDeviceId && toPortId && portType && !sameOrigin) {
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
        // Гасим событие: Esc должен отменить незавершённое действие и не идти дальше,
        // иначе страница поймает его и заодно выйдет из полноэкранного режима.
        e.stopPropagation();
        cancelCableDrag();
      }
    };
    // Фаза перехвата — чтобы сработать раньше обработчиков на document.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
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
        const device = devices.find((d) => d.id === state.deviceId);
        const w = device ? getDeviceWidth(device) : DEVICE_WIDTH_DEFAULT;
        const h = device ? calculateDeviceHeight(device) : DEVICE_HEIGHT_BASE;
        let rawX = scene.x - state.offset.x;
        let rawY = scene.y - state.offset.y;
        rawX = Math.max(0, Math.min(SCENE_WIDTH - w, rawX));
        rawY = Math.max(0, Math.min(SCENE_HEIGHT - h, rawY));
        // Проверка коллизий во время перетаскивания
        const finalPos = findNonCollidingPosition(state.deviceId, rawX, rawY, w, h);
        setLocalPositions((prev) => ({
          ...prev,
          [state.deviceId]: finalPos,
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
      setDraggingDeviceId(null);
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

  const getDeviceWidth = (device: Device): number => deviceSize(device).width;
  const calculateDeviceHeight = (device: Device): number => deviceSize(device).height;

  /** Точка крепления кабеля к порту в координатах сцены (внешняя кромка пилюли). */
  const getPortPosition = (device: Device, port: Port): { x: number; y: number } => {
    const pos = localPositions[device.id] ?? device.position;
    const layout = findPortLayout(device, port.id);
    if (!layout) return { x: pos.x, y: pos.y };
    return { x: pos.x + layout.anchorX, y: pos.y + layout.anchorY };
  };

  /** Грань, на которой сидит порт — от неё зависит, куда кабель отходит от карточки. */
  const getPortSide = (device: Device, portId: string) => findPortLayout(device, portId)?.side ?? "right";

  /** Категории, оставленные чипами-фильтрами. null — фильтр не применён, показываем всё. */
  const activeCategorySet =
    activeCategories && activeCategories.length > 0 ? new Set(activeCategories) : null;

  /**
   * Как подсветить порт во время протягивания кабеля: источник, совместимая цель или
   * несовместимая. Раньше эта логика была скопирована в четырёх местах разметки.
   */
  const getPortDragState = (device: Device, port: Port): PortDragState => {
    if (!cableDrag) return null;
    if (device.id === cableDrag.fromDeviceId && port.id === cableDrag.fromPortId) return "source";
    // Нельзя соединять порт сам с собой, два выхода или два входа одного устройства.
    if (port.type === cableDrag.fromType || device.id === cableDrag.fromDeviceId) return "incompatible";
    if (!dragFromPort) return "compatible";
    if (cableDrag.fromType === "out") return isConnectionValid(dragFromPort, port) ? "compatible" : "incompatible";
    return isConnectionValid(port, dragFromPort) ? "compatible" : "incompatible";
  };

  /** Свободный тип порта → код разъёма. Реализация живёт в signal-colors (её же использует геометрия). */
  const normalizeConnectionType = normalizeConnectorCode;

  const getSignalColor = (signal?: string): string => {
    const code = normalizeConnectionType(signal);
    return (CONNECTOR_STYLES[code] ?? CONNECTOR_STYLES.DEFAULT).color;
  };

  const getSignalLineStyle = (signal?: string): "solid" | "dashed" => {
    const code = normalizeConnectionType(signal);
    return (CONNECTOR_STYLES[code] ?? CONNECTOR_STYLES.DEFAULT).lineStyle;
  };

  /**
   * Точки, от которых начинается «свободная» часть кабеля: линия сперва отходит от порта
   * перпендикулярно грани, и только потом сворачивает. Иначе она липнет к карточке и
   * сливается с её рамкой.
   */
  const getCableEndpoints = (
    from: { x: number; y: number },
    to: { x: number; y: number },
    fromSide: PositionedPort["side"],
    toSide?: PositionedPort["side"],
  ) => {
    const fromDir = portDirection(fromSide);
    const toDir = toSide ? portDirection(toSide) : { dx: 0, dy: 0 };
    return {
      start: {
        x: from.x + fromDir.dx * CABLE_EXIT_OFFSET,
        y: from.y + fromDir.dy * CABLE_EXIT_OFFSET,
      },
      end: {
        x: to.x + toDir.dx * CABLE_EXIT_OFFSET,
        y: to.y + toDir.dy * CABLE_EXIT_OFFSET,
      },
    };
  };

  const getCablePath = (from: { x: number; y: number }, to: { x: number; y: number }, laneOffset = 0) => {
    const dx = Math.abs(to.x - from.x);
    const dy = Math.abs(to.y - from.y);
    const midX = (from.x + to.x) / 2 + laneOffset;
    const midY = (from.y + to.y) / 2 + laneOffset;
    if (dx >= dy) {
      return `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`;
    }
    return `M ${from.x} ${from.y} L ${from.x} ${midY} L ${to.x} ${midY} L ${to.x} ${to.y}`;
  };

  const getPortColor = (portType?: string): string => {
    const code = normalizeConnectionType(portType);
    return (CONNECTOR_STYLES[code] ?? CONNECTOR_STYLES.DEFAULT).color;
  };

  /** Направление плюс совместимость типов. Сами правила типов — в signal-compatibility. */
  const isConnectionValid = (fromPort: Port, toPort: Port): boolean => {
    if (!(fromPort.type === "out" && toPort.type === "in")) return false;
    return checkConnectorCompatibility(fromPort.portType, toPort.portType).ok;
  };

  /**
   * Маршруты всех кабелей считаем разом: коридоры зависят от взаимного расположения карточек,
   * а полосы внутри коридора — от того, сколько кабелей туда попало. По одному кабелю это
   * не вычислить.
   */
  const routing = useMemo(() => {
    const obstacles = devices.map((device) => {
      const pos = localPositions[device.id] ?? device.position;
      const size = deviceSize(device);
      return { x: pos.x, y: pos.y, width: size.width, height: size.height };
    });

    const requests: RouteRequest[] = [];
    for (const cable of cables) {
      const fromDevice = devices.find((d) => d.id === cable.fromDeviceId);
      const toDevice = devices.find((d) => d.id === cable.toDeviceId);
      if (!fromDevice || !toDevice) continue;
      const fromLayout = findPortLayout(fromDevice, cable.fromPortId);
      const toLayout = findPortLayout(toDevice, cable.toPortId);
      if (!fromLayout || !toLayout) continue;
      const fromPos = localPositions[fromDevice.id] ?? fromDevice.position;
      const toPos = localPositions[toDevice.id] ?? toDevice.position;
      requests.push({
        id: cable.id,
        start: { x: fromPos.x + fromLayout.anchorX, y: fromPos.y + fromLayout.anchorY },
        startSide: fromLayout.side,
        end: { x: toPos.x + toLayout.anchorX, y: toPos.y + toLayout.anchorY },
        endSide: toLayout.side,
        category: connectorCategory(cable.protocol || cable.cableType || fromLayout.port.portType),
      });
    }
    return routeCables(requests, obstacles);
  }, [devices, cables, localPositions]);

  /** По вертикали коридор тянется вдоль всех карточек — так полоса читается как сквозной проход. */
  const corridorBounds = useMemo(() => {
    if (devices.length === 0) return { top: 0, height: 0 };
    let top = Infinity;
    let bottom = -Infinity;
    devices.forEach((device) => {
      const pos = localPositions[device.id] ?? device.position;
      top = Math.min(top, pos.y);
      bottom = Math.max(bottom, pos.y + deviceSize(device).height);
    });
    const pad = 40;
    return { top: top - pad, height: bottom - top + pad * 2 };
  }, [devices, localPositions]);

  const routeById = useMemo(() => {
    const map = new Map<string, (typeof routing.cables)[number]>();
    routing.cables.forEach((route) => map.set(route.id, route));
    return map;
  }, [routing]);

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.1, 3));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.1, 0.5));

  const handleFitAll = () => {
    const lefts: number[] = [];
    const tops: number[] = [];
    const rights: number[] = [];
    const bottoms: number[] = [];
    devices.forEach((d) => {
      const p = getDevicePosition(d);
      lefts.push(p.x);
      tops.push(p.y);
      rights.push(p.x + getDeviceWidth(d));
      bottoms.push(p.y + calculateDeviceHeight(d));
    });
    if (!lefts.length) return;
    const minX = Math.min(...lefts);
    const minY = Math.min(...tops);
    const maxX = Math.max(...rights);
    const maxY = Math.max(...bottoms);
    const width = maxX - minX + 100;
    const height = maxY - minY + 100;
    const newScale = Math.min(stageSize.w / width, stageSize.h / height, 1);
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

    const padding = 80;
    const allLeft = [
      ...devices.map((d) => getDevicePosition(d).x),
      ...zones.map((z) => z.position.x),
    ];
    const allTop = [
      ...devices.map((d) => getDevicePosition(d).y),
      ...zones.map((z) => z.position.y),
    ];
    const allRight = [
      ...devices.map((d) => getDevicePosition(d).x + getDeviceWidth(d)),
      ...zones.map((z) => z.position.x + z.width),
    ];
    const allBottom = [
      ...devices.map((d) => getDevicePosition(d).y + calculateDeviceHeight(d)),
      ...zones.map((z) => z.position.y + z.height),
    ];

    const minX = Math.min(...allLeft) - padding;
    const minY = Math.min(...allTop) - padding;
    const maxX = Math.max(...allRight) + padding;
    const maxY = Math.max(...allBottom) + padding;

    return {
      x: minX,
      y: minY,
      width: Math.max(800, maxX - minX),
      height: Math.max(450, maxY - minY),
    };
  };

  const dragFromPort: Port | null = (() => {
    if (!cableDrag) return null;
    const fromDev = devices.find((d) => d.id === cableDrag.fromDeviceId);
    if (!fromDev) return null;
    return [...(fromDev.portsOut || []), ...(fromDev.portsIn || [])].find((p) => p.id === cableDrag.fromPortId) ?? null;
  })();
  const dragColor = dragFromPort ? getSignalColor(dragFromPort.portType) : "#60a5fa";

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
          <span>Кликайте по схеме, чтобы поставить вершины. Замкните контур (клик по первой точке), чтобы задать название зоны.</span>
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
        className={fullScreen ? "relative flex-1 min-h-0 w-full overflow-hidden" : "relative flex-1 min-h-[400px] bg-slate-100 dark:bg-slate-900 overflow-hidden"}
        style={{ touchAction: "none", willChange: "transform" }}
      >
        {zones.length > 0 && (
          <div className="pointer-events-none absolute bottom-3 left-3 z-20 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1.5">
            {ZONE_STATUS_ORDER.map((status) => {
              const count = zones.filter((z) => (z.status || "not_started") === status).length;
              const isProblem = status === "problem";
              return (
                <span
                  key={status}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-900/80 px-2 py-1 text-xs text-slate-200 backdrop-blur",
                    isProblem && "border-red-500 bg-red-950/70 font-semibold text-red-300",
                    isProblem && count > 0 && "animate-pulse",
                  )}
                >
                  {isProblem ? (
                    <span className="text-red-400">⚠</span>
                  ) : (
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ZONE_STATUS_META[status].color }} />
                  )}
                  {ZONE_STATUS_META[status].label}
                  <span className="opacity-70">{count}</span>
                </span>
              );
            })}
          </div>
        )}
        <div
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: "0 0",
            width: SCENE_WIDTH,
            height: SCENE_HEIGHT,
            cursor: panState ? "grabbing" : dragState ? "grabbing" : "default",
          }}
          onPointerDown={(e) => {
            if (drawZoneMode && onZoneDrawn) {
              e.preventDefault();
              const scene = screenToScene(e.clientX, e.clientY);
              handleZoneClick({ x: scene.x, y: scene.y });
              return;
            }
            if ((e.target as SVGElement).closest("[data-device-id]")) return;
            if ((e.target as SVGElement).closest("[data-zone-id]")) return;
            e.preventDefault();
            onZoneSelect?.(null);
            onDeviceSelect?.(null);
            setPanState({ startX: e.clientX, startY: e.clientY, startPos: { ...position } });
          }}
          onPointerMove={(e) => {
            if (!drawZoneMode) return;
            const scene = screenToScene(e.clientX, e.clientY);
            setZoneCursor({ x: scene.x, y: scene.y });
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
              <style>{`
                @keyframes cable-signal { to { stroke-dashoffset: -24; } }
                @keyframes schema-error-pulse {
                  0%, 100% { opacity: 1; }
                  50% { opacity: 0.35; }
                }
              `}</style>
              <ConnectorIconDefs />
              <symbol id="port-state-free" viewBox="0 0 64 64">
                <g fill="none" stroke="#94A3B8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="15" y="21" width="34" height="22" rx="5"/>
                  <rect x="22" y="27" width="20" height="10" rx="2.5"/>
                </g>
              </symbol>
              <symbol id="port-state-occupied" viewBox="0 0 64 64">
                <g fill="none" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="15" y="21" width="34" height="22" rx="5"/>
                  <rect x="20" y="27" width="15" height="10" rx="2" fill="#2563EB" stroke="none"/>
                  <path d="M35 32 H55"/>
                </g>
              </symbol>
              <symbol id="port-state-incompatible" viewBox="0 0 64 64">
                <g fill="none" stroke="#DC2626" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="15" y="21" width="34" height="22" rx="5"/>
                  <circle cx="32" cy="32" r="6.5"/>
                  <path d="M27.4 36.6 L36.6 27.4"/>
                </g>
              </symbol>
            </defs>
            <rect width={SCENE_WIDTH} height={SCENE_HEIGHT} fill="url(#grid)" />
            <rect width={SCENE_WIDTH} height={SCENE_HEIGHT} fill="transparent" style={{ pointerEvents: "none" }} />

            {/* Превью зоны: полигон, рисуемый кликами (замыкается по первой вершине) */}
            {drawZoneMode && zonePoints.length > 0 && (() => {
              const first = zonePoints[0];
              const base = zonePoints.map((p) => `${p.x},${p.y}`).join(" ");
              const preview = zoneCursor ? `${base} ${zoneCursor.x},${zoneCursor.y}` : base;
              const nearFirst =
                zoneCursor != null &&
                zonePoints.length >= 3 &&
                Math.hypot(zoneCursor.x - first.x, zoneCursor.y - first.y) <= ZONE_CLOSE_PX / scale;
              return (
                <g pointerEvents="none">
                  <polyline
                    points={preview}
                    fill="rgba(59, 130, 246, 0.2)"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    strokeLinejoin="round"
                  />
                  {zonePoints.map((p, i) => (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={i === 0 ? (nearFirst ? 8 : 6) : 5}
                      fill={i === 0 ? "#3b82f6" : "#ffffff"}
                      stroke="#3b82f6"
                      strokeWidth={2}
                    />
                  ))}
                </g>
              );
            })()}

            {[...zones]
              // Порядок отрисовки: обычные снизу, «Проблема» выше, выделенная — поверх всех.
              .sort((a, b) => zoneStackRank(a, selectedZoneId) - zoneStackRank(b, selectedZoneId))
              .map((zone) => {
              const isSelected = selectedZoneId === zone.id;
              const isProblem = (zone.status || "not_started") === "problem";
              const statusColor = zoneStatusColor(zone.status);
              const hasPolygon = Array.isArray(zone.points) && zone.points.length >= 3;
              const mine = !!currentUserId && zone.assigneeId === currentUserId;
              // Центр фигуры (габаритного прямоугольника) — для подписи по центру зоны.
              const cx = zone.position.x + zone.width / 2;
              const cy = zone.position.y + zone.height / 2;
              // Заливка — по статусу. Выделение: белая рамка + свечение; «Проблема»: красная рамка + свечение.
              const shapeProps = {
                fill: statusColor,
                fillOpacity: 1,
                stroke: isSelected ? "#ffffff" : isProblem ? "#dc2626" : statusColor,
                strokeWidth: isSelected ? 5 : isProblem ? 4 : 2,
                strokeDasharray: isSelected ? undefined : "12 10",
                style: {
                  filter: isSelected
                    ? "drop-shadow(0 0 7px rgba(255,255,255,0.85))"
                    : isProblem
                      ? "drop-shadow(0 0 7px rgba(239,68,68,0.9))"
                      : undefined,
                },
              };
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
                  onContextMenu={(e) => {
                    if (drawZoneMode || !onZoneDelete) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setZoneContextMenu({ x: e.clientX, y: e.clientY, zoneId: zone.id });
                  }}
                >
                  {hasPolygon ? (
                    <polygon
                      points={zone.points!.map((p) => `${p.x},${p.y}`).join(" ")}
                      strokeLinejoin="round"
                      {...shapeProps}
                    />
                  ) : (
                    <rect
                      x={zone.position.x}
                      y={zone.position.y}
                      width={zone.width}
                      height={zone.height}
                      rx={6}
                      {...shapeProps}
                    />
                  )}
                  {mine && (
                    <circle cx={zone.position.x + 8} cy={zone.position.y + 18} r={5} fill="#f59e0b" stroke="#fff" strokeWidth={1.5} pointerEvents="none" />
                  )}
                  <text
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={15}
                    fontWeight="bold"
                    fill={mine ? "#fcd34d" : "#f8fafc"}
                    pointerEvents="none"
                  >
                    {isProblem ? `⚠ ${zone.name}` : zone.name}
                  </text>
                </g>
              );
            })}

            {/*
              Коридоры — просветы между колонками устройств, по которым идут кабели.
              Рисуются под карточками, чтобы полоса не перекрывала их содержимое.
            */}
            {routing.corridors.map((corridor) => {
              const tint = categoryColor(corridor.category);
              return (
                <g key={`corridor-${corridor.x}`} pointerEvents="none">
                  <rect
                    x={corridor.x - corridor.width / 2}
                    y={corridorBounds.top}
                    width={corridor.width}
                    height={corridorBounds.height}
                    fill={tint.fill}
                    stroke={tint.hex}
                    strokeWidth={1}
                    rx={8}
                  />
                  <text
                    x={corridor.x}
                    y={corridorBounds.top + 16}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight="bold"
                    fill={tint.hex}
                    letterSpacing={1}
                  >
                    {tint.label.toUpperCase()}
                  </text>
                </g>
              );
            })}

            {/* Устройства: перетаскиваемое рисуем последним, чтобы оно было поверх остальных. */}
            {[...devices]
              .sort((a, b) => (a.id === draggingDeviceId ? 1 : 0) - (b.id === draggingDeviceId ? 1 : 0))
              .map((device) => {
                const pos = getDevicePosition(device);
                const isDragging = device.id === draggingDeviceId;
                return (
                  <SchemaDevice
                    key={device.id}
                    device={device}
                    position={pos}
                    isSelected={selectedDeviceId === device.id}
                    hasError={!!(validationComponentIds && validationComponentIds.includes(device.id))}
                    isDragging={isDragging}
                    activeCategories={activeCategorySet}
                    hoveredPortId={hoveredPort?.deviceId === device.id ? hoveredPort.portId : null}
                    connectable={!drawZoneMode && !!onAddConnection}
                    portDragState={(port) => getPortDragState(device, port)}
                    onDevicePointerDown={(e) => {
                      if (isDragging) {
                        e.stopPropagation();
                        return;
                      }
                      if (drawZoneMode) return;
                      if ((e.target as SVGElement).closest?.("[data-port-id]")) return;
                      e.stopPropagation();
                      const scene = screenToScene(e.clientX, e.clientY);
                      setDragState({
                        deviceId: device.id,
                        startPos: { ...pos },
                        offset: { x: scene.x - pos.x, y: scene.y - pos.y },
                      });
                      setDraggingDeviceId(device.id);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDeviceContextMenu({ x: e.clientX, y: e.clientY, deviceId: device.id });
                    }}
                    onPortPointerDown={(e, layout) => {
                      if (drawZoneMode || !onAddConnection) return;
                      e.stopPropagation();
                      const scenePoint = { x: pos.x + layout.anchorX, y: pos.y + layout.anchorY };
                      setCableDrag({
                        fromDeviceId: device.id,
                        fromPortId: layout.port.id,
                        fromPos: scenePoint,
                        fromType: layout.port.type,
                      });
                      setCableDragCurrent(scenePoint);
                    }}
                    onPortHover={(portId) =>
                      setHoveredPort(
                        portId
                          ? { deviceId: device.id, portId, type: findPortLayout(device, portId)?.port.type ?? "in" }
                          : null,
                      )
                    }
                  />
                );
              })}

            {/* Кабели поверх устройств — линия и анимация сигнала видны */}
            {cableDrag && cableDragCurrent && (
              (() => {
                const startPoint = cableDrag.fromPos;
                const endPoint = cableDragCurrent;
                const dragDevice = devices.find((d) => d.id === cableDrag.fromDeviceId);
                const dragSide = dragDevice ? getPortSide(dragDevice, cableDrag.fromPortId) : "right";
                const endpoints = getCableEndpoints(startPoint, endPoint, dragSide);
                // pointerEvents="none" обязателен: линия предпросмотра заканчивается ровно под
                // курсором, и без этого document.elementFromPoint при отпускании возвращает её
                // саму вместо порта — связь молча не создаётся.
                return (
                  <g pointerEvents="none">
                    <path
                      d={`M ${startPoint.x} ${startPoint.y} L ${endpoints.start.x} ${endpoints.start.y}`}
                      stroke={dragColor}
                      strokeWidth={4}
                      strokeLinecap="round"
                      fill="none"
                    />
                    <path
                      d={getCablePath(endpoints.start, endpoints.end)}
                      stroke={dragColor}
                      strokeWidth={4}
                      strokeLinecap="round"
                      fill="none"
                    />
                    <path
                      d={`M ${endpoints.end.x} ${endpoints.end.y} L ${endPoint.x} ${endPoint.y}`}
                      stroke={dragColor}
                      strokeWidth={4}
                      strokeLinecap="round"
                      fill="none"
                    />
                  </g>
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
              const fromPos = getPortPosition(fromDevice, fromPort);
              const toPos = getPortPosition(toDevice, toPort);
              const protocolLabel = cable.protocol || cable.cableType || fromPort.portType;
              const lineStyle = getSignalLineStyle(protocolLabel || fromPort.portType || toPort.portType);
              const isDashed = lineStyle === "dashed";
              const dashArray = isDashed ? "8 6" : undefined;
              const startPoint = fromPos;
              const endPoint = toPos;
              // Маршрут уже посчитан с обходом карточек — здесь только рисуем.
              const route = routeById.get(cable.id);
              const routePoints = route?.points ?? [startPoint, endPoint];
              const pathD = pointsToPath(routePoints);
              const labelPoint = polylineMidpoint(routePoints);
              const labelX = labelPoint.x;
              const labelY = labelPoint.y;
              const signalColor = getSignalColor(protocolLabel || fromPort.portType || toPort.portType);
              const stroke = valid ? signalColor : "#dc2626";
              // Чипы-фильтры приглушают чужие категории, но не убирают их со схемы.
              const cableCategory = connectorCategory(protocolLabel || fromPort.portType || toPort.portType);
              const cableDimmed = activeCategorySet !== null && !activeCategorySet.has(cableCategory);
              // Невидимый широкий слой поверх того же маршрута — чтобы по кабелю можно было попасть кликом.
              const fullCablePath = pathD;
              return (
                <g
                  style={{ cursor: onDeleteConnection ? "pointer" : undefined }}
                  opacity={cableDimmed ? 0.15 : 1}
                >
                  <path
                    d={pathD}
                    stroke={stroke}
                    strokeWidth={3.5}
                    strokeLinecap="round"
                    strokeDasharray={dashArray}
                    fill="none"
                  />
                  {valid && !isDashed && (
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
                      x={labelX}
                      y={labelY - CABLE_LABEL_OFFSET}
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
                  {/* Невидимый слой для обработки кликов — должен быть последним */}
                  {onDeleteConnection && (
                    <path
                      d={fullCablePath}
                      stroke="transparent"
                      strokeWidth={20}
                      fill="none"
                      style={{ pointerEvents: "stroke" }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        onDeleteConnection?.(cable);
                      }}
                    >
                      <title>Двойной клик — удалить связь</title>
                    </path>
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
      {zoneContextMenu && (
        <div
          ref={zoneContextMenuRef}
          className="fixed z-[100] min-w-[180px] rounded-lg border border-slate-600 bg-slate-800 py-1 shadow-xl"
          style={{ left: zoneContextMenu.x, top: zoneContextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {onZoneDelete && (
            <button
              type="button"
              className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-700"
              onClick={() => {
                onZoneDelete(zoneContextMenu.zoneId);
                setZoneContextMenu(null);
              }}
            >
              Удалить зону
            </button>
          )}
        </div>
      )}
    </div>
  );
});
