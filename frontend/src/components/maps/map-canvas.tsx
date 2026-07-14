import { useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Image as KonvaImage, Line, Circle, Text, Rect } from "react-konva";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  fitViewport,
  getZoneColor,
  mapImageUrl,
  MAP_STATUS_META,
  zoomAtPoint,
  type MapWithZones,
  type MapZone,
  type PlanRect,
  type Viewport,
  type ZonePoint,
} from "@/lib/maps-api";
import { Check, Edit3, LocateFixed, Minus, MousePointer2, Plus, RotateCcw, Trash2, X } from "lucide-react";

type DrawMode =
  | { type: "create" }
  | { type: "redraw"; zone: MapZone }
  | null;

/** Порог замыкания контура кликом по первой вершине — в пикселях экрана (делится на масштаб). */
const ZONE_CLOSE_PX = 14;

/** Строгое пересечение двух отрезков (без учёта касаний в общих вершинах). */
function segmentsIntersect(a: ZonePoint, b: ZonePoint, c: ZonePoint, d: ZonePoint): boolean {
  const orient = (p: ZonePoint, q: ZonePoint, r: ZonePoint) =>
    (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  const d1 = orient(c, d, a);
  const d2 = orient(c, d, b);
  const d3 = orient(a, b, c);
  const d4 = orient(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Есть ли самопересечение у замкнутого полигона (пересекаются несмежные рёбра). */
function polygonSelfIntersects(points: ZonePoint[]): boolean {
  const n = points.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      if (adjacent) continue;
      if (segmentsIntersect(a, b, points[j], points[(j + 1) % n])) return true;
    }
  }
  return false;
}

/** Пересечёт ли новое ребро (последняя точка → кандидат) уже нарисованную ломаную. */
function chainCrosses(points: ZonePoint[], candidate: ZonePoint): boolean {
  const n = points.length;
  if (n < 2) return false;
  const a = points[n - 1];
  // Рёбра 0..n-3: ребро n-2 смежно новому (общая последняя вершина), его пропускаем.
  for (let k = 0; k < n - 2; k++) {
    if (segmentsIntersect(a, candidate, points[k], points[k + 1])) return true;
  }
  return false;
}

/** Порядок наложения зон: выделенная — выше «Проблемы», «Проблема» — выше обычных. */
function zoneStackRank(zone: MapZone, selectedZoneId?: string | null): number {
  if (zone.id === selectedZoneId) return 2;
  if (zone.status === "problem") return 1;
  return 0;
}

interface MapCanvasProps {
  map: MapWithZones;
  selectedZoneId?: string | null;
  canEditZones: boolean;
  isMutating?: boolean;
  onZoneSelect: (zone: MapZone | null) => void;
  /** Новый полигон нарисован — родитель спрашивает имя и создаёт зону. */
  onZoneDrawn: (points: ZonePoint[]) => void;
  onUpdateZonePoints: (zone: MapZone, points: ZonePoint[]) => void;
  /** Удаление зоны (правый клик → «Удалить»). */
  onZoneDelete?: (zone: MapZone) => void;
  /** Режим редактирования плана: перетаскивание и ресайз подложки за углы. */
  planEditMode?: boolean;
  /** Сохранение нового прямоугольника плана после перетаскивания/ресайза. */
  onResizePlan?: (rect: PlanRect) => void;
}

/** Минимальный размер плана при ресайзе (в пикселях сцены). */
const PLAN_MIN_SIZE = 40;

export function MapCanvas({
  map,
  selectedZoneId,
  canEditZones,
  isMutating,
  onZoneSelect,
  onZoneDrawn,
  onUpdateZonePoints,
  onZoneDelete,
  planEditMode = false,
  onResizePlan,
}: MapCanvasProps) {
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<any>(null);
  const [size, setSize] = useState({ width: 900, height: 560 });
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [planImage, setPlanImage] = useState<HTMLImageElement | null>(null);
  const [drawMode, setDrawMode] = useState<DrawMode>(null);
  const [draftPoints, setDraftPoints] = useState<ZonePoint[]>([]);
  // Позиция курсора (в координатах карты) для «резиновой» линии предпросмотра во время рисования.
  const [cursorPoint, setCursorPoint] = useState<ZonePoint | null>(null);
  // Контекстное меню зоны (координаты — относительно контейнера холста).
  const [zoneMenu, setZoneMenu] = useState<{ x: number; y: number; zone: MapZone } | null>(null);
  // Живой прямоугольник плана во время перетаскивания/ресайза (иначе — из props карты).
  const [livePlanRect, setLivePlanRect] = useState<PlanRect | null>(null);

  const imageWidth = map.imageWidth || planImage?.naturalWidth || 1000;
  const imageHeight = map.imageHeight || planImage?.naturalHeight || 700;
  const zones = map.zones || [];
  const selectedZone = zones.find((zone) => zone.id === selectedZoneId) || null;

  // Прямоугольник отрисовки плана: из props (planX/Y/W/H) либо во весь кадр; во время
  // перетаскивания/ресайза — «живой».
  const planRect: PlanRect = livePlanRect ?? {
    x: map.planX ?? 0,
    y: map.planY ?? 0,
    width: map.planWidth ?? imageWidth,
    height: map.planHeight ?? imageHeight,
  };
  const hasPlan = Boolean(planImage);

  // Сбрасываем «живой» прямоугольник при выходе из режима редактирования плана.
  useEffect(() => {
    if (!planEditMode) setLivePlanRect(null);
  }, [planEditMode]);

  // Перетаскивание тела плана — смещение (размер не меняется).
  const handlePlanDrag = (event: any, commit: boolean) => {
    const rect = { x: event.target.x(), y: event.target.y(), width: planRect.width, height: planRect.height };
    if (commit) {
      setLivePlanRect(null);
      onResizePlan?.(rect);
    } else {
      setLivePlanRect(rect);
    }
  };

  // Перетаскивание угловой ручки — ресайз, противоположный угол зафиксирован.
  const handleCornerDrag = (corner: "nw" | "ne" | "sw" | "se", event: any, commit: boolean) => {
    const base = planRect;
    const fixedX = corner === "nw" || corner === "sw" ? base.x + base.width : base.x;
    const fixedY = corner === "nw" || corner === "ne" ? base.y + base.height : base.y;
    const px = event.target.x();
    const py = event.target.y();
    const x = Math.min(fixedX, px);
    const y = Math.min(fixedY, py);
    const width = Math.max(PLAN_MIN_SIZE, Math.abs(px - fixedX));
    const height = Math.max(PLAN_MIN_SIZE, Math.abs(py - fixedY));
    const rect = { x, y, width, height };
    if (commit) {
      setLivePlanRect(null);
      onResizePlan?.(rect);
    } else {
      setLivePlanRect(rect);
    }
  };

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const updateSize = () => {
      setSize({
        width: Math.max(320, element.clientWidth || 900),
        height: Math.max(360, element.clientHeight || 560),
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!map.imageUrl) {
      setPlanImage(null);
      return;
    }
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => setPlanImage(image);
    image.onerror = () => setPlanImage(null);
    image.src = mapImageUrl(map.imageUrl);
  }, [map.imageUrl]);

  useEffect(() => {
    setViewport(fitViewport(size.width, size.height, imageWidth, imageHeight));
  }, [size.width, size.height, imageWidth, imageHeight, map.id]);

  // Порог замыкания в координатах карты (зависит от текущего масштаба).
  const closeThreshold = ZONE_CLOSE_PX / viewport.scale;
  // Курсор рядом с первой вершиной — можно замкнуть контур.
  const canCloseAtCursor =
    !!drawMode &&
    draftPoints.length >= 3 &&
    !!cursorPoint &&
    Math.hypot(cursorPoint.x - draftPoints[0].x, cursorPoint.y - draftPoints[0].y) <= closeThreshold;

  const flattenedDraft = useMemo(() => draftPoints.flatMap((point) => [point.x, point.y]), [draftPoints]);
  // «Резиновая» линия: контур + сегмент до курсора (пока контур не замыкаем).
  const previewLine = useMemo(() => {
    if (!draftPoints.length) return [] as number[];
    if (cursorPoint && !canCloseAtCursor) return [...flattenedDraft, cursorPoint.x, cursorPoint.y];
    return flattenedDraft;
  }, [flattenedDraft, draftPoints.length, cursorPoint, canCloseAtCursor]);

  const resetView = () => setViewport(fitViewport(size.width, size.height, imageWidth, imageHeight));

  const startCreate = () => {
    setDraftPoints([]);
    setCursorPoint(null);
    setDrawMode({ type: "create" });
    onZoneSelect(null);
  };

  const startRedraw = () => {
    if (!selectedZone) return;
    setDraftPoints([]);
    setCursorPoint(null);
    setDrawMode({ type: "redraw", zone: selectedZone });
  };

  const cancelDraw = () => {
    setDrawMode(null);
    setDraftPoints([]);
    setCursorPoint(null);
  };

  const finishDraw = (points: ZonePoint[]) => {
    if (!drawMode || points.length < 3) return;
    if (polygonSelfIntersects(points)) {
      toast({
        title: "Зона пересекает саму себя",
        description: "Контур не должен пересекаться. Уберите точку и обведите зону без пересечений.",
        variant: "destructive",
      });
      return;
    }
    if (drawMode.type === "create") {
      onZoneDrawn(points);
    } else {
      onUpdateZonePoints(drawMode.zone, points);
    }
    cancelDraw();
  };

  const stageToMapPoint = () => {
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!pointer) return null;
    return {
      x: Math.max(0, Math.min(imageWidth, (pointer.x - viewport.x) / viewport.scale)),
      y: Math.max(0, Math.min(imageHeight, (pointer.y - viewport.y) / viewport.scale)),
    };
  };

  const handleStageClick = (event: any) => {
    if (drawMode) {
      const point = stageToMapPoint();
      if (!point) return;
      // Клик рядом с первой вершиной замыкает контур.
      if (draftPoints.length >= 3) {
        const first = draftPoints[0];
        if (Math.hypot(point.x - first.x, point.y - first.y) <= closeThreshold) {
          finishDraw(draftPoints);
          return;
        }
      }
      // Не даём поставить точку так, чтобы новое ребро пересекло уже нарисованное.
      if (chainCrosses(draftPoints, point)) {
        toast({
          title: "Пересечение контура",
          description: "Линия зоны пересекла бы саму себя — поставьте точку в другом месте.",
          variant: "destructive",
        });
        return;
      }
      setDraftPoints((prev) => [...prev, point]);
      return;
    }
    if (event.target === event.target.getStage()) {
      onZoneSelect(null);
    }
  };

  const handleStageMouseMove = () => {
    if (!drawMode) return;
    const point = stageToMapPoint();
    if (point) setCursorPoint(point);
  };

  const handleWheel = (event: any) => {
    event.evt.preventDefault();
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    setViewport((current) => zoomAtPoint(current, pointer, event.evt.deltaY < 0 ? 1 : -1));
  };

  const zoomByButton = (direction: 1 | -1) => {
    setViewport((current) => zoomAtPoint(current, { x: size.width / 2, y: size.height / 2 }, direction));
  };

  const openZoneMenu = (event: any, zone: MapZone) => {
    event.evt?.preventDefault?.();
    event.cancelBubble = true;
    if (!canEditZones || !onZoneDelete || drawMode) return;
    const rect = containerRef.current?.getBoundingClientRect();
    const clientX = event.evt?.clientX ?? 0;
    const clientY = event.evt?.clientY ?? 0;
    setZoneMenu({
      x: clientX - (rect?.left ?? 0),
      y: clientY - (rect?.top ?? 0),
      zone,
    });
    onZoneSelect(zone);
  };

  // Esc отменяет рисование либо закрывает контекстное меню.
  useEffect(() => {
    if (!drawMode && !zoneMenu) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (zoneMenu) setZoneMenu(null);
        if (drawMode) cancelDraw();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawMode, zoneMenu]);

  // Закрытие контекстного меню по клику вне его.
  useEffect(() => {
    if (!zoneMenu) return;
    const close = () => setZoneMenu(null);
    const timer = setTimeout(() => {
      window.addEventListener("click", close);
      window.addEventListener("contextmenu", close);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
    };
  }, [zoneMenu]);

  return (
    <div ref={containerRef} className="relative h-[calc(100vh-12rem)] min-h-[420px] w-full overflow-hidden rounded-lg border bg-slate-950">
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={viewport.x}
        y={viewport.y}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        draggable={!drawMode}
        onDragEnd={(event) => {
          // Только собственное перетаскивание Stage (панорама). Событие dragend от плана/ручек
          // всплывает сюда же — без этой проверки координаты дочернего узла улетали бы в позицию камеры.
          if (event.target === event.target.getStage()) {
            setViewport((current) => ({ ...current, x: event.target.x(), y: event.target.y() }));
          }
        }}
        onWheel={handleWheel}
        onClick={handleStageClick}
        onTap={handleStageClick}
        onMouseMove={handleStageMouseMove}
      >
        <Layer>
          <Rect x={0} y={0} width={imageWidth} height={imageHeight} fill="#f8fafc" listening={false} />
          {planImage ? (
            <KonvaImage
              image={planImage}
              x={planRect.x}
              y={planRect.y}
              width={planRect.width}
              height={planRect.height}
              listening={planEditMode}
              draggable={planEditMode}
              onDragMove={(event) => handlePlanDrag(event, false)}
              onDragEnd={(event) => handlePlanDrag(event, true)}
            />
          ) : (
            <>
              <Rect x={0} y={0} width={imageWidth} height={imageHeight} fill="#f8fafc" stroke="#cbd5e1" strokeWidth={2} listening={false} />
              <Text
                x={24}
                y={24}
                text="План пока не загружен"
                fontSize={24}
                fill="#64748b"
                listening={false}
              />
            </>
          )}

          {[...zones]
            // Порядок отрисовки: обычные снизу, «Проблема» выше, выделенная — поверх всех.
            .sort((a, b) => zoneStackRank(a, selectedZoneId) - zoneStackRank(b, selectedZoneId))
            .map((zone) => {
            const color = getZoneColor(zone);
            const selected = selectedZoneId === zone.id;
            const isProblem = zone.status === "problem";
            const points = zone.points.flatMap((point) => [point.x, point.y]);
            return (
              <Line
                key={zone.id}
                points={points}
                closed
                fill={selected ? `${color}99` : isProblem ? `${color}66` : `${color}55`}
                stroke={selected ? "#0f172a" : isProblem ? "#dc2626" : color}
                strokeWidth={selected ? 5 : isProblem ? 4 : 2}
                strokeScaleEnabled={false}
                dash={isProblem && !selected ? [10, 6] : undefined}
                shadowColor={selected ? color : isProblem ? "#ef4444" : undefined}
                shadowBlur={selected ? 18 : isProblem ? 14 : 0}
                shadowOpacity={selected ? 0.9 : isProblem ? 0.85 : 0}
                listening={!drawMode && !planEditMode}
                onClick={(event) => {
                  event.cancelBubble = true;
                  onZoneSelect(zone);
                }}
                onTap={(event) => {
                  event.cancelBubble = true;
                  onZoneSelect(zone);
                }}
                onContextMenu={(event) => openZoneMenu(event, zone)}
              />
            );
          })}

          {selectedZone && selectedZone.points.map((point, index) => (
            <Circle
              key={`${selectedZone.id}-vertex-${index}`}
              x={point.x}
              y={point.y}
              radius={5 / viewport.scale}
              fill="#ffffff"
              stroke="#0f172a"
              strokeWidth={2 / viewport.scale}
              listening={false}
            />
          ))}

          {zones.map((zone) => {
            if (!zone.points.length) return null;
            // Центрируем подпись по габаритному прямоугольнику полигона (обе оси).
            const xs = zone.points.map((point) => point.x);
            const ys = zone.points.map((point) => point.y);
            const minX = Math.min(...xs);
            const minY = Math.min(...ys);
            const boxWidth = Math.max(Math.max(...xs) - minX, 1);
            const boxHeight = Math.max(Math.max(...ys) - minY, 1);
            const selected = selectedZoneId === zone.id;
            const isProblem = zone.status === "problem";
            return (
              <Text
                key={`${zone.id}-label`}
                x={minX}
                y={minY}
                width={boxWidth}
                height={boxHeight}
                align="center"
                verticalAlign="middle"
                wrap="none"
                text={isProblem ? `⚠ ${zone.name}` : zone.name}
                fontSize={selected ? 18 : 16}
                fontStyle="bold"
                fill={isProblem ? "#b91c1c" : "#0f172a"}
                stroke={selected || isProblem ? "#f8fafc" : undefined}
                strokeWidth={selected || isProblem ? 3 : 0}
                fillAfterStrokeEnabled={selected || isProblem}
                strokeScaleEnabled={false}
                listening={false}
              />
            );
          })}

          {drawMode && draftPoints.length > 0 && (
            <>
              <Line
                points={previewLine}
                closed={canCloseAtCursor}
                stroke="#7c3aed"
                fill={draftPoints.length >= 3 ? "#7c3aed33" : undefined}
                strokeWidth={3}
                strokeScaleEnabled={false}
                dash={[8, 5]}
                listening={false}
              />
              {draftPoints.map((point, index) => (
                <Circle
                  key={`${point.x}-${point.y}-${index}`}
                  x={point.x}
                  y={point.y}
                  radius={(index === 0 && canCloseAtCursor ? 9 : 6) / viewport.scale}
                  fill={index === 0 && canCloseAtCursor ? "#22c55e" : "#7c3aed"}
                  stroke="#fff"
                  strokeWidth={2 / viewport.scale}
                  listening={false}
                />
              ))}
            </>
          )}

          {planEditMode && planImage && (
            <>
              <Rect
                x={planRect.x}
                y={planRect.y}
                width={planRect.width}
                height={planRect.height}
                stroke="#2563eb"
                strokeWidth={2 / viewport.scale}
                dash={[10 / viewport.scale, 6 / viewport.scale]}
                listening={false}
              />
              {([
                { key: "nw", x: planRect.x, y: planRect.y },
                { key: "ne", x: planRect.x + planRect.width, y: planRect.y },
                { key: "sw", x: planRect.x, y: planRect.y + planRect.height },
                { key: "se", x: planRect.x + planRect.width, y: planRect.y + planRect.height },
              ] as const).map((handle) => (
                <Circle
                  key={handle.key}
                  x={handle.x}
                  y={handle.y}
                  radius={8 / viewport.scale}
                  fill="#2563eb"
                  stroke="#ffffff"
                  strokeWidth={2 / viewport.scale}
                  draggable
                  onDragMove={(event) => handleCornerDrag(handle.key, event, false)}
                  onDragEnd={(event) => handleCornerDrag(handle.key, event, true)}
                />
              ))}
            </>
          )}
        </Layer>
      </Stage>

      <div className="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-1.5">
        <Badge variant="secondary" className="rounded-md bg-background/90 backdrop-blur">
          {planEditMode
            ? "Редактирование плана: двигайте план и тяните за синие углы"
            : drawMode
              ? canCloseAtCursor
                ? "Кликните по зелёной точке, чтобы замкнуть"
                : "Рисование: кликайте по точкам, замкните по первой"
              : "Перетаскивание и зум"}
        </Badge>
        {selectedZone && !drawMode && !planEditMode && (
          <Badge variant="outline" className="rounded-md bg-background/90 backdrop-blur">
            {selectedZone.name}: {MAP_STATUS_META[selectedZone.status]?.label}
          </Badge>
        )}
      </div>

      <div className="absolute right-2 top-2 flex flex-col gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" size="icon" variant="secondary" className="h-9 w-9 bg-background/90" onClick={() => zoomByButton(1)}>
              <Plus className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Приблизить</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" size="icon" variant="secondary" className="h-9 w-9 bg-background/90" onClick={() => zoomByButton(-1)}>
              <Minus className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Отдалить</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" size="icon" variant="secondary" className="h-9 w-9 bg-background/90" onClick={resetView}>
              <LocateFixed className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Вписать план</TooltipContent>
        </Tooltip>
      </div>

      {canEditZones && !planEditMode && (
        <div className="absolute bottom-2 left-2 right-2 flex flex-wrap items-center gap-1.5">
          {!drawMode ? (
            <>
              <Button type="button" size="sm" onClick={startCreate} disabled={isMutating} className="gap-1.5">
                <Edit3 className="h-4 w-4" />
                Новая зона
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={startRedraw} disabled={!selectedZone || isMutating} className="gap-1.5">
                <RotateCcw className="h-4 w-4" />
                Перерисовать
              </Button>
            </>
          ) : (
            <>
              <Button type="button" size="sm" onClick={() => finishDraw(draftPoints)} disabled={draftPoints.length < 3 || isMutating} className="gap-1.5">
                <Check className="h-4 w-4" />
                Готово
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={cancelDraw} className="gap-1.5">
                <X className="h-4 w-4" />
                Отмена
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setDraftPoints((prev) => prev.slice(0, -1))} disabled={!draftPoints.length}>
                Убрать точку
              </Button>
            </>
          )}
        </div>
      )}

      {!drawMode && !planEditMode && (
        <div className={cn("pointer-events-none absolute bottom-3 right-3 hidden items-center gap-1.5 rounded-md bg-background/90 px-2 py-1 text-xs text-muted-foreground backdrop-blur sm:flex")}>
          <MousePointer2 className="h-3.5 w-3.5" />
          Клик по зоне — панель, правый клик — удалить
        </div>
      )}

      {zoneMenu && (
        <div
          className="absolute z-20 min-w-[160px] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
          style={{ left: Math.min(zoneMenu.x, size.width - 170), top: Math.min(zoneMenu.y, size.height - 60) }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="border-b px-3 py-1.5 text-xs font-medium text-muted-foreground truncate">{zoneMenu.zone.name}</div>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
            onClick={() => {
              onZoneDelete?.(zoneMenu.zone);
              setZoneMenu(null);
            }}
          >
            <Trash2 className="h-4 w-4" />
            Удалить зону
          </button>
        </div>
      )}
    </div>
  );
}
