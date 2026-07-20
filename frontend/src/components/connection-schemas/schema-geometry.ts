import { connectorCategory } from "./signal-colors";

/**
 * Геометрия карточки устройства на схеме подключений.
 *
 * Вынесено из холста отдельным модулем по двум причинам: во-первых, одни и те же числа нужны
 * и отрисовке карточки, и расчёту точек, откуда выходят кабели — если они разойдутся, кабель
 * оторвётся от порта; во-вторых, это чистые функции, которые можно проверить тестами без DOM.
 *
 * Поток слева направо: входы на левой грани, выходы на правой. Питание — исключение: и входы,
 * и выходы питания уходят на нижнюю грань, чтобы силовые кабели шли понизу и не мешались в
 * сигнальных коридорах.
 */

export interface GeometryPort {
  id: string;
  name: string;
  type: "in" | "out";
  portType?: string;
}

export interface GeometryDevice {
  id: string;
  portsIn?: GeometryPort[];
  portsOut?: GeometryPort[];
  properties?: Record<string, any>;
}

export type PortSide = "left" | "right" | "bottom";

/** Пилюля порта с подписью — крупная, в отличие от прежних безымянных квадратиков 30×20. */
export const PORT_PILL_WIDTH = 56;
export const PORT_PILL_HEIGHT = 24;
/** Зазор между пилюлями в одном ряду/столбце. */
export const PORT_PILL_GAP = 8;

/**
 * Блок текста: название и под ним тип устройства. Иконок на карточке нет.
 * Блок центрируется по вертикали, поэтому в расчёте высоты участвует как минимум.
 */
export const CARD_TEXT_HEIGHT = 34;
/** Отступ сверху и снизу от столбца пилюль до края карточки. */
export const PORT_AREA_PAD = 18;
export const CARD_MIN_WIDTH = 220;
export const CARD_MIN_HEIGHT = 76;

/** Насколько пилюля выступает за границу карточки (половина ширины — она сидит верхом на грани). */
export const PORT_PILL_OVERHANG = PORT_PILL_WIDTH / 2;

/** На какой грани карточки живёт порт. Питание всегда снизу — см. «Питание подключается только к PWR / IEC». */
export function portSide(port: GeometryPort): PortSide {
  if (connectorCategory(port.portType) === "power") return "bottom";
  return port.type === "in" ? "left" : "right";
}

export interface PositionedPort {
  port: GeometryPort;
  side: PortSide;
  /** Центр пилюли в координатах карточки. */
  centerX: number;
  centerY: number;
  /** Точка крепления кабеля — на внешней кромке грани. */
  anchorX: number;
  anchorY: number;
}

function allPorts(device: GeometryDevice): GeometryPort[] {
  return [...(device.portsIn || []), ...(device.portsOut || [])];
}

/**
 * Отступ текста слева. Пилюля входного порта сидит верхом на левой грани, её внутренняя
 * половина заходит на карточку — текст должен начинаться за ней, иначе они наложатся.
 */
export function textLeftOffset(device: GeometryDevice): number {
  return groupPortsBySide(device).left.length > 0 ? PORT_PILL_OVERHANG + 10 : 18;
}

/** Суммарная высота столбца боковых пилюль. */
function sidePortsHeight(device: GeometryDevice): number {
  const groups = groupPortsBySide(device);
  const rows = Math.max(groups.left.length, groups.right.length);
  return rows > 0 ? rows * PORT_PILL_HEIGHT + (rows - 1) * PORT_PILL_GAP : 0;
}

/** Порты, сгруппированные по граням, в порядке объявления. */
export function groupPortsBySide(device: GeometryDevice): Record<PortSide, GeometryPort[]> {
  const groups: Record<PortSide, GeometryPort[]> = { left: [], right: [], bottom: [] };
  for (const port of allPorts(device)) {
    groups[portSide(port)].push(port);
  }
  return groups;
}

/**
 * Размер карточки.
 *
 * И текст, и столбец пилюль центрируются по вертикали. Друг другу они не мешают: текст
 * прижат влево, пилюли сидят на боковых гранях. Поэтому высота — это просто столбец пилюль
 * плюс равные отступы, но не меньше минимума, в который помещается блок текста.
 */
export function deviceSize(device: GeometryDevice): { width: number; height: number } {
  const groups = groupPortsBySide(device);
  const sideHeight = sidePortsHeight(device);

  const bottomCount = groups.bottom.length;
  const bottomWidth =
    bottomCount > 0 ? bottomCount * PORT_PILL_WIDTH + (bottomCount - 1) * PORT_PILL_GAP + 32 : 0;

  const autoHeight = sideHeight > 0 ? sideHeight + 2 * PORT_AREA_PAD : CARD_MIN_HEIGHT;
  const autoWidth = Math.max(CARD_MIN_WIDTH, bottomWidth);

  // Ручной размер из свойств компонента уважаем, но не даём ужать карточку так,
  // чтобы пилюли налезли друг на друга.
  const customW = device.properties?.width as number | undefined;
  const customH = device.properties?.height as number | undefined;
  return {
    width: Math.max(autoWidth, customW ?? 0),
    height: Math.max(CARD_MIN_HEIGHT, autoHeight, customH ?? 0),
  };
}

/** Раскладка всех портов карточки — единственный источник правды о том, где что нарисовано. */
export function layoutPorts(device: GeometryDevice): PositionedPort[] {
  const { width, height } = deviceSize(device);
  const groups = groupPortsBySide(device);
  const result: PositionedPort[] = [];

  // Столбец пилюль центрируется по высоте карточки — «выходы строго по центру».
  const sideHeight = sidePortsHeight(device);
  const sideTop = (height - sideHeight) / 2 + PORT_PILL_HEIGHT / 2;
  const step = PORT_PILL_HEIGHT + PORT_PILL_GAP;

  groups.left.forEach((port, index) => {
    const centerY = sideTop + index * step;
    result.push({
      port,
      side: "left",
      centerX: 0,
      centerY,
      anchorX: -PORT_PILL_OVERHANG,
      anchorY: centerY,
    });
  });

  groups.right.forEach((port, index) => {
    const centerY = sideTop + index * step;
    result.push({
      port,
      side: "right",
      centerX: width,
      centerY,
      anchorX: width + PORT_PILL_OVERHANG,
      anchorY: centerY,
    });
  });

  // Силовые пилюли — ряд по центру нижней грани.
  const bottomCount = groups.bottom.length;
  const bottomSpan = bottomCount * PORT_PILL_WIDTH + Math.max(0, bottomCount - 1) * PORT_PILL_GAP;
  let bottomX = (width - bottomSpan) / 2 + PORT_PILL_WIDTH / 2;
  groups.bottom.forEach((port) => {
    result.push({
      port,
      side: "bottom",
      centerX: bottomX,
      centerY: height,
      anchorX: bottomX,
      anchorY: height + PORT_PILL_HEIGHT / 2,
    });
    bottomX += PORT_PILL_WIDTH + PORT_PILL_GAP;
  });

  return result;
}

/** Найти раскладку конкретного порта — нужна для точки крепления кабеля. */
export function findPortLayout(device: GeometryDevice, portId: string): PositionedPort | null {
  return layoutPorts(device).find((item) => item.port.id === portId) || null;
}

/** Запас вокруг пилюли, в пределах которого попадание по порту ещё засчитывается. */
export const PORT_HIT_PADDING = 10;

/**
 * Попадание точки сцены по пилюле порта.
 *
 * Нужен как запасной способ определить цель, когда {@code document.elementFromPoint} возвращает
 * не порт: поверх карточек лежит широкий прозрачный слой кабелей для перехвата кликов, и если
 * бросить связь на порт, к которому кабель уже подведён, курсор попадает в него, а не в пилюлю.
 * Прежняя проверка «в радиусе N от точки крепления» с крупными пилюлями промахивалась: точка
 * крепления на внешней кромке, а бросают обычно в середину пилюли.
 */
export function hitTestPort(
  device: GeometryDevice,
  devicePosition: { x: number; y: number },
  scenePoint: { x: number; y: number },
  filter?: (port: GeometryPort) => boolean,
): PositionedPort | null {
  const localX = scenePoint.x - devicePosition.x;
  const localY = scenePoint.y - devicePosition.y;
  for (const layout of layoutPorts(device)) {
    if (filter && !filter(layout.port)) continue;
    const left = layout.centerX - PORT_PILL_WIDTH / 2 - PORT_HIT_PADDING;
    const right = layout.centerX + PORT_PILL_WIDTH / 2 + PORT_HIT_PADDING;
    const top = layout.centerY - PORT_PILL_HEIGHT / 2 - PORT_HIT_PADDING;
    const bottom = layout.centerY + PORT_PILL_HEIGHT / 2 + PORT_HIT_PADDING;
    if (localX >= left && localX <= right && localY >= top && localY <= bottom) return layout;
  }
  return null;
}

/**
 * Направление, в котором кабель отходит от порта, прежде чем свернуть в коридор.
 * Без него линии липнут к карточке и сливаются с её рамкой.
 */
export function portDirection(side: PortSide): { dx: number; dy: number } {
  if (side === "left") return { dx: -1, dy: 0 };
  if (side === "right") return { dx: 1, dy: 0 };
  return { dx: 0, dy: 1 };
}
