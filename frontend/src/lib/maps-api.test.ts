import { describe, expect, it } from "vitest";
import {
  assigneeInitials,
  clampScale,
  countZonesByStatus,
  filterMaps,
  filterMapsByName,
  fitViewport,
  getAllowedNextStatuses,
  MAP_STATUS_META,
  mapSummaryLine,
  searchMaps,
  sortZonesForPanel,
  summarizeMaps,
  zoomAtPoint,
  type MapZone,
  type SiteMap,
} from "./maps-api";

const maps: SiteMap[] = [
  { id: "1", companyId: "c", name: "Главный зал", zonesCount: 2 },
  { id: "2", companyId: "c", name: "Склад света", zonesCount: 0 },
  { id: "3", companyId: "c", name: "Backstage", zonesCount: 1 },
];

/** Карты со сводкой — как их отдаёт GET /api/maps после VM-редизайна списка. */
const summarized: SiteMap[] = [
  {
    id: "1",
    companyId: "c",
    name: "Главный зал",
    imageUrl: "/uploads/plan-1.png",
    zonesCount: 4,
    statusCounts: { not_started: 1, in_progress: 2, done: 0, needs_review: 0, problem: 1, verified: 0 },
    unassignedCount: 1,
    assignees: [{ id: "u1", name: "Дмитрий Морозов" }],
    zoneNames: ["Сцена", "Питание"],
  },
  {
    id: "2",
    companyId: "c",
    name: "Пресс-центр",
    imageUrl: null,
    zonesCount: 4,
    statusCounts: { not_started: 2, in_progress: 2, done: 0, needs_review: 0, problem: 0, verified: 0 },
    unassignedCount: 0,
    assignees: [{ id: "u2", name: "Фёдор Ким" }],
    zoneNames: ["Стойка регистрации"],
  },
  {
    id: "3",
    companyId: "c",
    name: "Сцена B",
    imageUrl: "/uploads/plan-3.png",
    zonesCount: 2,
    statusCounts: { not_started: 0, in_progress: 0, done: 2, needs_review: 0, problem: 0, verified: 0 },
    unassignedCount: 1,
    assignees: [],
    zoneNames: ["Видео"],
  },
];

describe("maps helpers", () => {
  it("filters maps by case-insensitive Russian and Latin names", () => {
    expect(filterMapsByName(maps, "зал").map((m) => m.id)).toEqual(["1"]);
    expect(filterMapsByName(maps, "BACK").map((m) => m.id)).toEqual(["3"]);
    expect(filterMapsByName(maps, "  ").map((m) => m.id)).toEqual(["1", "2", "3"]);
  });

  it("searches maps by name, zone name and assignee", () => {
    expect(searchMaps(summarized, "пресс").map((m) => m.id)).toEqual(["2"]);
    expect(searchMaps(summarized, "питание").map((m) => m.id)).toEqual(["1"]);
    expect(searchMaps(summarized, "ким").map((m) => m.id)).toEqual(["2"]);
    expect(searchMaps(summarized, "  ").map((m) => m.id)).toEqual(["1", "2", "3"]);
  });

  it("applies quick filters over the search result", () => {
    expect(filterMaps(summarized, "", "all").map((m) => m.id)).toEqual(["1", "2", "3"]);
    expect(filterMaps(summarized, "", "problems").map((m) => m.id)).toEqual(["1"]);
    expect(filterMaps(summarized, "", "unassigned").map((m) => m.id)).toEqual(["1", "3"]);
    expect(filterMaps(summarized, "", "no_plan").map((m) => m.id)).toEqual(["2"]);
    // Поиск и чип сужают выборку вместе, а не по отдельности.
    expect(filterMaps(summarized, "сцена", "problems").map((m) => m.id)).toEqual(["1"]);
  });

  it("sums overview tiles across all maps", () => {
    expect(summarizeMaps(summarized)).toEqual({ maps: 3, inProgress: 4, problems: 1, unassigned: 2 });
    expect(summarizeMaps([])).toEqual({ maps: 0, inProgress: 0, problems: 0, unassigned: 0 });
    // Карты без сводки (например, из старого ответа) не ломают счётчики.
    expect(summarizeMaps(maps)).toEqual({ maps: 3, inProgress: 0, problems: 0, unassigned: 0 });
  });

  it("builds avatar initials from one or two name parts", () => {
    expect(assigneeInitials("Александр Симонов")).toBe("АС");
    expect(assigneeInitials("fk")).toBe("FK");
    expect(assigneeInitials("  Дмитрий   Морозов Иванович ")).toBe("ДМ");
    expect(assigneeInitials("")).toBe("?");
    expect(assigneeInitials(null)).toBe("?");
  });

  it("builds the sidebar summary line, showing the most alarming trait", () => {
    // Без плана — это важнее любых счётчиков: рисовать зоны негде.
    expect(mapSummaryLine(summarized[1])).toBe("4 зоны · без плана");
    expect(mapSummaryLine(summarized[0])).toBe("4 зоны · 1 проблема");
    expect(mapSummaryLine(summarized[2])).toBe("2 зоны · 1 без отв.");
    expect(mapSummaryLine({ id: "x", companyId: "c", name: "X", imageUrl: "/p.png", zonesCount: 5 })).toBe("5 зон");
  });

  it("puts problem zones on top of the panel list", () => {
    const zones = [
      { name: "Сцена", status: "done" },
      { name: "Питание", status: "problem" },
      { name: "Видео", status: "in_progress" },
      { name: "Афиша", status: "problem" },
    ].map((zone, index) => ({ id: String(index), mapId: "m", companyId: "c", points: [], version: 1, ...zone })) as MapZone[];

    expect(sortZonesForPanel(zones).map((zone) => zone.name)).toEqual(["Афиша", "Питание", "Видео", "Сцена"]);
    expect(countZonesByStatus(zones, "problem")).toBe(2);
    expect(countZonesByStatus(zones, "verified")).toBe(0);
    // Исходный массив не мутируем — он приходит прямо из кэша запроса.
    expect(zones[0].name).toBe("Сцена");
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
