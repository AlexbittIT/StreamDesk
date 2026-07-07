import { useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Image as KonvaImage, Line, Circle, Text, Rect } from "react-konva";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  fitViewport,
  getZoneColor,
  mapImageUrl,
  MAP_STATUS_META,
  zoomAtPoint,
  type MapWithZones,
  type MapZone,
  type Viewport,
  type ZonePoint,
} from "@/lib/maps-api";
import { Check, Edit3, LocateFixed, Minus, MousePointer2, Plus, RotateCcw, X } from "lucide-react";

type DrawMode =
  | { type: "create"; name: string }
  | { type: "redraw"; zone: MapZone }
  | null;

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
  onCreateZone: (name: string, points: ZonePoint[]) => void;
  onUpdateZonePoints: (zone: MapZone, points: ZonePoint[]) => void;
}

export function MapCanvas({
  map,
  selectedZoneId,
  canEditZones,
  isMutating,
  onZoneSelect,
  onCreateZone,
  onUpdateZonePoints,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<any>(null);
  const [size, setSize] = useState({ width: 900, height: 560 });
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [planImage, setPlanImage] = useState<HTMLImageElement | null>(null);
  const [drawMode, setDrawMode] = useState<DrawMode>(null);
  const [draftPoints, setDraftPoints] = useState<ZonePoint[]>([]);

  const imageWidth = map.imageWidth || planImage?.naturalWidth || 1000;
  const imageHeight = map.imageHeight || planImage?.naturalHeight || 700;
  const zones = map.zones || [];
  const selectedZone = zones.find((zone) => zone.id === selectedZoneId) || null;

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

  const flattenedDraft = useMemo(() => draftPoints.flatMap((point) => [point.x, point.y]), [draftPoints]);

  const resetView = () => setViewport(fitViewport(size.width, size.height, imageWidth, imageHeight));

  const startCreate = () => {
    const name = window.prompt("Название зоны", `Зона ${(zones.length || 0) + 1}`);
    if (!name?.trim()) return;
    setDraftPoints([]);
    setDrawMode({ type: "create", name: name.trim() });
    onZoneSelect(null);
  };

  const startRedraw = () => {
    if (!selectedZone) return;
    setDraftPoints([]);
    setDrawMode({ type: "redraw", zone: selectedZone });
  };

  const cancelDraw = () => {
    setDrawMode(null);
    setDraftPoints([]);
  };

  const finishDraw = () => {
    if (!drawMode || draftPoints.length < 3) return;
    if (drawMode.type === "create") {
      onCreateZone(drawMode.name, draftPoints);
    } else {
      onUpdateZonePoints(drawMode.zone, draftPoints);
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
      if (point) setDraftPoints((prev) => [...prev, point]);
      return;
    }
    if (event.target === event.target.getStage()) {
      onZoneSelect(null);
    }
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
        onDragEnd={(event) => setViewport((current) => ({ ...current, x: event.target.x(), y: event.target.y() }))}
        onWheel={handleWheel}
        onClick={handleStageClick}
        onTap={handleStageClick}
      >
        <Layer>
          <Rect x={0} y={0} width={imageWidth} height={imageHeight} fill="#f8fafc" listening={false} />
          {planImage ? (
            <KonvaImage image={planImage} x={0} y={0} width={imageWidth} height={imageHeight} listening={false} />
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
                listening={!drawMode}
                onClick={(event) => {
                  event.cancelBubble = true;
                  onZoneSelect(zone);
                }}
                onTap={(event) => {
                  event.cancelBubble = true;
                  onZoneSelect(zone);
                }}
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
            const labelPoint = zone.points[0];
            if (!labelPoint) return null;
            const selected = selectedZoneId === zone.id;
            const isProblem = zone.status === "problem";
            return (
              <Text
                key={`${zone.id}-label`}
                x={labelPoint.x + 8}
                y={labelPoint.y + 8}
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
              <Line points={flattenedDraft} closed={draftPoints.length >= 3} stroke="#7c3aed" fill="#7c3aed33" strokeWidth={3} dash={[8, 5]} listening={false} />
              {draftPoints.map((point, index) => (
                <Circle key={`${point.x}-${point.y}-${index}`} x={point.x} y={point.y} radius={6} fill="#7c3aed" stroke="#fff" strokeWidth={2} listening={false} />
              ))}
            </>
          )}
        </Layer>
      </Stage>

      <div className="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-1.5">
        <Badge variant="secondary" className="rounded-md bg-background/90 backdrop-blur">
          {drawMode ? "Рисование: кликайте по точкам полигона" : "Перетаскивание и зум"}
        </Badge>
        {selectedZone && (
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

      {canEditZones && (
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
              <Button type="button" size="sm" onClick={finishDraw} disabled={draftPoints.length < 3 || isMutating} className="gap-1.5">
                <Check className="h-4 w-4" />
                Сохранить полигон
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

      {!drawMode && (
        <div className={cn("pointer-events-none absolute bottom-3 right-3 hidden items-center gap-1.5 rounded-md bg-background/90 px-2 py-1 text-xs text-muted-foreground backdrop-blur sm:flex")}>
          <MousePointer2 className="h-3.5 w-3.5" />
          Клик по зоне откроет панель
        </div>
      )}
    </div>
  );
}
