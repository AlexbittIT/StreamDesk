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
const MONTH_LABELS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const REFRESH_OPTIONS = [
  { value: 1000, label: "1 сек" },
  { value: 5000, label: "5 сек" },
  { value: 15000, label: "15 сек" },
  { value: 60000, label: "1 мин" },
  { value: 300000, label: "5 мин" },
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
  if (bytes <= 0) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size >= 10 ? Math.round(size) : Math.round(size * 10) / 10} ${units[index]}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "нет данных";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "нет данных";
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
  if (days > 0) return `${days} д ${hours} ч`;
  if (hours > 0) return `${hours} ч ${minutes} мин`;
  return `${minutes} мин`;
}

function statusLabel(value: string) {
  switch (value) {
    case "online": return "Онлайн";
    case "offline": return "Офлайн";
    case "maintenance": return "Обслуживание";
    case "open": return "Открыто";
    case "investigating": return "В работе";
    case "resolved": return "Выполнено";
    case "closed": return "Закрыто";
    case "active": return "Активна";
    case "suspended": return "Остановлена";
    default: return value || "неизвестно";
  }
}

function severityLabel(value: string) {
  switch (value) {
    case "critical": return "Критично";
    case "high": return "Высокий";
    case "medium": return "Средний";
    case "low": return "Низкий";
    default: return value || "не указан";
  }
}

function usageLabel(value: string) {
  switch (value) {
    case "heartbeat": return "Heartbeat";
    case "task_activity": return "Задачи";
    case "project_activity": return "Проекты";
    case "company_created": return "Компании";
    case "user_registered": return "Регистрации";
    case "incident": return "Инциденты";
    case "system_seen": return "Системы";
    case "streamdesk_host": return "Сервер";
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
    issues.push({ level: "critical", text: `Статус компании: ${statusLabel(item.company.status)}` });
  }
  if (offline > 0) issues.push({ level: "warning", text: `Офлайн систем: ${offline}` });
  if (openIncidents > 0) issues.push({ level: "warning", text: `Открытых инцидентов: ${openIncidents}` });
  if (overdue > 0) issues.push({ level: "info", text: `Просроченных задач: ${overdue}` });
  if (!item?.workspace?.monitoringEnabled) issues.push({ level: "info", text: "Мониторинг компании выключен" });
  if (num(item?.systems?.total) === 0) issues.push({ level: "info", text: "Нет подключенных систем" });
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
            {total.toLocaleString("ru-RU")} событий за год
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
        <div className="font-semibold">Использование сервиса сегодня</div>
        <div className="text-sm text-muted-foreground">Heartbeat, активные системы и нагрузка обновляются в выбранном интервале.</div>
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
            <Line type="monotone" dataKey="activeSystems" name="Активные системы" stroke={COLORS.green} strokeWidth={2} dot={false} />
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
      toast({ title: "Готово", description: "Статус инцидента обновлен." });
    },
    onError: (error: any) => {
      toast({ title: "Ошибка", description: error?.message || "Не удалось обновить инцидент", variant: "destructive" });
    },
  });

  const opsAiMutation = useMutation({
    mutationFn: async (mode: "quick" | "deep") => {
      const response = await apiRequest("POST", "/api/platform/ops-ai/analyze", { mode });
      return response.json();
    },
    onSuccess: (data) => {
      setOpsAiResult(data);
      toast({ title: "AI-анализ готов", description: data?.model ? `Модель: ${data.model}` : undefined });
    },
    onError: (error: any) => {
      toast({
        title: "AI-анализ недоступен",
        description: error?.message || "Проверьте HUGGINGFACE_API_KEY / HF_TOKEN в .env",
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
      toast({ title: "Готово", description: "Пароль пользователя обновлен." });
    },
    onError: (error: any) => {
      toast({ title: "Ошибка", description: error?.message || "Не удалось сбросить пароль", variant: "destructive" });
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
      toast({ title: "Готово", description: "Пользователь удален из активных." });
    },
    onError: (error: any) => {
      toast({ title: "Ошибка", description: error?.message || "Не удалось удалить пользователя", variant: "destructive" });
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

    if (cpu >= 85) insights.push({ level: "critical", title: "CPU перегружен", text: `Сейчас ${Math.round(cpu)}%. Нужен разбор процессов и частоты запросов.` });
    else if (cpu >= 65) insights.push({ level: "warning", title: "CPU растет", text: `Сейчас ${Math.round(cpu)}%. Стоит посмотреть всплески по компаниям и агентам.` });
    else insights.push({ level: "good", title: "CPU в норме", text: `Сейчас ${Math.round(cpu)}%, запас по серверу есть.` });

    if (ram >= 85) insights.push({ level: "critical", title: "RAM почти заполнена", text: `Память занята на ${Math.round(ram)}%. Проверьте Node heap и фоновые задачи.` });
    else if (ram >= 70) insights.push({ level: "warning", title: "RAM близко к верхней границе", text: `Память занята на ${Math.round(ram)}%. Следите за трендом в ближайшие минуты.` });

    if (disk >= 85) insights.push({ level: "critical", title: "Диск почти заполнен", text: `Свободное место заканчивается: занято ${Math.round(disk)}%. Проверьте uploads, логи и бэкапы.` });
    if (offline > 0) insights.push({ level: "warning", title: "Есть офлайн-системы", text: `${offline} систем не присылают heartbeat. Проверьте агенты и сеть.` });
    if (criticalIncidents > 0) insights.push({ level: "critical", title: "Критичные инциденты", text: `${criticalIncidents} заявок требуют первоочередной обработки.` });
    if (openIncidents.length === 0 && offline === 0 && cpu < 65 && ram < 70 && disk < 80) {
      insights.push({ level: "good", title: "Платформа стабильна", text: "Открытых инцидентов и явных проблем по инфраструктуре сейчас нет." });
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

  const refreshLabel = REFRESH_OPTIONS.find((option) => option.value === refreshIntervalMs)?.label || `${refreshIntervalMs / 1000} сек`;
  const lastUpdatedLabel = formatDateTime(telemetry.generatedAt || overview?.generatedAt);

  if (!isPlatformAdmin) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <Card className="max-w-lg">
          <CardContent className="py-8 text-center">
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
            <h2 className="mb-2 text-lg font-semibold">Доступ закрыт</h2>
            <p className="text-sm text-muted-foreground">Эта панель доступна только владельцу платформы.</p>
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
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Контроль платформы StreamDesk</h1>
          <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
            Сервер, компании, агенты, жалобы, AI-диагностика и активность разнесены по вкладкам, чтобы быстро видеть где нагрузка, где проблема и что уже взято в работу.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="text-xs text-muted-foreground sm:text-right">
            <div>Обновлено: {lastUpdatedLabel}</div>
            <div>Интервал: {refreshLabel}</div>
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
            Обновить
          </Button>
        </div>
      </div>

      {(overviewQuery.error || telemetryQuery.error || incidentsQuery.error) && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-500" />
            <div>
              <div className="font-medium">Часть данных не загрузилась</div>
              <div className="text-sm text-muted-foreground">Проверьте авторизацию owner-аккаунта и состояние API, затем обновите панель.</div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={handlePlatformTabChange} className="space-y-5">
        <TabsContent value="overview" className="mt-0 space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Компании" value={overview?.totals?.companies ?? 0} icon={Building2} />
            <StatCard label="Пользователи" value={overview?.totals?.users ?? 0} icon={Users} />
            <StatCard label="Открытые инциденты" value={overview?.totals?.openIncidents ?? openIncidents.length} icon={Wrench} />
            <StatCard label="Офлайн систем" value={overview?.totals?.offlineSystems ?? 0} icon={ServerCog} />
            <StatCard label="RAM сервера" value={pct(telemetry.serverHost?.memory?.usedPercent ?? overview?.server?.memory?.usedPercent)} icon={Cpu} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ServerCog className="h-5 w-5" />Сервер StreamDesk</CardTitle>
                <CardDescription>Состояние хоста, на котором работает платформа.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ["CPU", pct(telemetry.serverHost?.cpu?.percent ?? overview?.server?.cpu?.percent), Cpu],
                    ["RAM", pct(telemetry.serverHost?.memory?.usedPercent ?? overview?.server?.memory?.usedPercent), Database],
                    ["Диск", pct(telemetry.serverHost?.disk?.usedPercent ?? overview?.server?.disk?.usedPercent), HardDrive],
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
                  <div>{telemetry.serverHost?.cpu?.model || overview?.server?.cpu?.model || "CPU не определен"}</div>
                  <div>RAM всего: {formatBytes(telemetry.serverHost?.memory?.total ?? overview?.server?.memory?.total)}</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Активность платформы</CardTitle>
                <CardDescription>Годовой календарь событий без переключателя месяца; ниже живой график сегодняшнего использования.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ActivityHeatmap
                  title="Общая активность"
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
                  {advice.companyId && <Badge variant="secondary">Компания</Badge>}
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
                <Input value={companySearch} onChange={(event) => setCompanySearch(event.target.value)} placeholder="Поиск компании" className="pl-9" />
              </div>
              <Select value={companyFilter} onValueChange={setCompanyFilter}>
                <SelectTrigger className="w-full lg:w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все компании</SelectItem>
                  <SelectItem value="active">Без проблем</SelectItem>
                  <SelectItem value="problem">Есть проблемы</SelectItem>
                  <SelectItem value="offline">Офлайн системы</SelectItem>
                  <SelectItem value="incidents">Есть инциденты</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[1fr_0.95fr]">
            <div className="space-y-3">
              {overviewQuery.isLoading && <div className="text-sm text-muted-foreground">Загрузка компаний...</div>}
              {!overviewQuery.isLoading && filteredCompanies.length === 0 && (
                <Card><CardContent className="p-6 text-sm text-muted-foreground">Компаний по выбранному фильтру нет.</CardContent></Card>
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
                          <Badge variant={issues.length ? "outline" : "secondary"}>{issues.length ? "нужен контроль" : "норма"}</Badge>
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {statusLabel(item.company.status)} · активных {item.members?.active ?? 0} · pending {item.members?.pending ?? 0}
                        </div>
                        {issues.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {issues.slice(0, 3).map((issue) => <Badge key={issue.text} variant="outline">{issue.text}</Badge>)}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">Системы {item.systems?.online ?? 0}/{item.systems?.total ?? 0}</Badge>
                        <Badge variant="outline">24ч {load?.activity24h ?? 0}</Badge>
                        <Badge variant="outline">Инциденты {item.incidents?.open ?? load?.openIncidents ?? 0}</Badge>
                        <Badge variant="outline">Задачи {item.tasks?.total ?? 0}</Badge>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Отчет по компании</CardTitle>
                <CardDescription>Нагрузка, активность, проблемы и подключенные агенты выбранной компании.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!selectedCompany ? (
                  <div className="text-sm text-muted-foreground">Выберите компанию слева.</div>
                ) : (
                  <>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-lg font-semibold">{selectedCompany.company.name}</div>
                        <div className="text-sm text-muted-foreground">
                          Workspace: {Array.isArray(selectedCompany.workspace?.needs) && selectedCompany.workspace.needs.length ? selectedCompany.workspace.needs.join(", ") : "модули не выбраны"}
                        </div>
                      </div>
                      <Badge variant={selectedCompanyIssues.length ? "outline" : "secondary"}>
                        {selectedCompanyIssues.length ? "есть вопросы" : "стабильно"}
                      </Badge>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {[
                        ["Сотрудники", selectedCompany.members?.active ?? 0],
                        ["Системы online", `${selectedCompany.systems?.online ?? 0}/${selectedCompany.systems?.total ?? 0}`],
                        ["Оборудование", selectedCompany.equipment ?? 0],
                        ["Стримы", `${selectedCompany.streams?.active ?? 0}/${selectedCompany.streams?.total ?? 0}`],
                        ["Задачи", selectedCompany.tasks?.total ?? 0],
                        ["Просрочено", selectedCompany.tasks?.overdue ?? 0],
                        ["CPU 24ч", pct(selectedCompanyLoad?.avgCpu24h)],
                        ["RAM 24ч", pct(selectedCompanyLoad?.avgMemory24h)],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg border bg-background/60 p-3">
                          <div className="text-xs text-muted-foreground">{label}</div>
                          <div className="font-semibold">{value}</div>
                        </div>
                      ))}
                    </div>

                    {selectedCompanyIssues.length > 0 && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                        <div className="mb-2 font-medium">Что требует внимания</div>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          {selectedCompanyIssues.map((issue) => <div key={issue.text}>• {issue.text}</div>)}
                        </div>
                      </div>
                    )}

                    {selectedCompanyActivity ? (
                      <ActivityHeatmap
                        title={`Активность: ${selectedCompany.company.name}`}
                        points={selectedCompanyActivity.activityHeatmap}
                      />
                    ) : (
                      <div className="rounded-lg border bg-background/60 p-3 text-sm text-muted-foreground">
                        По компании пока нет событий для годового графика.
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="font-medium">Агенты и системы</div>
                      {(selectedCompany.systems?.samples || []).length === 0 ? (
                        <div className="rounded-lg border bg-background/60 p-3 text-sm text-muted-foreground">Агенты еще не подключены.</div>
                      ) : (
                        selectedCompany.systems.samples.map((system: any) => (
                          <div key={system.id} className="rounded-lg border bg-background/60 p-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <div className="font-medium">{system.name}</div>
                                <div className="text-xs text-muted-foreground">{system.type} · {statusLabel(system.status)} · {formatDateTime(system.lastPing)}</div>
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
              <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Пользователи</CardTitle>
              <CardDescription>Уникальные аккаунты платформы: однофамильцы допустимы, но логин, почта и ID остаются разными.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {usersQuery.isLoading && <div className="text-sm text-muted-foreground">Загрузка пользователей...</div>}
              {!usersQuery.isLoading && platformUsers.length === 0 && (
                <div className="rounded-lg border bg-background/60 p-4 text-sm text-muted-foreground">Пользователей пока нет.</div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Сотрудник</th>
                      <th className="px-3 py-2">Логин / почта</th>
                      <th className="px-3 py-2">Компания</th>
                      <th className="px-3 py-2">Роль</th>
                      <th className="px-3 py-2">Статус</th>
                      <th className="px-3 py-2 text-right">Действия</th>
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
                            <div className="text-xs text-muted-foreground">{user.email || "почта не указана"}</div>
                          </td>
                          <td className="px-3 py-3">{companyNames || "без компании"}</td>
                          <td className="px-3 py-3"><Badge variant="outline">{user.role || "employee"}</Badge></td>
                          <td className="px-3 py-3">
                            <Badge variant={user.active === false ? "outline" : "secondary"}>{user.active === false ? "не активен" : "активен"}</Badge>
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
                <CardTitle className="flex items-center gap-2"><BrainCircuit className="h-5 w-5" />AI диагностика</CardTitle>
                <CardDescription>Qwen делает быстрый ops-скан, DeepSeek глубже разбирает причины и риски.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => opsAiMutation.mutate("quick")} disabled={opsAiMutation.isPending}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Qwen анализ
                  </Button>
                  <Button onClick={() => opsAiMutation.mutate("deep")} disabled={opsAiMutation.isPending}>
                    <BrainCircuit className="mr-2 h-4 w-4" />
                    DeepSeek глубоко
                  </Button>
                </div>
                {opsAiMutation.isPending && (
                  <div className="rounded-lg border bg-background/60 p-4 text-sm text-muted-foreground">Нейросеть анализирует сервер, компании, метрики и инциденты...</div>
                )}
                {!opsAiResult && !opsAiMutation.isPending && (
                  <div className="rounded-lg border bg-background/60 p-4 text-sm text-muted-foreground">
                    Нажмите Qwen для быстрого анализа. Если модель недоступна в Hugging Face Router, сервер попробует несколько Qwen fallback-моделей.
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
                <CardTitle>Локальные советы без AI</CardTitle>
                <CardDescription>Быстрые проверки, рассчитанные из телеметрии на сервере.</CardDescription>
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
                <Input value={incidentSearch} onChange={(event) => setIncidentSearch(event.target.value)} placeholder="Поиск по жалобам и инцидентам" className="pl-9" />
              </div>
              <Select value={incidentStatusFilter} onValueChange={setIncidentStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Активные</SelectItem>
                  <SelectItem value="open">Открытые</SelectItem>
                  <SelectItem value="investigating">В работе</SelectItem>
                  <SelectItem value="done">Выполненные</SelectItem>
                  <SelectItem value="all">Все</SelectItem>
                </SelectContent>
              </Select>
              <Select value={incidentSeverityFilter} onValueChange={setIncidentSeverityFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Любая важность</SelectItem>
                  <SelectItem value="critical">Критично</SelectItem>
                  <SelectItem value="high">Высокая</SelectItem>
                  <SelectItem value="medium">Средняя</SelectItem>
                  <SelectItem value="low">Низкая</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <StatCard label="Активные" value={openIncidents.length} icon={AlertTriangle} />
            <StatCard label="В работе" value={incidents.filter((i) => i.status === "investigating").length} icon={Wrench} />
            <StatCard label="Выполненные" value={incidents.filter((i) => ["resolved", "closed"].includes(i.status)).length} icon={CheckCircle2} />
            <StatCard label="Критичные" value={incidents.filter((i) => i.severity === "critical").length} icon={AlertCircle} />
          </div>

          <div className="space-y-3">
            {incidentsQuery.isLoading && <div className="text-sm text-muted-foreground">Загрузка инцидентов...</div>}
            {!incidentsQuery.isLoading && filteredIncidents.length === 0 && (
              <Card><CardContent className="p-6 text-sm text-muted-foreground">Инцидентов по выбранным фильтрам нет.</CardContent></Card>
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
                        Компания: {incident.company?.name || "не указана"} · Автор: {incident.reporter?.name || incident.reporter?.username || "неизвестно"} · {formatDateTime(incident.createdAt)}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={incidentStatusMutation.isPending || incident.status === "investigating" || done}
                        onClick={() => incidentStatusMutation.mutate({ id: incident.id, status: "investigating" })}
                      >
                        В работу
                      </Button>
                      <Button
                        size="sm"
                        disabled={incidentStatusMutation.isPending || done}
                        onClick={() => incidentStatusMutation.mutate({ id: incident.id, status: "resolved" })}
                      >
                        Закрыть
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
              <CardTitle className="flex items-center gap-2"><BrainCircuit className="h-5 w-5" />AI-анализ метрик</CardTitle>
              <CardDescription>Оценка строится по свежей телеметрии и обновляется вместе с графиками.</CardDescription>
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
                    <Badge variant="outline">{insight.level === "critical" ? "плохо" : insight.level === "warning" ? "внимание" : "хорошо"}</Badge>
                  </div>
                  <div className="font-medium">{insight.title}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{insight.text}</p>
                </div>
              ))}
              <Button variant="outline" className="h-auto justify-start p-3 text-left" onClick={() => { setActiveTab("ai"); opsAiMutation.mutate("quick"); }} disabled={opsAiMutation.isPending}>
                <Sparkles className="mr-2 h-4 w-4" />
                Запустить Qwen по этим метрикам
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Нагрузка сервера в реальном времени</CardTitle>
                <CardDescription>CPU, RAM, диск и heap Node.js обновляются каждые {refreshLabel}.</CardDescription>
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
                <CardTitle>Heartbeat и системы онлайн</CardTitle>
                <CardDescription>Сколько агентов присылают данные сейчас и какая нагрузка по ним.</CardDescription>
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
                <CardTitle>Активность компаний</CardTitle>
                <CardDescription>Активность за 24 часа, инфраструктура и инциденты.</CardDescription>
              </CardHeader>
              <CardContent className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(telemetry.companyLoad || []).slice(0, 12)} layout="vertical" margin={{ left: 20, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.16)" />
                    <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={130} tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                    <RechartsTooltip />
                    <Legend />
                    <Bar dataKey="activity24h" name="Активность 24ч" fill={COLORS.violet} radius={[0, 4, 4, 0]} />
                    <Bar dataKey="openIncidents" name="Инциденты" fill={COLORS.red} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Использование сервиса</CardTitle>
                <CardDescription>Типы событий платформы за год.</CardDescription>
              </CardHeader>
              <CardContent className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(telemetry.serviceUsage || []).slice(0, 8)} layout="vertical" margin={{ left: 20, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.16)" />
                    <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={130} tickFormatter={usageLabel} tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                    <RechartsTooltip formatter={(value: number, name: string) => [value, usageLabel(String(name))]} />
                    <Bar dataKey="value" name="Событий" fill={COLORS.blue} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.7fr_1.3fr]">
            <Card>
              <CardHeader>
                <CardTitle>Статусы систем</CardTitle>
                <CardDescription>Срез по всем системам.</CardDescription>
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
                <CardTitle>Топ систем под нагрузкой</CardTitle>
                <CardDescription>CPU, RAM, диск и сеть по агентам.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(telemetry.topSystems || []).length === 0 && <div className="text-sm text-muted-foreground">Нет систем с метриками.</div>}
                {(telemetry.topSystems || []).map((system) => (
                  <div key={system.id} className="rounded-lg border bg-background/60 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="font-medium">{system.name}</div>
                        <div className="text-xs text-muted-foreground">{system.companyName} · {statusLabel(system.status)} · {formatDateTime(system.lastPing)}</div>
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

