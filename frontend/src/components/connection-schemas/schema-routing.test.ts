import { describe, expect, it } from "vitest";
import {
  CLEARANCE,
  MIN_CORRIDOR_WIDTH,
  freeVerticalBands,
  pointsToPath,
  polylineMidpoint,
  routeCables,
  type Rect,
  type RouteRequest,
} from "./schema-routing";

/** Три колонки карточек с широкими просветами между ними. */
const columns: Rect[] = [
  { x: 0, y: 0, width: 200, height: 120 },
  { x: 500, y: 0, width: 200, height: 120 },
  { x: 1000, y: 0, width: 200, height: 120 },
];

const signal = (id: string, startX: number, startY: number, endX: number, endY: number): RouteRequest => ({
  id,
  start: { x: startX, y: startY },
  startSide: "right",
  end: { x: endX, y: endY },
  endSide: "left",
  category: "video",
});

describe("schema routing", () => {
  it("finds the gaps between device columns", () => {
    const bands = freeVerticalBands(columns);
    expect(bands).toHaveLength(2);
    expect(bands[0].start).toBe(200 + CLEARANCE);
    expect(bands[0].end).toBe(500 - CLEARANCE);
  });

  it("ignores gaps too narrow for a cable", () => {
    const tight: Rect[] = [
      { x: 0, y: 0, width: 100, height: 50 },
      // Просвет между карточками меньше минимального — коридором не становится.
      { x: 100 + MIN_CORRIDOR_WIDTH, y: 0, width: 100, height: 50 },
    ];
    expect(freeVerticalBands(tight)).toHaveLength(0);
    expect(freeVerticalBands([])).toHaveLength(0);
  });

  it("routes a cable through the corridor between its endpoints", () => {
    const { cables, corridors } = routeCables([signal("c1", 200, 40, 500, 90)], columns);
    const route = cables[0];
    expect(route.corridorX).not.toBeNull();
    // Коридор лежит строго между карточками, а не внутри них.
    expect(route.corridorX!).toBeGreaterThan(200);
    expect(route.corridorX!).toBeLessThan(500);
    // Путь ортогональный: вышли вбок, прошли по коридору, вошли вбок.
    expect(route.points.map((p) => p.y)).toEqual([40, 40, 90, 90]);
    expect(corridors).toHaveLength(1);
    expect(corridors[0].category).toBe("video");
  });

  it("separates cables sharing one corridor into lanes", () => {
    const { cables } = routeCables(
      [signal("a", 200, 20, 500, 20), signal("b", 200, 60, 500, 60), signal("c", 200, 100, 500, 100)],
      columns,
    );
    const xs = cables.map((cable) => cable.corridorX!);
    // Три разных полосы — кабели не ложатся друг на друга.
    expect(new Set(xs).size).toBe(3);
    xs.forEach((x) => {
      expect(x).toBeGreaterThan(200);
      expect(x).toBeLessThan(500);
    });
  });

  it("sends power cables to a channel below every device", () => {
    const power: RouteRequest = {
      id: "pwr",
      start: { x: 100, y: 120 },
      startSide: "bottom",
      end: { x: 1100, y: 120 },
      endSide: "bottom",
      category: "power",
    };
    const { cables, powerChannelY } = routeCables([power], columns);
    expect(powerChannelY).toBeGreaterThan(120);
    // Силовой кабель не попадает в сигнальные коридоры.
    expect(cables[0].corridorX).toBeNull();
    expect(cables[0].points[1].y).toBe(powerChannelY);
    expect(cables[0].points[2].y).toBe(powerChannelY);
  });

  it("still routes when no corridor exists between the endpoints", () => {
    const { cables } = routeCables([signal("c1", 10, 10, 60, 40)], [columns[0]]);
    expect(cables).toHaveLength(1);
    expect(cables[0].points).toHaveLength(4);
  });

  it("builds an svg path and finds the midpoint by length", () => {
    expect(pointsToPath([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBe("M 0 0 L 10 0");
    expect(pointsToPath([])).toBe("");
    expect(polylineMidpoint([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toEqual({ x: 5, y: 0 });
    expect(polylineMidpoint([])).toEqual({ x: 0, y: 0 });
  });
});
