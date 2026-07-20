import type { PortSide } from "./schema-geometry";

/**
 * Маршрутизация кабелей по коридорам.
 *
 * Прежняя схема вела кабель тремя сегментами через геометрическую середину между портами и
 * никак не учитывала карточки — линии спокойно проходили сквозь устройства, и проследить
 * маршрут было невозможно. Здесь кабель сперва ищет свободный вертикальный просвет между
 * колонками устройств («коридор») и идёт по нему, а внутри коридора кабели разводятся по
 * полосам, чтобы не ложиться друг на друга.
 *
 * Коридоры не хранятся в БД и не создаются пользователем — это результат расчёта по текущим
 * позициям карточек.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RouteRequest {
  id: string;
  start: Point;
  startSide: PortSide;
  end: Point;
  endSide: PortSide;
  /** Категория сигнала — по ней коридор получает цвет и подпись. */
  category: string;
}

export interface RoutedCable {
  id: string;
  points: Point[];
  /** X коридора, по которому пошёл кабель; null — кабель шёл напрямую. */
  corridorX: number | null;
}

export interface Corridor {
  /** Центр коридора и его ширина в координатах сцены. */
  x: number;
  width: number;
  /** Преобладающая категория проходящих кабелей — ею подписан и подкрашен коридор. */
  category: string;
  cableCount: number;
}

export interface RoutingResult {
  cables: RoutedCable[];
  corridors: Corridor[];
  /** Y горизонтального канала под схемой, по которому идут силовые кабели. */
  powerChannelY: number;
}

/** Зазор между кабелем и карточкой. */
export const CLEARANCE = 28;
/** Расстояние между соседними кабелями внутри одного коридора. */
export const LANE_GAP = 14;
/** Уже этого просвет коридором не считается — кабель в него не влезет. */
export const MIN_CORRIDOR_WIDTH = 36;

interface Interval {
  start: number;
  end: number;
}

/** Слить пересекающиеся интервалы — вспомогательное для поиска просветов. */
function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [{ ...sorted[0] }];
  for (const current of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

/**
 * Свободные вертикальные полосы между колонками устройств. Именно они становятся коридорами:
 * кабель, идущий по такой полосе, гарантированно не пересекает ни одну карточку.
 */
export function freeVerticalBands(obstacles: Rect[]): Interval[] {
  if (obstacles.length === 0) return [];
  const occupied = mergeIntervals(
    obstacles.map((rect) => ({ start: rect.x - CLEARANCE, end: rect.x + rect.width + CLEARANCE })),
  );
  const bands: Interval[] = [];
  for (let i = 0; i < occupied.length - 1; i++) {
    const start = occupied[i].end;
    const end = occupied[i + 1].start;
    if (end - start >= MIN_CORRIDOR_WIDTH) bands.push({ start, end });
  }
  return bands;
}

/** Коридор, через который удобнее всего провести кабель из start в end. */
function pickBand(bands: Interval[], startX: number, endX: number): Interval | null {
  const low = Math.min(startX, endX);
  const high = Math.max(startX, endX);
  const between = bands.filter((band) => {
    const center = (band.start + band.end) / 2;
    return center > low && center < high;
  });
  if (between.length === 0) return null;
  const mid = (low + high) / 2;
  return between.reduce((best, band) => {
    const bandCenter = (band.start + band.end) / 2;
    const bestCenter = (best.start + best.end) / 2;
    return Math.abs(bandCenter - mid) < Math.abs(bestCenter - mid) ? band : best;
  });
}

/** Самая частая категория в списке — ею подписывается коридор. */
function dominantCategory(categories: string[]): string {
  const counts = new Map<string, number>();
  categories.forEach((category) => counts.set(category, (counts.get(category) || 0) + 1));
  let best = categories[0] ?? "other";
  let bestCount = 0;
  counts.forEach((count, category) => {
    if (count > bestCount) {
      best = category;
      bestCount = count;
    }
  });
  return best;
}

/**
 * Разложить кабели по коридорам и полосам.
 *
 * Силовые кабели (порт на нижней грани) в вертикальные коридоры не идут — они уходят в
 * горизонтальный канал под всей схемой, чтобы не мешаться в сигнальных.
 */
export function routeCables(requests: RouteRequest[], obstacles: Rect[]): RoutingResult {
  const bands = freeVerticalBands(obstacles);
  const bottom = obstacles.reduce((max, rect) => Math.max(max, rect.y + rect.height), 0);
  const powerChannelY = bottom + CLEARANCE * 2;

  const signal = requests.filter((r) => r.startSide !== "bottom" && r.endSide !== "bottom");
  const power = requests.filter((r) => r.startSide === "bottom" || r.endSide === "bottom");

  // Группируем сигнальные кабели по выбранному коридору, чтобы развести их по полосам.
  const byBand = new Map<string, { band: Interval | null; items: RouteRequest[] }>();
  for (const request of signal) {
    const band = pickBand(bands, request.start.x, request.end.x);
    const key = band ? `${band.start}:${band.end}` : `direct:${Math.round((request.start.x + request.end.x) / 2)}`;
    const bucket = byBand.get(key) ?? { band, items: [] };
    bucket.items.push(request);
    byBand.set(key, bucket);
  }

  const cables: RoutedCable[] = [];
  const corridors: Corridor[] = [];

  byBand.forEach((bucket) => {
    const { band, items } = bucket;
    // Внутри коридора порядок по высоте — так кабели меньше пересекаются между собой.
    const ordered = [...items].sort((a, b) => a.start.y - b.start.y);
    const center = band
      ? (band.start + band.end) / 2
      : (ordered[0].start.x + ordered[0].end.x) / 2;
    const available = band ? band.end - band.start - LANE_GAP : LANE_GAP * ordered.length;
    // Полосы не должны вылезать за границы коридора, поэтому шаг при тесноте ужимается.
    const step = ordered.length > 1 ? Math.min(LANE_GAP, available / (ordered.length - 1)) : 0;

    ordered.forEach((request, index) => {
      const offset = (index - (ordered.length - 1) / 2) * step;
      const corridorX = center + offset;
      cables.push({
        id: request.id,
        corridorX,
        points: [
          request.start,
          { x: corridorX, y: request.start.y },
          { x: corridorX, y: request.end.y },
          request.end,
        ],
      });
    });

    if (band) {
      corridors.push({
        x: (band.start + band.end) / 2,
        width: band.end - band.start,
        category: dominantCategory(items.map((item) => item.category)),
        cableCount: items.length,
      });
    }
  });

  // Силовые — по общему нижнему каналу, каждый на своей полосе.
  const orderedPower = [...power].sort((a, b) => a.start.x - b.start.x);
  orderedPower.forEach((request, index) => {
    const channelY = powerChannelY + index * LANE_GAP;
    cables.push({
      id: request.id,
      corridorX: null,
      points: [
        request.start,
        { x: request.start.x, y: channelY },
        { x: request.end.x, y: channelY },
        request.end,
      ],
    });
  });

  return { cables, corridors, powerChannelY };
}

/** Полилиния → атрибут d для SVG-пути. */
export function pointsToPath(points: Point[]): string {
  if (points.length === 0) return "";
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

/** Середина полилинии по длине — туда ставится подпись кабеля. */
export function polylineMidpoint(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const segments: { from: Point; to: Point; length: number }[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    segments.push({ from, to, length });
    total += length;
  }
  let remaining = total / 2;
  for (const segment of segments) {
    if (remaining <= segment.length || segment === segments[segments.length - 1]) {
      const ratio = segment.length === 0 ? 0 : remaining / segment.length;
      return {
        x: segment.from.x + (segment.to.x - segment.from.x) * ratio,
        y: segment.from.y + (segment.to.y - segment.from.y) * ratio,
      };
    }
    remaining -= segment.length;
  }
  return points[Math.floor(points.length / 2)];
}
