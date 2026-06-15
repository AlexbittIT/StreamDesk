import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Monitor, Server, Wifi, Activity, AlertTriangle, CheckCircle, RefreshCw, TrendingUp, Cpu, HardDrive, MemoryStick, Radio, Download, Power, Trash2, Edit2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useWebSocket } from "@/hooks/use-websocket";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type AgentMetricPoint = {
  timestamp: string;
  cpuPercent: number | null;
  memoryPercent: number | null;
  memoryUsedGb?: number | null;
  memoryTotalGb?: number | null;
  diskPercent: number | null;
  diskFreeGb?: number | null;
  diskTotalGb?: number | null;
  networkRxMbps: number | null;
  networkTxMbps: number | null;
  sampleLagMs?: number | null;
};

type MonitoringRange = "10m" | "1h" | "24h" | "7d";

type CompaniesMe = {
  companies: Array<{
    company: { id: string; name: string; status: string };
    membership: { id: string; role: string; status: string };
  }>;
};

const RANGE_CONFIG: Record<MonitoringRange, { label: string; hours: number; limit: number; tick: Intl.DateTimeFormatOptions }> = {
  "10m": { label: "10 минут", hours: 1, limit: 120, tick: { hour: "2-digit", minute: "2-digit", second: "2-digit" } },
  "1h": { label: "1 час", hours: 2, limit: 180, tick: { hour: "2-digit", minute: "2-digit", second: "2-digit" } },
  "24h": { label: "24 часа", hours: 24, limit: 240, tick: { hour: "2-digit", minute: "2-digit" } },
  "7d": { label: "7 дней", hours: 168, limit: 320, tick: { day: "2-digit", month: "2-digit", hour: "2-digit" } },
};

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};

const fmtPercent = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? `${Math.round(n)}%` : "-";
};

const fmtNumber = (value: unknown, suffix = "") => {
  const n = Number(value);
  return Number.isFinite(n) ? `${n}${suffix}` : "-";
};

const fmtGbPair = (used: unknown, total: unknown, fallbackPercent?: unknown) => {
  const usedN = Number(used);
  const totalN = Number(total);
  if (Number.isFinite(usedN) && Number.isFinite(totalN) && totalN > 0) {
    return `${usedN.toFixed(1)} / ${totalN.toFixed(1)} GB`;
  }
  return fmtPercent(fallbackPercent);
};

export default function Monitoring() {
  const [selectedAgentSystemId, setSelectedAgentSystemId] = useState<string>("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("none");
  const [selectedRange, setSelectedRange] = useState<MonitoringRange>("24h");
  const [agentAutostart, setAgentAutostart] = useState(true);
  const [renameSystemId, setRenameSystemId] = useState<string>("");
  const [renameValue, setRenameValue] = useState("");
  const { toast } = useToast();

  const { data: systems = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/systems"],
    refetchInterval: 10000,
  });

  const { data: companyData } = useQuery<CompaniesMe>({
    queryKey: ["/api/companies/me"],
    refetchInterval: 60_000,
  });

  const { data: streams = [] } = useQuery<any[]>({
    queryKey: ["/api/streams", "active=true"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/streams?active=true");
      return response.json();
    },
    refetchInterval: 60000,
  });

  const renameSystemMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const response = await apiRequest("PUT", `/api/systems/${id}`, { name });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Сохранено", description: "Устройство переименовано" });
      setRenameSystemId("");
      setRenameValue("");
      queryClient.invalidateQueries({ queryKey: ["/api/systems"] });
    },
    onError: (error: any) => {
      toast({ title: "Ошибка", description: error?.message || "Не удалось переименовать устройство", variant: "destructive" });
    },
  });

  const deleteSystemMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/systems/${id}`);
    },
    onSuccess: (_data, id) => {
      toast({ title: "Удалено", description: "Устройство удалено из мониторинга" });
      if (selectedAgentSystemId === id) setSelectedAgentSystemId("");
      queryClient.invalidateQueries({ queryKey: ["/api/systems"] });
    },
    onError: (error: any) => {
      toast({ title: "Ошибка", description: error?.message || "Не удалось удалить устройство", variant: "destructive" });
    },
  });

  const handleDeleteSystem = (system: any) => {
    if (!confirm(`Удалить "${system.name || "устройство"}" из мониторинга?`)) return;
    deleteSystemMutation.mutate(system.id);
  };

  const startRenameSystem = (system: any) => {
    setRenameSystemId(system.id);
    setRenameValue(system.name || "");
  };

  const submitRenameSystem = () => {
    const name = renameValue.trim();
    if (!renameSystemId || !name) return;
    renameSystemMutation.mutate({ id: renameSystemId, name });
  };

  // Connect to WebSocket for real-time updates (опционально)
  // WebSocket не критичен - приложение должно работать без него
  const { isConnected } = useWebSocket();

  const onlineSystems = systems.filter((system: any) => system.status === "online") || [];
  const offlineSystems = systems.filter((system: any) => system.status === "offline") || [];
  const maintenanceSystems = systems.filter((system: any) => system.status === "maintenance") || [];
  const agentSystems = systems.filter((system: any) => {
    const specifications = asRecord(system.specifications);
    return Boolean(specifications.agentKey || asRecord(specifications.agent).agentKey);
  });
  const selectedAgentSystem = agentSystems.find((system: any) => system.id === selectedAgentSystemId) || agentSystems[0];
  const selectedRangeConfig = RANGE_CONFIG[selectedRange];

  const { data: metricsHistory } = useQuery<{ points: AgentMetricPoint[] }>({
    queryKey: ["/api/agents/metrics", selectedAgentSystem?.id, selectedRange],
    queryFn: async () => {
      const response = await apiRequest(
        "GET",
        `/api/agents/metrics?systemId=${encodeURIComponent(selectedAgentSystem?.id || "")}&limit=${selectedRangeConfig.limit}&hours=${selectedRangeConfig.hours}`,
      );
      return response.json();
    },
    enabled: Boolean(selectedAgentSystem?.id),
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (!selectedAgentSystemId && agentSystems[0]?.id) {
      setSelectedAgentSystemId(agentSystems[0].id);
    }
  }, [agentSystems, selectedAgentSystemId]);

  useEffect(() => {
    if (selectedCompanyId !== "none") return;
    const firstCompanyId = companyData?.companies?.[0]?.company?.id;
    if (firstCompanyId) {
      setSelectedCompanyId(firstCompanyId);
    }
  }, [companyData, selectedCompanyId]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "online": return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "offline": return <AlertTriangle className="w-4 h-4 text-red-600" />;
      case "maintenance": return <Activity className="w-4 h-4 text-yellow-600" />;
      default: return <Monitor className="w-4 h-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "online": return "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300";
      case "offline": return "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300";
      case "maintenance": return "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "online": return "Онлайн";
      case "offline": return "Офлайн";
      case "maintenance": return "Обслуживание";
      default: return status;
    }
  };

  const getSystemTypeIcon = (type: string) => {
    switch (type) {
      case "server": return <Server className="w-6 h-6" />;
      case "computer": return <Monitor className="w-6 h-6" />;
      case "network": return <Wifi className="w-6 h-6" />;
      default: return <Monitor className="w-6 h-6" />;
    }
  };

  const systemsStats = {
    total: systems.length || 0,
    online: onlineSystems.length,
    offline: offlineSystems.length,
    maintenance: maintenanceSystems.length,
    uptime: systems.length ? Math.round((onlineSystems.length / systems.length) * 100) : 0,
  };

  const chartData = (metricsHistory?.points || []).map((point) => ({
    ...point,
    time: new Date(point.timestamp).toLocaleString("ru-RU", selectedRangeConfig.tick),
    cpuPercent: point.cpuPercent ?? undefined,
    memoryPercent: point.memoryPercent ?? undefined,
    diskPercent: point.diskPercent ?? undefined,
    memoryUsedGb: point.memoryUsedGb ?? undefined,
    memoryTotalGb: point.memoryTotalGb ?? undefined,
    diskFreeGb: point.diskFreeGb ?? undefined,
    diskTotalGb: point.diskTotalGb ?? undefined,
    networkRxMbps: point.networkRxMbps ?? undefined,
    networkTxMbps: point.networkTxMbps ?? undefined,
  }));
  const selectedAgentSpec = asRecord(selectedAgentSystem?.specifications);
  const selectedAgentMetrics = asRecord(selectedAgentSpec.metrics);
  const selectedAgentHardware = asRecord(selectedAgentSpec.hardware);
  const selectedAgentVmix = asRecord(selectedAgentSpec.vmix);
  const selectedAgentInfo = asRecord(selectedAgentSpec.agent);
  const selectedGpuNames = [
    ...(Array.isArray(selectedAgentHardware.gpus) ? selectedAgentHardware.gpus : []),
    ...(Array.isArray(selectedAgentHardware.videoControllers) ? selectedAgentHardware.videoControllers : []),
  ]
    .map((gpu) => String(asRecord(gpu).name || asRecord(gpu).caption || asRecord(gpu).description || "").trim())
    .filter(Boolean);
  const selectedGpuText = Array.from(new Set(selectedGpuNames)).join(", ");

  const downloadAgent = (osName: "windows" | "linux", agentType: "server" | "computer" | "vmix", autostart = agentAutostart) => {
    if (!selectedCompanyId || selectedCompanyId === "none") return;
    window.open(`/api/companies/${selectedCompanyId}/agent-download?os=${osName}&type=${agentType}&autostart=${autostart ? "1" : "0"}`, "_blank");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Загрузка данных мониторинга...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 w-full min-w-0 max-w-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Отслеживание состояния всех систем в реальном времени
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full shrink-0 ${isConnected ? 'bg-green-500' : 'bg-muted-foreground/50'}`} title={isConnected ? 'Обновления в реальном времени' : 'WebSocket не подключён (запустите сервер с WS)'}></div>
            <span className="text-sm text-muted-foreground">
              {isConnected ? 'Обновления в реальном времени' : 'Обновление по кнопке'}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetch();
              queryClient.invalidateQueries({ queryKey: ["/api/systems"] });
            }}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Обновить
          </Button>
        </div>
      </div>

      {/* System Overview — плитки с иконками и акцентами */}
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-2xl border-border/70 bg-card/90">
          <CardHeader className="pb-3">
            <CardTitle className="text-base sm:text-lg">Точность графиков и диапазон</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">Интервал просмотра</div>
              <Select value={selectedRange} onValueChange={(value) => setSelectedRange(value as MonitoringRange)}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите диапазон" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(RANGE_CONFIG).map(([value, config]) => (
                    <SelectItem key={value} value={value}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground">
                Для коротких интервалов графики показываются почти посекундно, для длинных — спокойным обзором за часы и дни.
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">Рабочее пространство компании</div>
              <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите компанию" />
                </SelectTrigger>
                <SelectContent>
                  {(companyData?.companies || []).map((item) => (
                    <SelectItem key={item.company.id} value={item.company.id}>
                      {item.company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground">
                Любой скачанный агент будет привязан именно к этой компании и её monitoring workspace.
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base sm:text-lg">Агенты для компании</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Запустите bat/sh на машине, и она сама передаст характеристики, тип устройства и heartbeat в систему мониторинга компании.
            </div>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/80 px-3 py-2 text-sm">
              <span className="flex items-center gap-2 font-medium text-foreground">
                <Power className="h-4 w-4 text-primary" />
                Добавить в автозапуск
              </span>
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={agentAutostart}
                onChange={(event) => setAgentAutostart(event.target.checked)}
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" onClick={() => downloadAgent("windows", "computer")} disabled={selectedCompanyId === "none"} className="justify-start">
                <Download className="mr-2 h-4 w-4" />
                Компьютер Windows
              </Button>
              <Button variant="outline" onClick={() => downloadAgent("windows", "server")} disabled={selectedCompanyId === "none"} className="justify-start">
                <Download className="mr-2 h-4 w-4" />
                Сервер Windows
              </Button>
              <Button variant="outline" onClick={() => downloadAgent("windows", "vmix")} disabled={selectedCompanyId === "none"} className="justify-start sm:col-span-2">
                <Download className="mr-2 h-4 w-4" />
                vMix Windows
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <Card className="rounded-2xl border-border shadow-sm overflow-hidden">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Всего систем</p>
                <p className="text-2xl sm:text-3xl font-bold text-foreground mt-1">{systemsStats.total}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                <Monitor className="w-6 h-6 text-slate-600 dark:text-slate-300" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-green-200 dark:border-green-900/50 shadow-sm overflow-hidden">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Онлайн</p>
                <p className="text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-400 mt-1">{systemsStats.online}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/40 flex items-center justify-center shrink-0">
                <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-red-200 dark:border-red-900/50 shadow-sm overflow-hidden">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Офлайн</p>
                <p className="text-2xl sm:text-3xl font-bold text-red-600 dark:text-red-400 mt-1">{systemsStats.offline}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-blue-200 dark:border-blue-900/50 shadow-sm overflow-hidden">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-muted-foreground">Доступность</p>
                <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400 mt-1">{systemsStats.uptime}%</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                <TrendingUp className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <div className="mt-4">
              <Progress value={systemsStats.uptime} className="h-2 rounded-full" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Systems Grid — современные карточки */}
      <Card className="rounded-2xl border border-border shadow-sm overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <span className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Radio className="w-5 h-5 text-primary" />
            </span>
            Агентский мониторинг ({agentSystems.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {agentSystems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
              Запустите `agent-computer.bat`, `agent-server.bat` или `agent-vmix.bat`, и машина появится здесь без ручного ввода IP.
            </div>
          ) : (
            <>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {agentSystems.map((system: any) => {
                  const spec = asRecord(system.specifications);
                  const agent = asRecord(spec.agent);
                  const isSelected = system.id === selectedAgentSystem?.id;
                  return (
                    <Button
                      key={system.id}
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      className="shrink-0 rounded-lg"
                      onClick={() => setSelectedAgentSystemId(system.id)}
                    >
                      {system.name}
                      {agent.deviceType && <span className="ml-2 text-xs opacity-80">{agent.deviceType}</span>}
                    </Button>
                  );
                })}
              </div>

              {selectedAgentSystem && (
                <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-5">
                  <div className="space-y-3">
                    <div className="rounded-xl border border-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm text-muted-foreground">Выбранный агент</p>
                          {renameSystemId === selectedAgentSystem.id ? (
                            <div className="mt-1 flex gap-2">
                              <Input
                                value={renameValue}
                                onChange={(event) => setRenameValue(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") submitRenameSystem();
                                  if (event.key === "Escape") setRenameSystemId("");
                                }}
                                className="h-8"
                                autoFocus
                              />
                              <Button size="sm" onClick={submitRenameSystem} disabled={renameSystemMutation.isPending || !renameValue.trim()}>
                                OK
                              </Button>
                            </div>
                          ) : (
                            <p className="font-semibold text-foreground truncate">{selectedAgentSystem.name}</p>
                          )}
                          <p className="text-xs text-muted-foreground font-mono truncate">{selectedAgentSystem.ipAddress || selectedAgentInfo.agentKey}</p>
                        </div>
                        <Badge className={cn("rounded-lg", selectedAgentSystem.status === "online" ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300" : "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300")}>
                          {getStatusText(selectedAgentSystem.status)}
                        </Badge>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startRenameSystem(selectedAgentSystem)} title="Переименовать">
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeleteSystem(selectedAgentSystem)} title="Удалить">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                        <div className="rounded-lg bg-muted/40 px-2 py-1">
                          Интервал: <span className="font-medium text-foreground">{selectedAgentInfo.intervalSec ?? "-" } c</span>
                        </div>
                        <div className="rounded-lg bg-muted/40 px-2 py-1">
                          Задержка: <span className="font-medium text-foreground">{Number.isFinite(Number(selectedAgentInfo.sampleLagMs)) ? `${Math.round(Number(selectedAgentInfo.sampleLagMs))} мс` : "-"}</span>
                        </div>
                        <div className="rounded-lg bg-muted/40 px-2 py-1">
                          Давность: <span className="font-medium text-foreground">{selectedAgentInfo.staleSec ?? 0} c</span>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-1 gap-3">
                        <div>
                          <div className="mb-1 flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2"><Cpu className="w-4 h-4 text-muted-foreground" /> CPU</span>
                            <span className="font-medium">{fmtPercent(selectedAgentMetrics.cpuPercent)}</span>
                          </div>
                          <Progress value={Number(selectedAgentMetrics.cpuPercent) || 0} className="h-2" />
                        </div>
                        <div>
                          <div className="mb-1 flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2"><MemoryStick className="w-4 h-4 text-muted-foreground" /> RAM</span>
                            <span className="font-medium">{fmtGbPair(selectedAgentMetrics.memoryUsedGb, selectedAgentMetrics.memoryTotalGb, selectedAgentMetrics.memoryPercent)}</span>
                          </div>
                          <Progress value={Number(selectedAgentMetrics.memoryPercent) || 0} className="h-2" />
                        </div>
                        <div>
                          <div className="mb-1 flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2"><HardDrive className="w-4 h-4 text-muted-foreground" /> Диск C:</span>
                            <span className="font-medium">{Number.isFinite(Number(selectedAgentMetrics.diskFreeGb)) && Number.isFinite(Number(selectedAgentMetrics.diskTotalGb)) ? `${Number(selectedAgentMetrics.diskFreeGb).toFixed(1)} GB свободно` : fmtPercent(selectedAgentMetrics.diskPercent)}</span>
                          </div>
                          <Progress value={Number(selectedAgentMetrics.diskPercent) || 0} className="h-2" />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-border p-3 col-span-2">
                        <p className="text-xs text-muted-foreground">GPU</p>
                        <p className="text-sm font-semibold leading-snug">{selectedGpuText || "-"}</p>
                      </div>
                      <div className="rounded-xl border border-border p-3">
                        <p className="text-xs text-muted-foreground">Сеть вход</p>
                        <p className="text-lg font-semibold">{fmtNumber(selectedAgentMetrics.networkRxMbps, " Mbps")}</p>
                      </div>
                      <div className="rounded-xl border border-border p-3">
                        <p className="text-xs text-muted-foreground">Сеть выход</p>
                        <p className="text-lg font-semibold">{fmtNumber(selectedAgentMetrics.networkTxMbps, " Mbps")}</p>
                      </div>
                      <div className="rounded-xl border border-border p-3">
                        <p className="text-xs text-muted-foreground">vMix</p>
                        <p className={cn("text-lg font-semibold", selectedAgentVmix.connected ? "text-green-600 dark:text-green-400" : "text-muted-foreground")}>
                          {selectedAgentVmix.enabled ? (selectedAgentVmix.connected ? "online" : "offline") : "off"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border p-4 min-h-[460px]">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">График нагрузки</p>
                        <p className="text-xs text-muted-foreground">История heartbeat по выбранной машине</p>
                      </div>
                      <Badge variant="secondary" className="rounded-lg">{chartData.length} точек</Badge>
                    </div>
                    {chartData.length === 0 ? (
                      <div className="h-[250px] flex items-center justify-center rounded-lg bg-muted/30 text-sm text-muted-foreground">
                        История появится после нескольких heartbeat от агента
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="h-[210px] rounded-lg border border-border/60 p-2">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                              <XAxis dataKey="time" tick={{ fontSize: 12 }} minTickGap={24} />
                              <YAxis tick={{ fontSize: 12 }} width={36} domain={[0, 100]} />
                              <Tooltip />
                              <Legend />
                              <Line type="monotone" dataKey="cpuPercent" name="CPU %" stroke="#16a34a" dot={false} strokeWidth={2} />
                              <Line type="monotone" dataKey="memoryPercent" name="RAM %" stroke="#2563eb" dot={false} strokeWidth={2} />
                              <Line type="monotone" dataKey="diskPercent" name="Disk %" stroke="#dc2626" dot={false} strokeWidth={2} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="grid gap-4">
                          <div className="h-[220px] rounded-lg border border-border/60 p-2">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis dataKey="time" tick={{ fontSize: 12 }} minTickGap={24} />
                                <YAxis tick={{ fontSize: 12 }} width={44} />
                                <Tooltip />
                                <Legend />
                                <Line type="monotone" dataKey="networkRxMbps" name="Сеть IN Mbps" stroke="#0891b2" dot={false} strokeWidth={2} />
                                <Line type="monotone" dataKey="networkTxMbps" name="Сеть OUT Mbps" stroke="#f59e0b" dot={false} strokeWidth={2} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Online Systems */}
        <Card className="rounded-2xl border border-border shadow-sm overflow-hidden bg-card/50 dark:bg-card/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg text-foreground">
              <span className="w-9 h-9 rounded-xl bg-green-500/15 dark:bg-green-500/20 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
              </span>
              Онлайн системы ({onlineSystems.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {onlineSystems.length === 0 ? (
                <p className="text-muted-foreground text-center py-6 rounded-xl bg-muted/30">Нет онлайн систем</p>
              ) : (
                onlineSystems.map((system: any) => (
                  <div
                    key={system.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl border border-green-200/60 dark:border-green-800/40 bg-green-50/80 dark:bg-green-950/30 hover:bg-green-50 dark:hover:bg-green-950/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/40 flex items-center justify-center shrink-0 text-green-600 dark:text-green-400">
                        {getSystemTypeIcon(system.type)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{system.name}</p>
                        <p className="text-sm text-muted-foreground truncate">{system.location}</p>
                        {system.ipAddress && (
                          <p className="text-xs text-muted-foreground/80 font-mono">{system.ipAddress}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge className={cn("rounded-lg font-medium", getStatusColor(system.status))}>
                        {getStatusText(system.status)}
                      </Badge>
                      {system.lastPing && (
                        <p className="text-xs text-muted-foreground mt-1.5">
                          {new Date(system.lastPing).toLocaleTimeString("ru-RU")}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Offline/Problem Systems */}
        <Card className="rounded-2xl border border-border shadow-sm overflow-hidden bg-card/50 dark:bg-card/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg text-foreground">
              <span className="w-9 h-9 rounded-xl bg-amber-500/15 dark:bg-amber-500/20 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </span>
              Проблемные системы ({offlineSystems.length + maintenanceSystems.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {offlineSystems.length === 0 && maintenanceSystems.length === 0 ? (
                <p className="text-muted-foreground text-center py-6 rounded-xl bg-muted/30">Все системы работают нормально</p>
              ) : (
                <>
                  {offlineSystems.map((system: any) => (
                    <div
                      key={system.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl border border-red-200/60 dark:border-red-800/40 bg-red-50/80 dark:bg-red-950/30 hover:bg-red-50/100 dark:hover:bg-red-950/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0 text-red-600 dark:text-red-400">
                          {getSystemTypeIcon(system.type)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{system.name}</p>
                          <p className="text-sm text-muted-foreground truncate">{system.location}</p>
                          {system.ipAddress && (
                            <p className="text-xs text-muted-foreground/80 font-mono">{system.ipAddress}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <Badge className={cn("rounded-lg font-medium", getStatusColor(system.status))}>
                          {getStatusText(system.status)}
                        </Badge>
                        {system.lastPing && (
                          <p className="text-xs text-muted-foreground mt-1.5">
                            {new Date(system.lastPing).toLocaleTimeString("ru-RU")}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                  {maintenanceSystems.map((system: any) => (
                    <div
                      key={system.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl border border-amber-200/60 dark:border-amber-800/40 bg-amber-50/80 dark:bg-amber-950/30 hover:bg-amber-50/100 dark:hover:bg-amber-950/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0 text-amber-600 dark:text-amber-400">
                          {getSystemTypeIcon(system.type)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{system.name}</p>
                          <p className="text-sm text-muted-foreground truncate">{system.location}</p>
                          {system.ipAddress && (
                            <p className="text-xs text-muted-foreground/80 font-mono">{system.ipAddress}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <Badge className={cn("rounded-lg font-medium", getStatusColor(system.status))}>
                          {getStatusText(system.status)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Streams Monitoring */}
      {streams && streams.length > 0 && (
        <Card className="rounded-2xl border border-border shadow-sm overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Activity className="w-4 h-4 text-primary" />
              </span>
              Активные стримы ({streams.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {streams.map((stream: any) => (
                <div key={stream.id} className="p-4 rounded-xl border border-border bg-card/50">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-foreground truncate">{stream.title}</h3>
                    <Badge className="rounded-lg bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300 shrink-0">Живой эфир</Badge>
                  </div>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Платформа:</span>
                      <span className="font-medium">{stream.platform}</span>
                    </div>
                    {stream.bitrate && (
                      <div className="flex justify-between">
                        <span>Битрейт:</span>
                        <span className="font-medium">{stream.bitrate} kbps</span>
                      </div>
                    )}
                    {stream.fps && (
                      <div className="flex justify-between">
                        <span>FPS:</span>
                        <span className="font-medium">{stream.fps}</span>
                      </div>
                    )}
                    {stream.viewerCount !== null && (
                      <div className="flex justify-between">
                        <span>Зрители:</span>
                        <span className="font-medium">{stream.viewerCount}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
