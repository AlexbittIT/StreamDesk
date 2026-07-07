import { describe, expect, it } from "vitest";
import {
  clampScale,
  filterMapsByName,
  fitViewport,
  getAllowedNextStatuses,
  MAP_STATUS_META,
  zoomAtPoint,
  type SiteMap,
} from "./maps-api";

const maps: SiteMap[] = [
  { id: "1", companyId: "c", name: "Главный зал", zonesCount: 2 },
  { id: "2", companyId: "c", name: "Склад света", zonesCount: 0 },
  { id: "3", companyId: "c", name: "Backstage", zonesCount: 1 },
];

describe("maps helpers", () => {
  it("filters maps by case-insensitive Russian and Latin names", () => {
    expect(filterMapsByName(maps, "зал").map((m) => m.id)).toEqual(["1"]);
    expect(filterMapsByName(maps, "BACK").map((m) => m.id)).toEqual(["3"]);
    expect(filterMapsByName(maps, "  ").map((m) => m.id)).toEqual(["1", "2", "3"]);
  });

  it("returns status labels and valid next statuses", () => {
    expect(MAP_STATUS_META.problem.label).toBe("Проблема");
    expect(getAllowedNextStatuses("not_started")).toEqual(["in_progress", "problem"]);
    expect(getAllowedNextStatuses("in_progress")).toContain("needs_review");
    expect(getAllowedNextStatuses("problem")).toEqual(["in_progress", "done"]);
  });

  it("calculates fit viewport and clamps zoom", () => {
    const viewport = fitViewport(1000, 600, 500, 300);
    expect(viewport.scale).toBeCloseTo(1.84);
    expect(viewport.x).toBeCloseTo(40);
    expect(viewport.y).toBeCloseTo(24);
    expect(clampScale(0.01)).toBe(0.2);
    expect(clampScale(99)).toBe(5);
  });

  it("zooms around pointer without moving map point under cursor", () => {
    const before = { x: 10, y: 20, scale: 1 };
    const pointer = { x: 110, y: 220 };
    const after = zoomAtPoint(before, pointer, 1);
    expect(after.scale).toBeCloseTo(1.15);
    expect((pointer.x - after.x) / after.scale).toBeCloseTo(100);
    expect((pointer.y - after.y) / after.scale).toBeCloseTo(200);
  });
});
