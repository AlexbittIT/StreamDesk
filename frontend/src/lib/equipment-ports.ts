import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// ===== Типы (контракт backend /api/equipment-ports, Task 2 Phase B) =====

export interface PortDef {
  id: string;
  name: string;
  type: "in" | "out";
  portType?: string;
}

export interface PortsMap {
  portsIn: PortDef[];
  portsOut: PortDef[];
}

export interface ConnectorType {
  id: string;
  label: string;
  category: string;
  color: string;
}

export interface ModelPorts {
  id: string;
  manufacturer: string;
  model: string;
  deviceType?: string;
  ports: PortsMap;
  configurablePorts: boolean;
  status: "pending_review" | "confirmed" | "rejected";
  sourceModel?: string;
  sourceUrl?: string | null;
  confidence?: number | null;
}

export interface LookupResponse {
  source: "cache" | "ai";
  result: ModelPorts;
  unmappedTerms: string[];
}

export interface DiscoveredDevice {
  name: string;
  manufacturer?: string;
  model?: string;
  deviceType?: string;
  specifications?: Record<string, any>;
}

export interface DiscoverResponse {
  device: DiscoveredDevice;
  ports: PortsMap;
  configurablePorts: boolean;
  confidence?: number | null;
  unmappedTerms: string[];
}

export interface UnmappedTerm {
  id: string;
  term: string;
  manufacturer?: string | null;
  model?: string | null;
  context?: Record<string, any> | null;
  suggestedCode?: string | null;
  status: "pending" | "added" | "dismissed";
  resolvedBy?: string | null;
  createdAt?: string;
}

const BASE = "/api/equipment-ports";

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await apiRequest("POST", url, body);
  return res.json() as Promise<T>;
}

// ===== API =====

export function lookupPorts(manufacturer: string, model: string): Promise<LookupResponse> {
  return postJson<LookupResponse>(`${BASE}/lookup`, { manufacturer, model });
}

export function discoverDevice(query: string): Promise<DiscoverResponse> {
  return postJson<DiscoverResponse>(`${BASE}/discover`, { query });
}

/** До 10 моделей-подсказок по запросу (вкладка «Поиск в интернете»). */
export function suggestModels(query: string): Promise<DiscoverResponse[]> {
  return postJson<DiscoverResponse[]>(`${BASE}/suggest`, { query });
}

export function approveDevice(body: {
  device: DiscoveredDevice;
  ports: PortsMap;
  configurablePorts: boolean;
}): Promise<unknown> {
  return postJson<unknown>(`${BASE}/approve`, body);
}

export function confirmPorts(id: string): Promise<ModelPorts> {
  return postJson<ModelPorts>(`${BASE}/${id}/confirm`);
}

export async function updatePorts(id: string, ports: PortsMap, status?: string): Promise<ModelPorts> {
  const res = await apiRequest("PATCH", `${BASE}/${id}`, { ports, status });
  return res.json() as Promise<ModelPorts>;
}

export async function listUnmapped(status?: string): Promise<UnmappedTerm[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await apiRequest("GET", `${BASE}/unmapped-terms${qs}`);
  return res.json() as Promise<UnmappedTerm[]>;
}

export function resolveUnmapped(
  id: string,
  action: "add" | "dismiss",
  suggestedCode?: string,
): Promise<UnmappedTerm> {
  return postJson<UnmappedTerm>(`${BASE}/unmapped-terms/${id}/resolve`, { action, suggestedCode });
}

// ===== Справочник разъёмов (Phase A, единый источник) =====

/** Резерв на случай пустого ответа/офлайна — чтобы селекты не были пустыми. */
export const FALLBACK_CONNECTOR_TYPES: ConnectorType[] = [
  { id: "HDMI", label: "HDMI", category: "video", color: "#3F3F3F" },
  { id: "SDI", label: "SDI", category: "video", color: "#6FA8DC" },
  { id: "DISPLAYPORT", label: "DisplayPort", category: "video", color: "#E8B647" },
  { id: "NDI", label: "NDI", category: "video", color: "#2A9DF4" },
  { id: "XLR", label: "XLR", category: "audio", color: "#6FCF4D" },
  { id: "JACK", label: "Jack (TRS/TS)", category: "audio", color: "#2DD4C4" },
  { id: "RCA", label: "RCA", category: "audio", color: "#1B7A1B" },
  { id: "ETHERNET", label: "Ethernet", category: "network", color: "#1C4FA0" },
  { id: "USB", label: "USB", category: "data", color: "#D946C0" },
  { id: "USB_C", label: "USB-C", category: "data", color: "#C13FB0" },
  { id: "POWER", label: "Power", category: "power", color: "#2E5FA8" },
  { id: "WIRELESS", label: "Wireless", category: "wireless", color: "#7CA8DC" },
];

/** Каталог типов разъёмов из бэкенда (42 типа). Пустой ответ → fallback. */
export function useConnectorTypes() {
  const query = useQuery<ConnectorType[]>({
    queryKey: ["/api/connection-schemas/connector-types"],
    staleTime: 5 * 60 * 1000,
  });
  const types = query.data && query.data.length > 0 ? query.data : FALLBACK_CONNECTOR_TYPES;
  return { ...query, types };
}
