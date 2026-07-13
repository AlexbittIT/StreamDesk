import { apiRequest, apiUrl } from "@/lib/queryClient";

export type ZoneStatus =
  | "not_started"
  | "in_progress"
  | "done"
  | "needs_review"
  | "problem"
  | "verified";

export type ZonePoint = {
  x: number;
  y: number;
};

export type ZoneComment = {
  id: string;
  authorId?: string | null;
  authorName?: string | null;
  text: string;
  createdAt?: string;
};

export type MapZone = {
  id: string;
  mapId: string;
  companyId: string;
  name: string;
  points: ZonePoint[];
  status: ZoneStatus;
  assigneeId?: string | null;
  assigneeType?: string | null;
  color?: string | null;
  version: number;
  comments?: ZoneComment[] | null;
  photos?: string[] | null;
  commentsCount?: number;
  photosCount?: number;
  createdBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type SiteMap = {
  id: string;
  companyId: string;
  venueId?: string | null;
  name: string;
  imageUrl?: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  /** Прямоугольник отрисовки плана на холсте (координаты сцены); null → во весь кадр. */
  planX?: number | null;
  planY?: number | null;
  planWidth?: number | null;
  planHeight?: number | null;
  zonesCount: number;
  createdBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type PlanRect = { x: number; y: number; width: number; height: number };

export type MapWithZones = SiteMap & {
  zones?: MapZone[];
};

export const MAP_STATUS_META: Record<ZoneStatus, { label: string; color: string; className: string }> = {
  not_started: { label: "Не начато", color: "#64748b", className: "bg-slate-500" },
  in_progress: { label: "В работе", color: "#eab308", className: "bg-yellow-500" },
  done: { label: "Готово", color: "#22c55e", className: "bg-green-500" },
  needs_review: { label: "Требует проверки", color: "#3b82f6", className: "bg-blue-500" },
  problem: { label: "Проблема", color: "#ef4444", className: "bg-red-500" },
  verified: { label: "Проверено", color: "#15803d", className: "bg-emerald-700" },
};

const STATUS_TRANSITIONS: Record<ZoneStatus, ZoneStatus[]> = {
  not_started: ["in_progress", "problem"],
  in_progress: ["done", "needs_review", "problem"],
  done: ["needs_review", "verified", "problem"],
  needs_review: ["verified", "in_progress", "problem"],
  verified: ["in_progress", "problem"],
  problem: ["in_progress", "done"],
};

export type Viewport = {
  x: number;
  y: number;
  scale: number;
};

export function getAllowedNextStatuses(status: ZoneStatus): ZoneStatus[] {
  return STATUS_TRANSITIONS[status] || [];
}

export function getZoneColor(zone: Pick<MapZone, "status" | "color">): string {
  return zone.color || MAP_STATUS_META[zone.status]?.color || MAP_STATUS_META.not_started.color;
}

export function filterMapsByName(maps: SiteMap[], query: string): SiteMap[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return maps;
  return maps.filter((map) => map.name.toLowerCase().includes(normalized));
}

export function canEditMaps(user: any): boolean {
  return user?.role === "admin" || user?.role === "manager" || user?.workspaceMode === "company_owner";
}

export function clampScale(scale: number): number {
  return Math.min(5, Math.max(0.2, scale));
}

export function fitViewport(containerWidth: number, containerHeight: number, imageWidth: number, imageHeight: number): Viewport {
  if (containerWidth <= 0 || containerHeight <= 0 || imageWidth <= 0 || imageHeight <= 0) {
    return { x: 0, y: 0, scale: 1 };
  }
  const scale = clampScale(Math.min(containerWidth / imageWidth, containerHeight / imageHeight) * 0.92);
  return {
    scale,
    x: (containerWidth - imageWidth * scale) / 2,
    y: (containerHeight - imageHeight * scale) / 2,
  };
}

export function zoomAtPoint(viewport: Viewport, pointer: { x: number; y: number }, direction: 1 | -1): Viewport {
  const oldScale = viewport.scale;
  const nextScale = clampScale(direction > 0 ? oldScale * 1.15 : oldScale / 1.15);
  const mapPoint = {
    x: (pointer.x - viewport.x) / oldScale,
    y: (pointer.y - viewport.y) / oldScale,
  };
  return {
    scale: nextScale,
    x: pointer.x - mapPoint.x * nextScale,
    y: pointer.y - mapPoint.y * nextScale,
  };
}

export async function listMaps(): Promise<SiteMap[]> {
  const response = await apiRequest("GET", "/api/maps");
  return response.json();
}

export async function getMap(mapId: string): Promise<MapWithZones> {
  const response = await apiRequest("GET", `/api/maps/${mapId}`);
  return response.json();
}

export async function createMap(payload: { name: string; venueId?: string | null; companyId?: string }): Promise<SiteMap> {
  const response = await apiRequest("POST", "/api/maps", payload);
  return response.json();
}

export async function updateMap(mapId: string, payload: { name?: string; venueId?: string | null }): Promise<SiteMap> {
  const response = await apiRequest("PUT", `/api/maps/${mapId}`, payload);
  return response.json();
}

export async function deleteMap(mapId: string): Promise<void> {
  await apiRequest("DELETE", `/api/maps/${mapId}`);
}

export async function uploadMapPlan(mapId: string, file: File): Promise<SiteMap> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiRequest("POST", `/api/maps/${mapId}/plan`, formData, true);
  return response.json();
}

export async function removeMapPlan(mapId: string): Promise<SiteMap> {
  const response = await apiRequest("DELETE", `/api/maps/${mapId}/plan`);
  return response.json();
}

export async function saveMapPlanRect(mapId: string, rect: PlanRect): Promise<SiteMap> {
  const response = await apiRequest("PUT", `/api/maps/${mapId}/plan/rect`, {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  });
  return response.json();
}

export async function createZone(mapId: string, payload: { name: string; points: ZonePoint[]; status?: ZoneStatus }): Promise<MapZone> {
  const response = await apiRequest("POST", `/api/maps/${mapId}/zones`, payload);
  return response.json();
}

export async function updateZone(mapId: string, zoneId: string, payload: { name?: string; points?: ZonePoint[]; version: number }): Promise<MapZone> {
  const response = await apiRequest("PUT", `/api/maps/${mapId}/zones/${zoneId}`, payload);
  return response.json();
}

export async function deleteZone(mapId: string, zoneId: string): Promise<void> {
  await apiRequest("DELETE", `/api/maps/${mapId}/zones/${zoneId}`);
}

export async function changeZoneStatus(mapId: string, zoneId: string, status: ZoneStatus, version: number): Promise<MapZone> {
  const response = await apiRequest("PATCH", `/api/maps/${mapId}/zones/${zoneId}/status`, { status, version });
  return response.json();
}

export async function assignZone(
  mapId: string,
  zoneId: string,
  assigneeId: string | null,
  assigneeType: string = "user",
): Promise<MapZone> {
  const response = await apiRequest("PUT", `/api/maps/${mapId}/zones/${zoneId}/assignee`, {
    assigneeId: assigneeId || null,
    assigneeType,
  });
  return response.json();
}

export async function addZoneComment(mapId: string, zoneId: string, text: string): Promise<MapZone> {
  const response = await apiRequest("POST", `/api/maps/${mapId}/zones/${zoneId}/comments`, { text });
  return response.json();
}

export async function deleteZoneComment(mapId: string, zoneId: string, commentId: string): Promise<MapZone> {
  const response = await apiRequest("DELETE", `/api/maps/${mapId}/zones/${zoneId}/comments/${commentId}`);
  return response.json();
}

export async function addZonePhoto(mapId: string, zoneId: string, url: string): Promise<MapZone> {
  const response = await apiRequest("POST", `/api/maps/${mapId}/zones/${zoneId}/photos`, { url });
  return response.json();
}

export async function deleteZonePhoto(mapId: string, zoneId: string, url: string): Promise<MapZone> {
  const response = await apiRequest("DELETE", `/api/maps/${mapId}/zones/${zoneId}/photos?url=${encodeURIComponent(url)}`);
  return response.json();
}

/** Загрузить файл фото (переиспользуем общий эндпоинт) и получить его URL. */
export async function uploadZonePhotoFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("photo", file);
  const response = await apiRequest("POST", "/api/equipment/photos/upload", formData, true);
  const data = await response.json();
  return data.url as string;
}

export function mapImageUrl(src?: string | null): string {
  if (!src) return "";
  return apiUrl(src);
}
