import { CONNECTOR_STYLES, connectorCategory, connectorShortLabel, normalizeConnectorCode } from "./signal-colors";
import { categoryColor } from "./category-colors";
import {
  PORT_PILL_HEIGHT,
  PORT_PILL_WIDTH,
  deviceSize,
  layoutPorts,
  textLeftOffset,
  type GeometryPort,
  type PositionedPort,
} from "./schema-geometry";

export interface SchemaDeviceModel {
  id: string;
  name: string;
  type: string;
  position: { x: number; y: number };
  portsIn?: GeometryPort[];
  portsOut?: GeometryPort[];
  manufacturer?: string;
  model?: string;
  properties?: Record<string, any>;
}

/** Состояние порта во время протягивания кабеля — им подсвечиваются совместимые цели. */
export type PortDragState = "source" | "compatible" | "incompatible" | null;

interface SchemaDeviceProps {
  device: SchemaDeviceModel;
  position: { x: number; y: number };
  isSelected: boolean;
  hasError: boolean;
  isDragging: boolean;
  /** Категории, оставленные чипами-фильтрами. null — фильтр не применён. */
  activeCategories: Set<string> | null;
  /** Порт под курсором — для подсветки. */
  hoveredPortId: string | null;
  /** Можно ли тянуть кабели (в режиме рисования зоны — нельзя). */
  connectable: boolean;
  portDragState: (port: GeometryPort) => PortDragState;
  onDevicePointerDown: (e: React.PointerEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onPortPointerDown: (e: React.PointerEvent, layout: PositionedPort) => void;
  onPortHover: (portId: string | null) => void;
}

/**
 * Категория устройства — по преобладающей категории его портов. Питание при подсчёте
 * игнорируется: розетка есть почти у всего, и иначе любая камера стала бы «питанием».
 * Исключение — устройства, у которых силовые порты единственные: это и есть дистрибьюция.
 */
export function deviceCategory(device: SchemaDeviceModel): string {
  const ports = [...(device.portsIn || []), ...(device.portsOut || [])];
  const counts = new Map<string, number>();
  let powerCount = 0;
  for (const port of ports) {
    const category = connectorCategory(port.portType);
    if (category === "power") {
      powerCount += 1;
      continue;
    }
    if (category === "other") continue;
    counts.set(category, (counts.get(category) || 0) + 1);
  }
  if (counts.size === 0) return powerCount > 0 ? "power" : "other";

  let best = "other";
  let bestCount = 0;
  counts.forEach((count, category) => {
    if (count > bestCount) {
      best = category;
      bestCount = count;
    }
  });
  return best;
}

function portColor(port: GeometryPort): string {
  const code = normalizeConnectorCode(port.portType);
  return (CONNECTOR_STYLES[code] ?? CONNECTOR_STYLES.DEFAULT).color;
}

/**
 * Карточка устройства на схеме.
 *
 * Три состояния из макета: выделенная (контрастная рамка), перетаскиваемая (приподнята тенью)
 * и ошибочная (красная рамка). Раньше эта разметка была продублирована в холсте дважды — для
 * обычных и для перетаскиваемого устройства.
 */
export function SchemaDevice({
  device,
  position,
  isSelected,
  hasError,
  isDragging,
  activeCategories,
  hoveredPortId,
  connectable,
  portDragState,
  onDevicePointerDown,
  onContextMenu,
  onPortPointerDown,
  onPortHover,
}: SchemaDeviceProps) {
  const { width, height } = deviceSize(device);
  const ports = layoutPorts(device);
  // Цвет рамки — ровно тот же, что у чипа этой категории в панели фильтров.
  const accent = categoryColor(deviceCategory(device)).hex;
  const subtitle = String(
    device.properties?.consideredModel || device.model || device.manufacturer || device.type || "",
  ).slice(0, 42);

  // Рамка красится по типу устройства; ошибка перебивает цвет типа, её нельзя пропустить.
  const borderColor = hasError ? "#ef4444" : accent;
  // Выделение и перетаскивание — одно и то же состояние для пользователя: рамка становится толще.
  const isActive = isSelected || isDragging;
  const borderWidth = hasError ? 3 : isActive ? 4 : 1.5;
  const textX = textLeftOffset(device);

  return (
    <g
      data-device-id={device.id}
      transform={`translate(${position.x}, ${position.y})`}
      style={{ cursor: isDragging ? "grabbing" : "grab" }}
      onPointerDown={onDevicePointerDown}
      onContextMenu={onContextMenu}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Перетаскивание: карточка «приподнимается» — мягкая тень под ней. */}
      {isDragging && (
        <rect
          x={4}
          y={7}
          width={width}
          height={height}
          fill="#000000"
          fillOpacity={0.5}
          rx={10}
          pointerEvents="none"
        />
      )}

      <rect width={width} height={height} fill="#16223c" stroke={borderColor} strokeWidth={borderWidth} rx={10} />

      {/* Название и тип — блок прижат влево и центрирован по вертикали, как в макете. */}
      <text x={textX} y={height / 2 - (subtitle ? 6 : 0)} fontSize={16} fontWeight="bold" fill="#f8fafc" dominantBaseline="middle">
        {device.name}
      </text>
      {subtitle && (
        <text x={textX} y={height / 2 + 13} fontSize={12} fill="#94a3b8" dominantBaseline="middle">
          {subtitle}
        </text>
      )}

      {ports.map((layout) => {
        const { port, side, centerX, centerY } = layout;
        const state = portDragState(port);
        const category = connectorCategory(port.portType);
        const dimmed = activeCategories !== null && !activeCategories.has(category);
        const isHovered = hoveredPortId === port.id;
        const label = connectorShortLabel(port.portType);

        // Пилюля сидит верхом на грани: половина внутри карточки, половина снаружи.
        const pillX = centerX - PORT_PILL_WIDTH / 2;
        const pillY = centerY - PORT_PILL_HEIGHT / 2;

        // Несовместимый порт краснеет, совместимый зеленеет — подсказка во время перетаскивания.
        const pillFill =
          state === "incompatible" ? "#fecaca" : state === "compatible" ? "#bbf7d0" : "#e2e8f0";
        const pillStroke =
          state === "incompatible"
            ? "#ef4444"
            : state === "compatible"
              ? "#22c55e"
              : state === "source" || isHovered
                ? "#f8fafc"
                : "#0f172a";

        return (
          <g
            key={port.id}
            data-port-device-id={device.id}
            data-port-id={port.id}
            data-port-type={port.type}
            transform={`translate(${pillX}, ${pillY})`}
            opacity={dimmed ? 0.25 : 1}
            style={{ cursor: connectable ? "crosshair" : "default" }}
            onPointerDown={(e) => onPortPointerDown(e, layout)}
            onPointerEnter={() => onPortHover(port.id)}
            onPointerLeave={() => onPortHover(null)}
          >
            <title>
              {port.name}
              {port.portType ? ` (${port.portType})` : ""}
              {port.type === "out" ? " — потяните для соединения" : ""}
            </title>
            <rect
              width={PORT_PILL_WIDTH}
              height={PORT_PILL_HEIGHT}
              rx={PORT_PILL_HEIGHT / 2}
              fill={pillFill}
              stroke={pillStroke}
              strokeWidth={state || isHovered ? 2.5 : 1.5}
            />
            <circle cx={12} cy={PORT_PILL_HEIGHT / 2} r={5} fill={portColor(port)} />
            <text
              x={PORT_PILL_WIDTH / 2 + 6}
              y={PORT_PILL_HEIGHT / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={10}
              fontWeight="bold"
              fill="#0f172a"
              pointerEvents="none"
            >
              {label}
            </text>
          </g>
        );
      })}
    </g>
  );
}
