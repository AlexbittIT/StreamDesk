import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  Building2,
  CheckCircle2,
  Cpu,
  Database,
  Gauge,
  HardDrive,
  Network,
  RefreshCw,
  Search,
  ServerCog,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  Wrench,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PERMISSIONS } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type HeatPoint = {
  date: string;
  count: number;
  intensity: number;
};

type CompanyActivity = {
  companyId: string;
  name: string;
  totalYear: number;
  totalMonth: number;
  activityHeatmap: HeatPoint[];
  recentSparkline: Array<{ weekStart: string; count: number }>;
  monthly: Array<{ month: string; label: string; count: number }>;
};

type TelemetryData = {
  generatedAt: string;
  serverHost?: any;
  hostLoad?: any[];
  activityHeatmap: HeatPoint[];
  recentSparkline: Array<{ weekStart: string; count: number }>;
  hourlyLoad: any[];
  companyLoad: Array<{
    companyId: string;
    name: string;
    activity24h: number;
    avgCpu24h: number;
    avgMemory24h: number;
    systemsTotal: number;
    systemsOnline: number;
    openIncidents: number;
  }>;
  companyActivity?: CompanyActivity[];
  systemStatus: Array<{ name: string; value: number }>;
  incidentSeverity: Array<{ name: string; value: number }>;
  workspaceNeeds: Array<{ name: string; value: number }>;
  serviceUsage?: Array<{ name: string; value: number }>;
  opsAdvisor?: Array<{
    severity: string;
    title: string;
    message: string;
    recommendation: string;
    companyId?: string;
  }>;
  topSystems: Array<{
    id: string;
    name: string;
    companyName: string;
    status: string;
    cpuPercent: number | null;
    memoryPercent: number | null;
    diskPercent: number | null;
    networkMbps: number | null;
    lastPing: string | null;
  }>;
};

const COLORS = {
  violet: "#a78bfa",
  blue: "#60a5fa",
  cyan: "#22d3ee",
  green: "#34d399",
  amber: "#f59e0b",
  red: "#fb7185",
  slate: "#64748b",
};

const PIE_COLORS = [COLORS.violet, COLORS.blue, COLORS.amber, COLORS.red, COLORS.cyan, COLORS.green];
const MONTH_LABELS = ["СЏРЅРІ", "С„РµРІ", "РјР°СЂ", "Р°РїСЂ", "РјР°Р№", "РёСЋРЅ", "РёСЋР»", "Р°РІРі", "СЃРµРЅ", "РѕРєС‚", "РЅРѕСЏ", "РґРµРє"];
const REFRESH_OPTIONS = [
  { value: 1000, label: "1 СЃРµРє" },
  { value: 5000, label: "5 СЃРµРє" },
  { value: 15000, label: "15 СЃРµРє" },
  { value: 60000, label: "1 РјРёРЅ" },
  { value: 300000, label: "5 РјРёРЅ" },
];
const PLATFORM_TABS = ["overview", "companies", "users", "ai", "incidents", "metrics"] as const;
type PlatformTab = typeof PLATFORM_TABS[number];

function normalizePlatformTab(value?: string | null): PlatformTab {
  return PLATFORM_TABS.includes(value as PlatformTab) ? (value as PlatformTab) : "overview";
}

function readPlatformTabFromUrl(): PlatformTab {
  if (typeof window === "undefined") return "overview";
  return normalizePlatformTab(new URLSearchParams(window.location.search).get("tab"));
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function pct(value: unknown) {
  return `${Math.round(num(value))}%`;
}

function formatBytes(value?: number | null) {
  const bytes = num(value);
  if (bytes <= 0) return "0 Р‘";
  const units = ["Р‘", "РљР‘", "РњР‘", "Р“Р‘", "РўР‘"];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size >= 10 ? Math.round(size) : Math.round(size * 10) / 10} ${units[index]}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "РЅРµС‚ РґР°РЅРЅС‹С…";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "РЅРµС‚ РґР°РЅРЅС‹С…";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatUptime(seconds?: number | null) {
  const value = Math.max(0, num(seconds));
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (days > 0) return `${days} Рґ ${hours} С‡`;
  if (hours > 0) return `${hours} С‡ ${minutes} РјРёРЅ`;
  return `${minutes} РјРёРЅ`;
}

function statusLabel(value: string) {
  switch (value) {
    case "online": return "РћРЅР»Р°Р№РЅ";
    case "offline": return "РћС„Р»Р°Р№РЅ";
    case "maintenance": return "РћР±СЃР»СѓР¶РёРІР°РЅРёРµ";
    case "open": return "РћС‚РєСЂС‹С‚Рѕ";
    case "investigating": return "Р’ СЂР°Р±РѕС‚Рµ";
    case "resolved": return "Р’С‹РїРѕР»РЅРµРЅРѕ";
    case "closed": return "Р—Р°РєСЂС‹С‚Рѕ";
    case "active": return "РђРєС‚РёРІРЅР°";
    case "suspended": return "РћСЃС‚Р°РЅРѕРІР»РµРЅР°";
    default: return value || "РЅРµРёР·РІРµСЃС‚РЅРѕ";
  }
}

function severityLabel(value: string) {
  switch (value) {
    case "critical": return "РљСЂРёС‚РёС‡РЅРѕ";
    case "high": return "Р’С‹СЃРѕРєРёР№";
    case "medium": return "РЎСЂРµРґРЅРёР№";
    case "low": return "РќРёР·РєРёР№";
    default: return value || "РЅРµ СѓРєР°Р·Р°РЅ";
  }
}

function usageLabel(value: string) {
  switch (value) {
    case "heartbeat": return "Heartbeat";
    case "task_activity": return "Р—Р°РґР°С‡Рё";
    case "project_activity": return "РџСЂРѕРµРєС‚С‹";
    case "company_created": return "РљРѕРјРїР°РЅРёРё";
    case "user_registered": return "Р РµРіРёСЃС‚СЂР°С†РёРё";
    case "incident": return "РРЅС†РёРґРµРЅС‚С‹";
    case "system_seen": return "РЎРёСЃС‚РµРјС‹";
    case "streamdesk_host": return "РЎРµСЂРІРµСЂ";
    default: return value;
  }
}

function createEmptyTelemetry(): TelemetryData {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 364);
  const activityHeatmap = Array.from({ length: 365 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return { date: day.toISOString().slice(0, 10), count: 0, intensity: 0 };
  });
  const hourlyLoad = Array.from({ length: 24 }, (_, index) => {
    const date = new Date(now.getTime() - (23 - index) * 60 * 60 * 1000);
    return {
      label: date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      heartbeats: 0,
      activeSystems: 0,
      cpuPercent: 0,
      memoryPercent: 0,
      diskPercent: 0,
      networkMbps: 0,
    };
  });
  return {
    generatedAt: now.toISOString(),
    hostLoad: hourlyLoad.map((point) => ({
      label: point.label,
      cpuPercent: 0,
      memoryPercent: 0,
      diskPercent: 0,
      processHeapPercent: 0,
      processRssMb: 0,
      networkRxMbps: 0,
      networkTxMbps: 0,
      loadAvg1: 0,
    })),
    activityHeatmap,
    recentSparkline: [],
    hourlyLoad,
    companyLoad: [],
    systemStatus: [],
    incidentSeverity: [],
    workspaceNeeds: [],
    serviceUsage: [],
    opsAdvisor: [],
    topSystems: [],
    companyActivity: [],
  };
}

function issueListForCompany(item: any, load?: any) {
  const issues: Array<{ level: "critical" | "warning" | "info"; text: string }> = [];
  const offline = num(item?.systems?.offline);
  const openIncidents = num(item?.incidents?.open ?? load?.openIncidents);
  const overdue = num(item?.tasks?.overdue);
  if (item?.company?.status && item.company.status !== "active") {
    issues.push({ level: "critical", text: `РЎС‚Р°С‚СѓСЃ РєРѕРјРїР°РЅРёРё: ${statusLabel(item.company.status)}` });
  }
  if (offline > 0) issues.push({ level: "warning", text: `РћС„Р»Р°Р№РЅ СЃРёСЃС‚РµРј: ${offline}` });
  if (openIncidents > 0) issues.push({ level: "warning", text: `РћС‚РєСЂС‹С‚С‹С… РёРЅС†РёРґРµРЅС‚РѕРІ: ${openIncidents}` });
  if (overdue > 0) issues.push({ level: "info", text: `РџСЂРѕСЃСЂРѕС‡РµРЅРЅС‹С… Р·Р°РґР°С‡: ${overdue}` });
  if (!item?.workspace?.monitoringEnabled) issues.push({ level: "info", text: "РњРѕРЅРёС‚РѕСЂРёРЅРі РєРѕРјРїР°РЅРёРё РІС‹РєР»СЋС‡РµРЅ" });
  if (num(item?.systems?.total) === 0) issues.push({ level: "info", text: "РќРµС‚ РїРѕРґРєР»СЋС‡РµРЅРЅС‹С… СЃРёСЃС‚РµРј" });
  return issues;
}

function ActivityHeatmap({
  title,
  points,
}: {
  title: string;
  points: HeatPoint[];
}) {
  const visiblePoints = points;
  const total = visiblePoints.reduce((sum, point) => sum + point.count, 0);
  const weeks = useMemo(() => {
    const result: Array<Array<HeatPoint | null>> = [];
    let current = Array<HeatPoint | null>(7).fill(null);
    visiblePoints.forEach((point, index) => {
      const date = new Date(`${point.date}T00:00:00`);
      const dayIndex = (date.getDay() + 6) % 7;
      if (dayIndex === 0 && index !== 0) {
        result.push(current);
        current = Array<HeatPoint | null>(7).fill(null);
      }
      current[dayIndex] = point;
    });
    if (current.some(Boolean)) result.push(current);
    return result;
  }, [visiblePoints]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="font-semibold">{title}</div>
          <div className="text-sm text-muted-foreground">
            {total.toLocaleString("ru-RU")} СЃРѕР±С‹С‚РёР№ Р·Р° РіРѕРґ
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-1 text-[11px] text-muted-foreground">
        {MONTH_LABELS.map((label) => <div key={label} className="text-center">{label}</div>)}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-background/50 p-3">
        <div className="grid w-max grid-flow-col gap-1">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="grid grid-rows-7 gap-1">
              {week.map((cell, dayIndex) => {
                const intensity = cell?.intensity ?? 0;
                const color =
                  intensity >= 4 ? "bg-fuchsia-400" :
                  intensity === 3 ? "bg-violet-400" :
                  intensity === 2 ? "bg-violet-500/60" :
                  intensity === 1 ? "bg-violet-500/25" :
                  "bg-muted";
                return (
                  <div
                    key={`${weekIndex}-${dayIndex}`}
                    title={cell ? `${cell.date}: ${cell.count}` : ""}
                    className={cn("h-3 w-3 rounded-[3px] border border-white/5", color)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

function TodayUsageChart({ data }: { data: any[] }) {
  const chartData = (data || []).map((point) => ({
    label: point.label,
    heartbeats: num(point.heartbeats),
    activeSystems: num(point.activeSystems),
    cpuPercent: num(point.cpuPercent),
    memoryPercent: num(point.memoryPercent),
  }));

  return (
    <div className="space-y-2">
      <div>
        <div className="font-semibold">РСЃРїРѕР»СЊР·РѕРІР°РЅРёРµ СЃРµСЂРІРёСЃР° СЃРµРіРѕРґРЅСЏ</div>
        <div className="text-sm text-muted-foreground">Heartbeat, Р°РєС‚РёРІРЅС‹Рµ СЃРёСЃС‚РµРјС‹ Рё РЅР°РіСЂСѓР·РєР° РѕР±РЅРѕРІР»СЏСЋС‚СЃСЏ РІ РІС‹Р±СЂР°РЅРЅРѕРј РёРЅС‚РµСЂРІР°Р»Рµ.</div>
      </div>
      <div className="h-44 rounded-lg border bg-background/50 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.16)" />
            <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
            <RechartsTooltip />
            <Legend />
            <Area type="monotone" dataKey="heartbeats" name="Heartbeat" stroke={COLORS.violet} fill={COLORS.violet} fillOpacity={0.18} />
            <Line type="monotone" dataKey="activeSystems" name="РђРєС‚РёРІРЅС‹Рµ СЃРёСЃС‚РµРјС‹" stroke={COLORS.green} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="cpuPercent" name="CPU %" stroke={COLORS.amber} strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-semibold">{value}</div>
        </div>
        <Icon className="h-5 w-5 text-primary" />
      </CardContent>
    </Card>
  );
}

export default function PlatformAdmin() {
  let currentUser: any = {};
  try {
    currentUser = JSON.parse(localStorage.getItem("streamstudio_user") || "{}");
  } catch {
    currentUser = {};
  }

  const isPlatformAdmin = Array.isArray(currentUser?.permissions) && currentUser.permissions.includes(PERMISSIONS.PLATFORM_ADMIN);
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<PlatformTab>(() => readPlatformTabFromUrl());
  const [companySearch, setCompanySearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [incidentSearch, setIncidentSearch] = useState("");
  const [incidentStatusFilter, setIncidentStatusFilter] = useState("active");
  const [incidentSeverityFilter, setIncidentSeverityFilter] = useState("all");
  const [refreshIntervalMs, setRefreshIntervalMs] = useState(5000);
  const [opsAiResult, setOpsAiResult] = useState<{ mode: string; model: string; content: string; generatedAt: string } | null>(null);

  useEffect(() => {
    const syncTab = () => setActiveTab(readPlatformTabFromUrl());
    syncTab();
    window.addEventListener("popstate", syncTab);
    window.addEventListener("platform-admin-tab-change", syncTab);
    return () => {
      window.removeEventListener("popstate", syncTab);
      window.removeEventListener("platform-admin-tab-change", syncTab);
    };
  }, []);

  const handlePlatformTabChange = (value: string) => {
    const nextTab = normalizePlatformTab(value);
    setActiveTab(nextTab);
    if (typeof window === "undefined") return;
    const nextUrl = nextTab === "overview" ? "/platform-admin" : `/platform-admin?tab=${nextTab}`;
    if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
      window.history.replaceState(null, "", nextUrl);
      window.dispatchEvent(new Event("platform-admin-tab-change"));
    }
  };

  const overviewQuery = useQuery<any>({
    queryKey: ["/api/platform/overview"],
    enabled: isPlatformAdmin,
    refetchInterval: refreshIntervalMs,
  });
  const telemetryQuery = useQuery<TelemetryData>({
    queryKey: ["/api/platform/telemetry"],
    enabled: isPlatformAdmin,
    refetchInterval: refreshIntervalMs,
  });
  const incidentsQuery = useQuery<any[]>({
    queryKey: ["/api/platform/incidents"],
    enabled: isPlatformAdmin,
    refetchInterval: refreshIntervalMs,
  });
  const usersQuery = useQuery<any[]>({
    queryKey: ["/api/platform/users"],
    enabled: isPlatformAdmin,
    refetchInterval: refreshIntervalMs,
  });

  const incidentStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiRequest("PATCH", `/api/platform/incidents/${id}`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/incidents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/overview"] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/telemetry"] });
      toast({ title: "Р“РѕС‚РѕРІРѕ", description: "РЎС‚Р°С‚СѓСЃ РёРЅС†РёРґРµРЅС‚Р° РѕР±РЅРѕРІР»РµРЅ." });
    },
    onError: (error: any) => {
      toast({ title: "РћС€РёР±РєР°", description: error?.message || "РќРµ СѓРґР°Р»РѕСЃСЊ РѕР±РЅРѕРІРёС‚СЊ РёРЅС†РёРґРµРЅС‚", variant: "destructive" });
    },
  });

  const opsAiMutation = useMutation({
    mutationFn: async (mode: "quick" | "deep") => {
      const response = await apiRequest("POST", "/api/platform/ops-ai/analyze", { mode });
      return response.json();
    },
    onSuccess: (data) => {
      setOpsAiResult(data);
      toast({ title: "AI-Р°РЅР°Р»РёР· РіРѕС‚РѕРІ", description: data?.model ? `РњРѕРґРµР»СЊ: ${data.model}` : undefined });
    },
    onError: (error: any) => {
      toast({
        title: "AI-Р°РЅР°Р»РёР· РЅРµРґРѕСЃС‚СѓРїРµРЅ",
        description: error?.message || "РџСЂРѕРІРµСЂСЊС‚Рµ HUGGINGFACE_API_KEY / HF_TOKEN РІ .env",
        variant: "destructive",
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      const response = await apiRequest("POST", `/api/platform/users/${id}/reset-password`, { password });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/users"] });
      toast({ title: "Р“РѕС‚РѕРІРѕ", description: "РџР°СЂРѕР»СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РѕР±РЅРѕРІР»РµРЅ." });
    },
    onError: (error: any) => {
      toast({ title: "РћС€РёР±РєР°", description: error?.message || "РќРµ СѓРґР°Р»РѕСЃСЊ СЃР±СЂРѕСЃРёС‚СЊ РїР°СЂРѕР»СЊ", variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/platform/users/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/overview"] });
      toast({ title: "Р вЂњР С•РЎвЂљР С•Р Р†Р С•", description: "Р СџР С•Р В»РЎРЉР В·Р С•Р Р†Р В°РЎвЂљР ВµР В»РЎРЉ РЎС“Р Т‘Р В°Р В»Р ВµР Р… Р С‘Р В· Р В°Р С”РЎвЂљР С‘Р Р†Р Р…РЎвЂ№РЎвЂ¦." });
    },
    onError: (error: any) => {
      toast({ title: "Р С›РЎв‚¬Р С‘Р В±Р С”Р В°", description: error?.message || "Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ РЎС“Р Т‘Р В°Р В»Р С‘РЎвЂљРЎРЉ Р С—Р С•Р В»РЎРЉР В·Р С•Р Р†Р В°РЎвЂљР ВµР В»РЎРЏ", variant: "destructive" });
    },
  });

  const overview = overviewQuery.data;
  const telemetry = telemetryQuery.data ?? createEmptyTelemetry();
  const incidents = incidentsQuery.data ?? [];
  const platformUsers = (usersQuery.data ?? []).filter((user: any) => user.active !== false);
  const companies = Array.isArray(overview?.companies) ? overview.companies : [];
  const openIncidents = incidents.filter((incident) => !["resolved", "closed"].includes(String(incident.status)));
  const refreshing = overviewQuery.isFetching || telemetryQuery.isFetching || incidentsQuery.isFetching || usersQuery.isFetching;

  const companyLoadById = useMemo(() => new Map((telemetry.companyLoad || []).map((item) => [item.companyId, item])), [telemetry.companyLoad]);
  const companyActivityById = useMemo(() => new Map((telemetry.companyActivity || []).map((item) => [item.companyId, item])), [telemetry.companyActivity]);
  const filteredCompanies = useMemo(() => {
    const search = companySearch.trim().toLowerCase();
    return companies.filter((item: any) => {
      const load = companyLoadById.get(item.company?.id);
      const issues = issueListForCompany(item, load);
      const matchesSearch = !search || `${item.company?.name || ""} ${item.company?.slug || ""}`.toLowerCase().includes(search);
      const matchesFilter =
        companyFilter === "all" ||
        (companyFilter === "active" && item.company?.status === "active" && issues.length === 0) ||
        (companyFilter === "problem" && issues.length > 0) ||
        (companyFilter === "offline" && num(item.systems?.offline) > 0) ||
        (companyFilter === "incidents" && num(item.incidents?.open ?? load?.openIncidents) > 0);
      return matchesSearch && matchesFilter;
    });
  }, [companies, companySearch, companyFilter, companyLoadById]);

  const selectedCompany = useMemo(() => {
    return companies.find((item: any) => item.company?.id === selectedCompanyId) || filteredCompanies[0] || companies[0] || null;
  }, [companies, filteredCompanies, selectedCompanyId]);
  const selectedCompanyLoad = selectedCompany ? companyLoadById.get(selectedCompany.company.id) : null;
  const selectedCompanyActivity = selectedCompany ? companyActivityById.get(selectedCompany.company.id) : null;
  const selectedCompanyIssues = selectedCompany ? issueListForCompany(selectedCompany, selectedCompanyLoad) : [];
  const metricInsights = useMemo(() => {
    const insights: Array<{ level: "good" | "warning" | "critical"; title: string; text: string }> = [];
    const cpu = num(telemetry.serverHost?.cpu?.percent ?? overview?.server?.cpu?.percent);
    const ram = num(telemetry.serverHost?.memory?.usedPercent ?? overview?.server?.memory?.usedPercent);
    const disk = num(telemetry.serverHost?.disk?.usedPercent ?? overview?.server?.disk?.usedPercent);
    const offline = num(overview?.totals?.offlineSystems);
    const criticalIncidents = incidents.filter((incident) => incident.severity === "critical" && !["resolved", "closed"].includes(String(incident.status))).length;

    if (cpu >= 85) insights.push({ level: "critical", title: "CPU РїРµСЂРµРіСЂСѓР¶РµРЅ", text: `РЎРµР№С‡Р°СЃ ${Math.round(cpu)}%. РќСѓР¶РµРЅ СЂР°Р·Р±РѕСЂ РїСЂРѕС†РµСЃСЃРѕРІ Рё С‡Р°СЃС‚РѕС‚С‹ Р·Р°РїСЂРѕСЃРѕРІ.` });
    else if (cpu >= 65) insights.push({ level: "warning", title: "CPU СЂР°СЃС‚РµС‚", text: `РЎРµР№С‡Р°СЃ ${Math.round(cpu)}%. РЎС‚РѕРёС‚ РїРѕСЃРјРѕС‚СЂРµС‚СЊ РІСЃРїР»РµСЃРєРё РїРѕ РєРѕРјРїР°РЅРёСЏРј Рё Р°РіРµРЅС‚Р°Рј.` });
    else insights.push({ level: "good", title: "CPU РІ РЅРѕСЂРјРµ", text: `РЎРµР№С‡Р°СЃ ${Math.round(cpu)}%, Р·Р°РїР°СЃ РїРѕ СЃРµСЂРІРµСЂСѓ РµСЃС‚СЊ.` });

    if (ram >= 85) insights.push({ level: "critical", title: "RAM РїРѕС‡С‚Рё Р·Р°РїРѕР»РЅРµРЅР°", text: `РџР°РјСЏС‚СЊ Р·Р°РЅСЏС‚Р° РЅР° ${Math.round(ram)}%. РџСЂРѕРІРµСЂСЊС‚Рµ Node heap Рё С„РѕРЅРѕРІС‹Рµ Р·Р°РґР°С‡Рё.` });
    else if (ram >= 70) insights.push({ level: "warning", title: "RAM Р±Р»РёР·РєРѕ Рє РІРµСЂС…РЅРµР№ РіСЂР°РЅРёС†Рµ", text: `РџР°РјСЏС‚СЊ Р·Р°РЅСЏС‚Р° РЅР° ${Math.round(ram)}%. РЎР»РµРґРёС‚Рµ Р·Р° С‚СЂРµРЅРґРѕРј РІ Р±Р»РёР¶Р°Р№С€РёРµ РјРёРЅСѓС‚С‹.` });

    if (disk >= 85) insights.push({ level: "critical", title: "Р”РёСЃРє РїРѕС‡С‚Рё Р·Р°РїРѕР»РЅРµРЅ", text: `РЎРІРѕР±РѕРґРЅРѕРµ РјРµСЃС‚Рѕ Р·Р°РєР°РЅС‡РёРІР°РµС‚СЃСЏ: Р·Р°РЅСЏС‚Рѕ ${Math.round(disk)}%. РџСЂРѕРІРµСЂСЊС‚Рµ uploads, Р»РѕРіРё Рё Р±СЌРєР°РїС‹.` });
    if (offline > 0) insights.push({ level: "warning", title: "Р•СЃС‚СЊ РѕС„Р»Р°Р№РЅ-СЃРёСЃС‚РµРјС‹", text: `${offline} СЃРёСЃС‚РµРј РЅРµ РїСЂРёСЃС‹Р»Р°СЋС‚ heartbeat. РџСЂРѕРІРµСЂСЊС‚Рµ Р°РіРµРЅС‚С‹ Рё СЃРµС‚СЊ.` });
    if (criticalIncidents > 0) insights.push({ level: "critical", title: "РљСЂРёС‚РёС‡РЅС‹Рµ РёРЅС†РёРґРµРЅС‚С‹", text: `${criticalIncidents} Р·Р°СЏРІРѕРє С‚СЂРµР±СѓСЋС‚ РїРµСЂРІРѕРѕС‡РµСЂРµРґРЅРѕР№ РѕР±СЂР°Р±РѕС‚РєРё.` });
    if (openIncidents.length === 0 && offline === 0 && cpu < 65 && ram < 70 && disk < 80) {
      insights.push({ level: "good", title: "РџР»Р°С‚С„РѕСЂРјР° СЃС‚Р°Р±РёР»СЊРЅР°", text: "РћС‚РєСЂС‹С‚С‹С… РёРЅС†РёРґРµРЅС‚РѕРІ Рё СЏРІРЅС‹С… РїСЂРѕР±Р»РµРј РїРѕ РёРЅС„СЂР°СЃС‚СЂСѓРєС‚СѓСЂРµ СЃРµР№С‡Р°СЃ РЅРµС‚." });
    }
    return insights;
  }, [telemetry.serverHost, overview?.server, overview?.totals, incidents, openIncidents.length]);

  const filteredIncidents = useMemo(() => {
    const search = incidentSearch.trim().toLowerCase();
    return incidents.filter((incident) => {
      const status = String(incident.status || "open");
      const done = status === "resolved" || status === "closed";
      const matchesStatus =
        incidentStatusFilter === "all" ||
        (incidentStatusFilter === "active" && !done) ||
        (incidentStatusFilter === "done" && done) ||
        status === incidentStatusFilter;
      const matchesSeverity = incidentSeverityFilter === "all" || incident.severity === incidentSeverityFilter;
      const text = `${incident.title || ""} ${incident.message || ""} ${incident.company?.name || ""} ${incident.reporter?.name || ""}`.toLowerCase();
      return matchesStatus && matchesSeverity && (!search || text.includes(search));
    });
  }, [incidents, incidentSearch, incidentStatusFilter, incidentSeverityFilter]);

  async function refreshAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/platform/overview"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/platform/telemetry"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/platform/incidents"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/platform/users"] }),
    ]);
  }

  const refreshLabel = REFRESH_OPTIONS.find((option) => option.value === refreshIntervalMs)?.label || `${refreshIntervalMs / 1000} СЃРµРє`;
  const lastUpdatedLabel = formatDateTime(telemetry.generatedAt || overview?.generatedAt);

  if (!isPlatformAdmin) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <Card className="max-w-lg">
          <CardContent className="py-8 text-center">
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
            <h2 className="mb-2 text-lg font-semibold">Р”РѕСЃС‚СѓРї Р·Р°РєСЂС‹С‚</h2>
            <p className="text-sm text-muted-foreground">Р­С‚Р° РїР°РЅРµР»СЊ РґРѕСЃС‚СѓРїРЅР° С‚РѕР»СЊРєРѕ РІР»Р°РґРµР»СЊС†Сѓ РїР»Р°С‚С„РѕСЂРјС‹.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2">
          <Badge variant="secondary">Owner Console</Badge>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">РљРѕРЅС‚СЂРѕР»СЊ РїР»Р°С‚С„РѕСЂРјС‹ StreamDesk</h1>
          <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
            РЎРµСЂРІРµСЂ, РєРѕРјРїР°РЅРёРё, Р°РіРµРЅС‚С‹, Р¶Р°Р»РѕР±С‹, AI-РґРёР°РіРЅРѕСЃС‚РёРєР° Рё Р°РєС‚РёРІРЅРѕСЃС‚СЊ СЂР°Р·РЅРµСЃРµРЅС‹ РїРѕ РІРєР»Р°РґРєР°Рј, С‡С‚РѕР±С‹ Р±С‹СЃС‚СЂРѕ РІРёРґРµС‚СЊ РіРґРµ РЅР°РіСЂСѓР·РєР°, РіРґРµ РїСЂРѕР±Р»РµРјР° Рё С‡С‚Рѕ СѓР¶Рµ РІР·СЏС‚Рѕ РІ СЂР°Р±РѕС‚Сѓ.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="text-xs text-muted-foreground sm:text-right">
            <div>РћР±РЅРѕРІР»РµРЅРѕ: {lastUpdatedLabel}</div>
            <div>РРЅС‚РµСЂРІР°Р»: {refreshLabel}</div>
          </div>
          <Select value={String(refreshIntervalMs)} onValueChange={(value) => setRefreshIntervalMs(Number(value))}>
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REFRESH_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => void refreshAll()} disabled={refreshing}>
            <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
            РћР±РЅРѕРІРёС‚СЊ
          </Button>
        </div>
      </div>

      {(overviewQuery.error || telemetryQuery.error || incidentsQuery.error) && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-500" />
            <div>
              <div className="font-medium">Р§Р°СЃС‚СЊ РґР°РЅРЅС‹С… РЅРµ Р·Р°РіСЂСѓР·РёР»Р°СЃСЊ</div>
              <div className="text-sm text-muted-foreground">РџСЂРѕРІРµСЂСЊС‚Рµ Р°РІС‚РѕСЂРёР·Р°С†РёСЋ owner-Р°РєРєР°СѓРЅС‚Р° Рё СЃРѕСЃС‚РѕСЏРЅРёРµ API, Р·Р°С‚РµРј РѕР±РЅРѕРІРёС‚Рµ РїР°РЅРµР»СЊ.</div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={handlePlatformTabChange} className="space-y-5">
        <TabsContent value="overview" className="mt-0 space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <StatCard label="РљРѕРјРїР°РЅРёРё" value={overview?.totals?.companies ?? 0} icon={Building2} />
            <StatCard label="РџРѕР»СЊР·РѕРІР°С‚РµР»Рё" value={overview?.totals?.users ?? 0} icon={Users} />
            <StatCard label="РћС‚РєСЂС‹С‚С‹Рµ РёРЅС†РёРґРµРЅС‚С‹" value={overview?.totals?.openIncidents ?? openIncidents.length} icon={Wrench} />
            <StatCard label="РћС„Р»Р°Р№РЅ СЃРёСЃС‚РµРј" value={overview?.totals?.offlineSystems ?? 0} icon={ServerCog} />
            <StatCard label="RAM СЃРµСЂРІРµСЂР°" value={pct(telemetry.serverHost?.memory?.usedPercent ?? overview?.server?.memory?.usedPercent)} icon={Cpu} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ServerCog className="h-5 w-5" />РЎРµСЂРІРµСЂ StreamDesk</CardTitle>
                <CardDescription>РЎРѕСЃС‚РѕСЏРЅРёРµ С…РѕСЃС‚Р°, РЅР° РєРѕС‚РѕСЂРѕРј СЂР°Р±РѕС‚Р°РµС‚ РїР»Р°С‚С„РѕСЂРјР°.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ["CPU", pct(telemetry.serverHost?.cpu?.percent ?? overview?.server?.cpu?.percent), Cpu],
                    ["RAM", pct(telemetry.serverHost?.memory?.usedPercent ?? overview?.server?.memory?.usedPercent), Database],
                    ["Р”РёСЃРє", pct(telemetry.serverHost?.disk?.usedPercent ?? overview?.server?.disk?.usedPercent), HardDrive],
                    ["Uptime", formatUptime(telemetry.serverHost?.uptimeSeconds ?? overview?.server?.uptimeSeconds), ShieldCheck],
                    ["RX/TX", `${num(telemetry.serverHost?.network?.rxMbps)} / ${num(telemetry.serverHost?.network?.txMbps)} Mbps`, Network],
                    ["Node RSS", `${num(telemetry.serverHost?.appMemory?.rssMb ?? overview?.server?.appMemory?.rssMb)} MB`, Activity],
                  ].map(([label, value, Icon]: any) => (
                    <div key={label} className="rounded-lg border bg-background/60 p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-muted-foreground">{label}</div>
                          <div className="font-semibold">{value}</div>
                        </div>
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border bg-background/60 p-3 text-sm text-muted-foreground">
                  <div className="font-medium text-foreground">{telemetry.serverHost?.hostname || overview?.server?.hostname || "StreamDesk host"}</div>
                  <div>{telemetry.serverHost?.cpu?.model || overview?.server?.cpu?.model || "CPU РЅРµ РѕРїСЂРµРґРµР»РµРЅ"}</div>
                  <div>RAM РІСЃРµРіРѕ: {formatBytes(telemetry.serverHost?.memory?.total ?? overview?.server?.memory?.total)}</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>РђРєС‚РёРІРЅРѕСЃС‚СЊ РїР»Р°С‚С„РѕСЂРјС‹</CardTitle>
                <CardDescription>Р“РѕРґРѕРІРѕР№ РєР°Р»РµРЅРґР°СЂСЊ СЃРѕР±С‹С‚РёР№ Р±РµР· РїРµСЂРµРєР»СЋС‡Р°С‚РµР»СЏ РјРµСЃСЏС†Р°; РЅРёР¶Рµ Р¶РёРІРѕР№ РіСЂР°С„РёРє СЃРµРіРѕРґРЅСЏС€РЅРµРіРѕ РёСЃРїРѕР»СЊР·РѕРІР°РЅРёСЏ.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ActivityHeatmap
                  title="РћР±С‰Р°СЏ Р°РєС‚РёРІРЅРѕСЃС‚СЊ"
                  points={telemetry.activityHeatmap}
                />
                <TodayUsageChart data={telemetry.hourlyLoad || []} />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            {(telemetry.opsAdvisor || []).slice(0, 6).map((advice, index) => (
              <div
                key={`${advice.title}-${index}`}
                className={cn(
                  "rounded-lg border p-4",
                  advice.severity === "critical" && "border-red-500/35 bg-red-500/10",
                  advice.severity === "high" && "border-amber-500/35 bg-amber-500/10",
                  advice.severity === "medium" && "border-violet-500/35 bg-violet-500/10",
                  (!advice.severity || advice.severity === "low") && "bg-background/60",
                )}
              >
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant="outline">{severityLabel(advice.severity)}</Badge>
                  {advice.companyId && <Badge variant="secondary">РљРѕРјРїР°РЅРёСЏ</Badge>}
                </div>
                <div className="font-medium">{advice.title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{advice.message}</p>
                <p className="mt-3 text-sm">{advice.recommendation}</p>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="companies" className="mt-0 space-y-5">
          <Card>
            <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full lg:max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={companySearch} onChange={(event) => setCompanySearch(event.target.value)} placeholder="РџРѕРёСЃРє РєРѕРјРїР°РЅРёРё" className="pl-9" />
              </div>
              <Select value={companyFilter} onValueChange={setCompanyFilter}>
                <SelectTrigger className="w-full lg:w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Р’СЃРµ РєРѕРјРїР°РЅРёРё</SelectItem>
                  <SelectItem value="active">Р‘РµР· РїСЂРѕР±Р»РµРј</SelectItem>
                  <SelectItem value="problem">Р•СЃС‚СЊ РїСЂРѕР±Р»РµРјС‹</SelectItem>
                  <SelectItem value="offline">РћС„Р»Р°Р№РЅ СЃРёСЃС‚РµРјС‹</SelectItem>
                  <SelectItem value="incidents">Р•СЃС‚СЊ РёРЅС†РёРґРµРЅС‚С‹</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[1fr_0.95fr]">
            <div className="space-y-3">
              {overviewQuery.isLoading && <div className="text-sm text-muted-foreground">Р—Р°РіСЂСѓР·РєР° РєРѕРјРїР°РЅРёР№...</div>}
              {!overviewQuery.isLoading && filteredCompanies.length === 0 && (
                <Card><CardContent className="p-6 text-sm text-muted-foreground">РљРѕРјРїР°РЅРёР№ РїРѕ РІС‹Р±СЂР°РЅРЅРѕРјСѓ С„РёР»СЊС‚СЂСѓ РЅРµС‚.</CardContent></Card>
              )}
              {filteredCompanies.map((item: any) => {
                const load = companyLoadById.get(item.company.id);
                const issues = issueListForCompany(item, load);
                const selected = selectedCompany?.company?.id === item.company.id;
                return (
                  <button
                    key={item.company.id}
                    type="button"
                    className={cn(
                      "w-full rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5",
                      selected && "border-primary/60 bg-primary/10",
                    )}
                    onClick={() => setSelectedCompanyId(item.company.id)}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{item.company.name}</span>
                          <Badge variant={issues.length ? "outline" : "secondary"}>{issues.length ? "РЅСѓР¶РµРЅ РєРѕРЅС‚СЂРѕР»СЊ" : "РЅРѕСЂРјР°"}</Badge>
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {statusLabel(item.company.status)} В· Р°РєС‚РёРІРЅС‹С… {item.members?.active ?? 0} В· pending {item.members?.pending ?? 0}
                        </div>
                        {issues.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {issues.slice(0, 3).map((issue) => <Badge key={issue.text} variant="outline">{issue.text}</Badge>)}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">РЎРёСЃС‚РµРјС‹ {item.systems?.online ?? 0}/{item.systems?.total ?? 0}</Badge>
                        <Badge variant="outline">24С‡ {load?.activity24h ?? 0}</Badge>
                        <Badge variant="outline">РРЅС†РёРґРµРЅС‚С‹ {item.incidents?.open ?? load?.openIncidents ?? 0}</Badge>
                        <Badge variant="outline">Р—Р°РґР°С‡Рё {item.tasks?.total ?? 0}</Badge>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>РћС‚С‡РµС‚ РїРѕ РєРѕРјРїР°РЅРёРё</CardTitle>
                <CardDescription>РќР°РіСЂСѓР·РєР°, Р°РєС‚РёРІРЅРѕСЃС‚СЊ, РїСЂРѕР±Р»РµРјС‹ Рё РїРѕРґРєР»СЋС‡РµРЅРЅС‹Рµ Р°РіРµРЅС‚С‹ РІС‹Р±СЂР°РЅРЅРѕР№ РєРѕРјРїР°РЅРёРё.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!selectedCompany ? (
                  <div className="text-sm text-muted-foreground">Р’С‹Р±РµСЂРёС‚Рµ РєРѕРјРїР°РЅРёСЋ СЃР»РµРІР°.</div>
                ) : (
                  <>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-lg font-semibold">{selectedCompany.company.name}</div>
                        <div className="text-sm text-muted-foreground">
                          Workspace: {Array.isArray(selectedCompany.workspace?.needs) && selectedCompany.workspace.needs.length ? selectedCompany.workspace.needs.join(", ") : "РјРѕРґСѓР»Рё РЅРµ РІС‹Р±СЂР°РЅС‹"}
                        </div>
                      </div>
                      <Badge variant={selectedCompanyIssues.length ? "outline" : "secondary"}>
                        {selectedCompanyIssues.length ? "РµСЃС‚СЊ РІРѕРїСЂРѕСЃС‹" : "СЃС‚Р°Р±РёР»СЊРЅРѕ"}
                      </Badge>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {[
                        ["РЎРѕС‚СЂСѓРґРЅРёРєРё", selectedCompany.members?.active ?? 0],
                        ["РЎРёСЃС‚РµРјС‹ online", `${selectedCompany.systems?.online ?? 0}/${selectedCompany.systems?.total ?? 0}`],
                        ["РћР±РѕСЂСѓРґРѕРІР°РЅРёРµ", selectedCompany.equipment ?? 0],
                        ["РЎС‚СЂРёРјС‹", `${selectedCompany.streams?.active ?? 0}/${selectedCompany.streams?.total ?? 0}`],
                        ["Р—Р°РґР°С‡Рё", selectedCompany.tasks?.total ?? 0],
                        ["РџСЂРѕСЃСЂРѕС‡РµРЅРѕ", selectedCompany.tasks?.overdue ?? 0],
                        ["CPU 24С‡", pct(selectedCompanyLoad?.avgCpu24h)],
                        ["RAM 24С‡", pct(selectedCompanyLoad?.avgMemory24h)],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg border bg-background/60 p-3">
                          <div className="text-xs text-muted-foreground">{label}</div>
                          <div className="font-semibold">{value}</div>
                        </div>
                      ))}
                    </div>

                    {selectedCompanyIssues.length > 0 && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                        <div className="mb-2 font-medium">Р§С‚Рѕ С‚СЂРµР±СѓРµС‚ РІРЅРёРјР°РЅРёСЏ</div>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          {selectedCompanyIssues.map((issue) => <div key={issue.text}>вЂў {issue.text}</div>)}
                        </div>
                      </div>
                    )}

                    {selectedCompanyActivity ? (
                      <ActivityHeatmap
                        title={`РђРєС‚РёРІРЅРѕСЃС‚СЊ: ${selectedCompany.company.name}`}
                        points={selectedCompanyActivity.activityHeatmap}
                      />
                    ) : (
                      <div className="rounded-lg border bg-background/60 p-3 text-sm text-muted-foreground">
                        РџРѕ РєРѕРјРїР°РЅРёРё РїРѕРєР° РЅРµС‚ СЃРѕР±С‹С‚РёР№ РґР»СЏ РіРѕРґРѕРІРѕРіРѕ РіСЂР°С„РёРєР°.
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="font-medium">РђРіРµРЅС‚С‹ Рё СЃРёСЃС‚РµРјС‹</div>
                      {(selectedCompany.systems?.samples || []).length === 0 ? (
                        <div className="rounded-lg border bg-background/60 p-3 text-sm text-muted-foreground">РђРіРµРЅС‚С‹ РµС‰Рµ РЅРµ РїРѕРґРєР»СЋС‡РµРЅС‹.</div>
                      ) : (
                        selectedCompany.systems.samples.map((system: any) => (
                          <div key={system.id} className="rounded-lg border bg-background/60 p-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <div className="font-medium">{system.name}</div>
                                <div className="text-xs text-muted-foreground">{system.type} В· {statusLabel(system.status)} В· {formatDateTime(system.lastPing)}</div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Badge variant="outline">CPU {pct(system.cpuPercent)}</Badge>
                                <Badge variant="outline">RAM {pct(system.memoryPercent)}</Badge>
                                <Badge variant="outline">Disk {pct(system.diskPercent)}</Badge>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="users" className="mt-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />РџРѕР»СЊР·РѕРІР°С‚РµР»Рё</CardTitle>
              <CardDescription>РЈРЅРёРєР°Р»СЊРЅС‹Рµ Р°РєРєР°СѓРЅС‚С‹ РїР»Р°С‚С„РѕСЂРјС‹: РѕРґРЅРѕС„Р°РјРёР»СЊС†С‹ РґРѕРїСѓСЃС‚РёРјС‹, РЅРѕ Р»РѕРіРёРЅ, РїРѕС‡С‚Р° Рё ID РѕСЃС‚Р°СЋС‚СЃСЏ СЂР°Р·РЅС‹РјРё.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {usersQuery.isLoading && <div className="text-sm text-muted-foreground">Р—Р°РіСЂСѓР·РєР° РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№...</div>}
              {!usersQuery.isLoading && platformUsers.length === 0 && (
                <div className="rounded-lg border bg-background/60 p-4 text-sm text-muted-foreground">РџРѕР»СЊР·РѕРІР°С‚РµР»РµР№ РїРѕРєР° РЅРµС‚.</div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">РЎРѕС‚СЂСѓРґРЅРёРє</th>
                      <th className="px-3 py-2">Р›РѕРіРёРЅ / РїРѕС‡С‚Р°</th>
                      <th className="px-3 py-2">РљРѕРјРїР°РЅРёСЏ</th>
                      <th className="px-3 py-2">Р РѕР»СЊ</th>
                      <th className="px-3 py-2">РЎС‚Р°С‚СѓСЃ</th>
                      <th className="px-3 py-2 text-right">Р”РµР№СЃС‚РІРёСЏ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {platformUsers.map((user: any) => {
                      const memberships = Array.isArray(user.memberships) ? user.memberships : [];
                      const companyNames = memberships.map((m: any) => m.company?.name).filter(Boolean).join(", ");
                      return (
                        <tr key={user.id}>
                          <td className="px-3 py-3">
                            <div className="font-medium">{user.name || user.username}</div>
                            <div className="text-xs text-muted-foreground">ID: {user.id}</div>
                          </td>
                          <td className="px-3 py-3">
                            <div>{user.username}</div>
                            <div className="text-xs text-muted-foreground">{user.email || "РїРѕС‡С‚Р° РЅРµ СѓРєР°Р·Р°РЅР°"}</div>
                          </td>
                          <td className="px-3 py-3">{companyNames || "Р±РµР· РєРѕРјРїР°РЅРёРё"}</td>
                          <td className="px-3 py-3"><Badge variant="outline">{user.role || "employee"}</Badge></td>
                          <td className="px-3 py-3">
                            <Badge variant={user.active === false ? "outline" : "secondary"}>{user.active === false ? "РЅРµ Р°РєС‚РёРІРµРЅ" : "Р°РєС‚РёРІРµРЅ"}</Badge>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={resetPasswordMutation.isPending}
                                onClick={() => {
                                  const password = window.prompt(`Новый пароль для ${user.username}`);
                                  if (password) resetPasswordMutation.mutate({ id: user.id, password });
                                }}
                              >
                                Сбросить пароль
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={deleteUserMutation.isPending}
                                onClick={() => {
                                  if (window.confirm(`Удалить ${user.username}? Пользователь потеряет доступ к компаниям.`)) {
                                    deleteUserMutation.mutate(user.id);
                                  }
                                }}
                              >
                                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                Удалить
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="mt-0 space-y-5">
          <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><BrainCircuit className="h-5 w-5" />AI РґРёР°РіРЅРѕСЃС‚РёРєР°</CardTitle>
                <CardDescription>Qwen РґРµР»Р°РµС‚ Р±С‹СЃС‚СЂС‹Р№ ops-СЃРєР°РЅ, DeepSeek РіР»СѓР±Р¶Рµ СЂР°Р·Р±РёСЂР°РµС‚ РїСЂРёС‡РёРЅС‹ Рё СЂРёСЃРєРё.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => opsAiMutation.mutate("quick")} disabled={opsAiMutation.isPending}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Qwen Р°РЅР°Р»РёР·
                  </Button>
                  <Button onClick={() => opsAiMutation.mutate("deep")} disabled={opsAiMutation.isPending}>
                    <BrainCircuit className="mr-2 h-4 w-4" />
                    DeepSeek РіР»СѓР±РѕРєРѕ
                  </Button>
                </div>
                {opsAiMutation.isPending && (
                  <div className="rounded-lg border bg-background/60 p-4 text-sm text-muted-foreground">РќРµР№СЂРѕСЃРµС‚СЊ Р°РЅР°Р»РёР·РёСЂСѓРµС‚ СЃРµСЂРІРµСЂ, РєРѕРјРїР°РЅРёРё, РјРµС‚СЂРёРєРё Рё РёРЅС†РёРґРµРЅС‚С‹...</div>
                )}
                {!opsAiResult && !opsAiMutation.isPending && (
                  <div className="rounded-lg border bg-background/60 p-4 text-sm text-muted-foreground">
                    РќР°Р¶РјРёС‚Рµ Qwen РґР»СЏ Р±С‹СЃС‚СЂРѕРіРѕ Р°РЅР°Р»РёР·Р°. Р•СЃР»Рё РјРѕРґРµР»СЊ РЅРµРґРѕСЃС‚СѓРїРЅР° РІ Hugging Face Router, СЃРµСЂРІРµСЂ РїРѕРїСЂРѕР±СѓРµС‚ РЅРµСЃРєРѕР»СЊРєРѕ Qwen fallback-РјРѕРґРµР»РµР№.
                  </div>
                )}
                {opsAiResult && (
                  <div className="rounded-lg border bg-background/60 p-4">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{opsAiResult.mode === "deep" ? "DeepSeek" : "Qwen"}</Badge>
                      <Badge variant="outline">{opsAiResult.model}</Badge>
                      <span className="text-xs text-muted-foreground">{formatDateTime(opsAiResult.generatedAt)}</span>
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-6">{opsAiResult.content}</div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Р›РѕРєР°Р»СЊРЅС‹Рµ СЃРѕРІРµС‚С‹ Р±РµР· AI</CardTitle>
                <CardDescription>Р‘С‹СЃС‚СЂС‹Рµ РїСЂРѕРІРµСЂРєРё, СЂР°СЃСЃС‡РёС‚Р°РЅРЅС‹Рµ РёР· С‚РµР»РµРјРµС‚СЂРёРё РЅР° СЃРµСЂРІРµСЂРµ.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(telemetry.opsAdvisor || []).map((advice, index) => (
                  <div key={`${advice.title}-${index}`} className="rounded-lg border bg-background/60 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Badge variant="outline">{severityLabel(advice.severity)}</Badge>
                    </div>
                    <div className="font-medium">{advice.title}</div>
                    <p className="mt-1 text-sm text-muted-foreground">{advice.message}</p>
                    <p className="mt-2 text-sm">{advice.recommendation}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="incidents" className="mt-0 space-y-5">
          <Card>
            <CardContent className="grid gap-3 p-4 lg:grid-cols-[1fr_190px_190px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={incidentSearch} onChange={(event) => setIncidentSearch(event.target.value)} placeholder="РџРѕРёСЃРє РїРѕ Р¶Р°Р»РѕР±Р°Рј Рё РёРЅС†РёРґРµРЅС‚Р°Рј" className="pl-9" />
              </div>
              <Select value={incidentStatusFilter} onValueChange={setIncidentStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">РђРєС‚РёРІРЅС‹Рµ</SelectItem>
                  <SelectItem value="open">РћС‚РєСЂС‹С‚С‹Рµ</SelectItem>
                  <SelectItem value="investigating">Р’ СЂР°Р±РѕС‚Рµ</SelectItem>
                  <SelectItem value="done">Р’С‹РїРѕР»РЅРµРЅРЅС‹Рµ</SelectItem>
                  <SelectItem value="all">Р’СЃРµ</SelectItem>
                </SelectContent>
              </Select>
              <Select value={incidentSeverityFilter} onValueChange={setIncidentSeverityFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Р›СЋР±Р°СЏ РІР°Р¶РЅРѕСЃС‚СЊ</SelectItem>
                  <SelectItem value="critical">РљСЂРёС‚РёС‡РЅРѕ</SelectItem>
                  <SelectItem value="high">Р’С‹СЃРѕРєР°СЏ</SelectItem>
                  <SelectItem value="medium">РЎСЂРµРґРЅСЏСЏ</SelectItem>
                  <SelectItem value="low">РќРёР·РєР°СЏ</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <StatCard label="РђРєС‚РёРІРЅС‹Рµ" value={openIncidents.length} icon={AlertTriangle} />
            <StatCard label="Р’ СЂР°Р±РѕС‚Рµ" value={incidents.filter((i) => i.status === "investigating").length} icon={Wrench} />
            <StatCard label="Р’С‹РїРѕР»РЅРµРЅРЅС‹Рµ" value={incidents.filter((i) => ["resolved", "closed"].includes(i.status)).length} icon={CheckCircle2} />
            <StatCard label="РљСЂРёС‚РёС‡РЅС‹Рµ" value={incidents.filter((i) => i.severity === "critical").length} icon={AlertCircle} />
          </div>

          <div className="space-y-3">
            {incidentsQuery.isLoading && <div className="text-sm text-muted-foreground">Р—Р°РіСЂСѓР·РєР° РёРЅС†РёРґРµРЅС‚РѕРІ...</div>}
            {!incidentsQuery.isLoading && filteredIncidents.length === 0 && (
              <Card><CardContent className="p-6 text-sm text-muted-foreground">РРЅС†РёРґРµРЅС‚РѕРІ РїРѕ РІС‹Р±СЂР°РЅРЅС‹Рј С„РёР»СЊС‚СЂР°Рј РЅРµС‚.</CardContent></Card>
            )}
            {filteredIncidents.map((incident) => {
              const done = incident.status === "resolved" || incident.status === "closed";
              return (
                <div key={incident.id} className={cn("rounded-lg border bg-card p-4 transition-colors", done && "bg-muted/40 opacity-70")}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{incident.title}</span>
                        <Badge variant={done ? "secondary" : "outline"}>{statusLabel(incident.status)}</Badge>
                        <Badge variant="outline">{severityLabel(incident.severity)}</Badge>
                        <Badge variant="outline">{incident.type || "incident"}</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">{incident.message}</div>
                      <div className="text-xs text-muted-foreground">
                        РљРѕРјРїР°РЅРёСЏ: {incident.company?.name || "РЅРµ СѓРєР°Р·Р°РЅР°"} В· РђРІС‚РѕСЂ: {incident.reporter?.name || incident.reporter?.username || "РЅРµРёР·РІРµСЃС‚РЅРѕ"} В· {formatDateTime(incident.createdAt)}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={incidentStatusMutation.isPending || incident.status === "investigating" || done}
                        onClick={() => incidentStatusMutation.mutate({ id: incident.id, status: "investigating" })}
                      >
                        Р’ СЂР°Р±РѕС‚Сѓ
                      </Button>
                      <Button
                        size="sm"
                        disabled={incidentStatusMutation.isPending || done}
                        onClick={() => incidentStatusMutation.mutate({ id: incident.id, status: "resolved" })}
                      >
                        Р—Р°РєСЂС‹С‚СЊ
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="metrics" className="mt-0 space-y-5">
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BrainCircuit className="h-5 w-5" />AI-Р°РЅР°Р»РёР· РјРµС‚СЂРёРє</CardTitle>
              <CardDescription>РћС†РµРЅРєР° СЃС‚СЂРѕРёС‚СЃСЏ РїРѕ СЃРІРµР¶РµР№ С‚РµР»РµРјРµС‚СЂРёРё Рё РѕР±РЅРѕРІР»СЏРµС‚СЃСЏ РІРјРµСЃС‚Рµ СЃ РіСЂР°С„РёРєР°РјРё.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {metricInsights.map((insight) => (
                <div
                  key={`${insight.title}-${insight.text}`}
                  className={cn(
                    "rounded-lg border bg-background/70 p-3",
                    insight.level === "critical" && "border-red-500/35 bg-red-500/10",
                    insight.level === "warning" && "border-amber-500/35 bg-amber-500/10",
                    insight.level === "good" && "border-emerald-500/30 bg-emerald-500/10",
                  )}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant="outline">{insight.level === "critical" ? "РїР»РѕС…Рѕ" : insight.level === "warning" ? "РІРЅРёРјР°РЅРёРµ" : "С…РѕСЂРѕС€Рѕ"}</Badge>
                  </div>
                  <div className="font-medium">{insight.title}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{insight.text}</p>
                </div>
              ))}
              <Button variant="outline" className="h-auto justify-start p-3 text-left" onClick={() => { setActiveTab("ai"); opsAiMutation.mutate("quick"); }} disabled={opsAiMutation.isPending}>
                <Sparkles className="mr-2 h-4 w-4" />
                Р—Р°РїСѓСЃС‚РёС‚СЊ Qwen РїРѕ СЌС‚РёРј РјРµС‚СЂРёРєР°Рј
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>РќР°РіСЂСѓР·РєР° СЃРµСЂРІРµСЂР° РІ СЂРµР°Р»СЊРЅРѕРј РІСЂРµРјРµРЅРё</CardTitle>
                <CardDescription>CPU, RAM, РґРёСЃРє Рё heap Node.js РѕР±РЅРѕРІР»СЏСЋС‚СЃСЏ РєР°Р¶РґС‹Рµ {refreshLabel}.</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={telemetry.hostLoad || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.16)" />
                    <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <RechartsTooltip />
                    <Legend />
                    <Area type="monotone" dataKey="cpuPercent" name="CPU %" stroke={COLORS.violet} fill={COLORS.violet} fillOpacity={0.18} strokeWidth={2} />
                    <Area type="monotone" dataKey="memoryPercent" name="RAM %" stroke={COLORS.blue} fill={COLORS.blue} fillOpacity={0.16} strokeWidth={2} />
                    <Line type="monotone" dataKey="diskPercent" name="Disk %" stroke={COLORS.amber} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="processHeapPercent" name="Node heap %" stroke={COLORS.cyan} strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Heartbeat Рё СЃРёСЃС‚РµРјС‹ РѕРЅР»Р°Р№РЅ</CardTitle>
                <CardDescription>РЎРєРѕР»СЊРєРѕ Р°РіРµРЅС‚РѕРІ РїСЂРёСЃС‹Р»Р°СЋС‚ РґР°РЅРЅС‹Рµ СЃРµР№С‡Р°СЃ Рё РєР°РєР°СЏ РЅР°РіСЂСѓР·РєР° РїРѕ РЅРёРј.</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={telemetry.hourlyLoad || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.16)" />
                    <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <RechartsTooltip />
                    <Legend />
                    <Area type="monotone" dataKey="heartbeats" name="Heartbeat" stroke={COLORS.violet} fill={COLORS.violet} fillOpacity={0.18} />
                    <Line type="monotone" dataKey="cpuPercent" name="CPU %" stroke={COLORS.amber} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="memoryPercent" name="RAM %" stroke={COLORS.blue} strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>РђРєС‚РёРІРЅРѕСЃС‚СЊ РєРѕРјРїР°РЅРёР№</CardTitle>
                <CardDescription>РђРєС‚РёРІРЅРѕСЃС‚СЊ Р·Р° 24 С‡Р°СЃР°, РёРЅС„СЂР°СЃС‚СЂСѓРєС‚СѓСЂР° Рё РёРЅС†РёРґРµРЅС‚С‹.</CardDescription>
              </CardHeader>
              <CardContent className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(telemetry.companyLoad || []).slice(0, 12)} layout="vertical" margin={{ left: 20, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.16)" />
                    <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={130} tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                    <RechartsTooltip />
                    <Legend />
                    <Bar dataKey="activity24h" name="РђРєС‚РёРІРЅРѕСЃС‚СЊ 24С‡" fill={COLORS.violet} radius={[0, 4, 4, 0]} />
                    <Bar dataKey="openIncidents" name="РРЅС†РёРґРµРЅС‚С‹" fill={COLORS.red} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>РСЃРїРѕР»СЊР·РѕРІР°РЅРёРµ СЃРµСЂРІРёСЃР°</CardTitle>
                <CardDescription>РўРёРїС‹ СЃРѕР±С‹С‚РёР№ РїР»Р°С‚С„РѕСЂРјС‹ Р·Р° РіРѕРґ.</CardDescription>
              </CardHeader>
              <CardContent className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(telemetry.serviceUsage || []).slice(0, 8)} layout="vertical" margin={{ left: 20, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.16)" />
                    <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={130} tickFormatter={usageLabel} tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                    <RechartsTooltip formatter={(value: number, name: string) => [value, usageLabel(String(name))]} />
                    <Bar dataKey="value" name="РЎРѕР±С‹С‚РёР№" fill={COLORS.blue} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.7fr_1.3fr]">
            <Card>
              <CardHeader>
                <CardTitle>РЎС‚Р°С‚СѓСЃС‹ СЃРёСЃС‚РµРј</CardTitle>
                <CardDescription>РЎСЂРµР· РїРѕ РІСЃРµРј СЃРёСЃС‚РµРјР°Рј.</CardDescription>
              </CardHeader>
              <CardContent className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={telemetry.systemStatus || []} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2}>
                      {(telemetry.systemStatus || []).map((entry, index) => <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                    </Pie>
                    <RechartsTooltip formatter={(value: number, name: string) => [value, statusLabel(String(name))]} />
                    <Legend formatter={(value) => statusLabel(String(value))} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>РўРѕРї СЃРёСЃС‚РµРј РїРѕРґ РЅР°РіСЂСѓР·РєРѕР№</CardTitle>
                <CardDescription>CPU, RAM, РґРёСЃРє Рё СЃРµС‚СЊ РїРѕ Р°РіРµРЅС‚Р°Рј.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(telemetry.topSystems || []).length === 0 && <div className="text-sm text-muted-foreground">РќРµС‚ СЃРёСЃС‚РµРј СЃ РјРµС‚СЂРёРєР°РјРё.</div>}
                {(telemetry.topSystems || []).map((system) => (
                  <div key={system.id} className="rounded-lg border bg-background/60 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="font-medium">{system.name}</div>
                        <div className="text-xs text-muted-foreground">{system.companyName} В· {statusLabel(system.status)} В· {formatDateTime(system.lastPing)}</div>
                      </div>
                      <Badge variant="outline">{Math.round(num(system.networkMbps))} Mbps</Badge>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      {[
                        ["CPU", num(system.cpuPercent), COLORS.violet],
                        ["RAM", num(system.memoryPercent), COLORS.blue],
                        ["Disk", num(system.diskPercent), COLORS.amber],
                      ].map(([label, value, color]: any) => (
                        <div key={label}>
                          <div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>{label}</span><span>{Math.round(value)}%</span></div>
                          <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, value)}%`, backgroundColor: color }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

