import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Laptop, Plus, Search, Server, Download, Activity, Edit3, Cpu, HardDrive, Network } from "lucide-react";
import { SystemForm } from "@/components/forms/system-form";
import { apiRequest } from "@/lib/queryClient";

type CompaniesMe = {
  companies: Array<{
    company: { id: string; name: string; status: string };
    membership: { id: string; role: string; status: string };
  }>;
};

type InventoryItem = {
  id: string;
  kind: "server" | "computer";
  name: string;
  status: string;
  type: string;
  ipAddress?: string;
  location?: string;
  lastSeen?: string;
  details: Record<string, unknown>;
  source: any;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

function getAgentApprovalStatus(details: Record<string, unknown>) {
  return String(asRecord(details.agent).approvalStatus || "").trim();
}

const statusOptions = [
  { value: "all", label: "Все статусы" },
  { value: "online", label: "Онлайн" },
  { value: "offline", label: "Офлайн" },
  { value: "maintenance", label: "Обслуживание" },
];

const kindOptions = [
  { value: "all", label: "Вся инфраструктура" },
  { value: "server", label: "Серверы" },
  { value: "computer", label: "Рабочие станции" },
];

function normalizeStatus(status: string) {
  if (status === "active") return "online";
  if (status === "broken") return "offline";
  return status || "offline";
}

function getStatusLabel(status: string) {
  switch (status) {
    case "online":
      return "Онлайн";
    case "offline":
      return "Офлайн";
    case "maintenance":
      return "Обслуживание";
    case "pending":
      return "Ожидает";
    case "rejected":
      return "Отклонён";
    default:
      return status || "Неизвестно";
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case "online":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    case "offline":
      return "bg-rose-500/15 text-rose-300 border-rose-500/30";
    case "maintenance":
      return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    case "pending":
      return "bg-violet-500/15 text-violet-300 border-violet-500/30";
    case "rejected":
      return "bg-slate-500/15 text-slate-300 border-slate-500/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function formatDate(value?: string) {
  if (!value) return "Нет данных";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Нет данных";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Servers() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedSystem, setSelectedSystem] = useState<any>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState("none");
  const queryClient = useQueryClient();

  const { data: systems = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/systems"],
  });

  const { data: computers = [] } = useQuery<any[]>({
    queryKey: ["/api/computers"],
  });

  const { data: companyData } = useQuery<CompaniesMe>({
    queryKey: ["/api/companies/me"],
  });

  const approveAgentMutation = useMutation({
    mutationFn: (systemId: string) => apiRequest("POST", `/api/agents/systems/${systemId}/approve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/systems"] });
      queryClient.invalidateQueries({ queryKey: ["/api/computers"] });
    },
  });

  const rejectAgentMutation = useMutation({
    mutationFn: (systemId: string) => apiRequest("POST", `/api/agents/systems/${systemId}/reject`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/systems"] });
      queryClient.invalidateQueries({ queryKey: ["/api/computers"] });
    },
  });

  useEffect(() => {
    if (selectedCompanyId !== "none") return;
    const firstCompanyId = companyData?.companies?.[0]?.company?.id;
    if (firstCompanyId) {
      setSelectedCompanyId(firstCompanyId);
    }
  }, [companyData, selectedCompanyId]);

  const inventory = useMemo<InventoryItem[]>(() => {
    const systemItems = (systems || []).map((item: any) => {
      const details = asRecord(item.specifications);
      return {
        id: item.id,
        kind: String(item.type || "server") === "server" ? "server" as const : "computer" as const,
        name: item.name,
        status: normalizeStatus(item.status),
        type: String(item.type || "server"),
        ipAddress: item.ipAddress || undefined,
        location: item.location || undefined,
        lastSeen: item.lastPing || item.lastChecked || undefined,
        details,
        source: item,
      };
    });

    const computerItems = (computers || []).map((item: any) => ({
      id: item.id,
      kind: "computer" as const,
      name: item.name,
      status: normalizeStatus(item.status),
      type: String(item.purpose || "workstation"),
      ipAddress: item.ipAddress || undefined,
      location: item.location || undefined,
      lastSeen: item.updatedAt || item.createdAt || undefined,
      details: asRecord(item.components),
      source: item,
    }));

    return [...systemItems, ...computerItems];
  }, [systems, computers]);

  const filteredInventory = inventory.filter((item) => {
    const haystack = [item.name, item.type, item.location, item.ipAddress].join(" ").toLowerCase();
    const matchesSearch = haystack.includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;
    const matchesKind = kindFilter === "all" || item.kind === kindFilter;
    return matchesSearch && matchesStatus && matchesKind;
  });

  const pendingAgentItems = inventory.filter((item) => getAgentApprovalStatus(item.details) === "pending");

  const downloadAgent = (osName: "windows" | "linux", agentType: "server" | "computer") => {
    if (!selectedCompanyId || selectedCompanyId === "none") return;
    window.open(`/api/companies/${selectedCompanyId}/agent-download?os=${osName}&type=${agentType}`, "_blank");
  };

  if (isLoading) {
    return <div>Загрузка инфраструктуры...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">
            Единый реестр серверов, рабочих станций и агентских машин компании.
          </div>
        </div>
        <Button
          onClick={() => {
            setSelectedSystem(null);
            setIsFormOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Добавить сервер
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-border/70 bg-card/90">
          <CardHeader className="pb-3">
            <CardTitle>Фильтры инфраструктуры</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="relative md:col-span-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Название, IP, локация, тип машины"
              />
            </div>
            <Select value={kindFilter} onValueChange={setKindFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Тип" />
              </SelectTrigger>
              <SelectContent>
                {kindOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Статус" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => { setSearchTerm(""); setKindFilter("all"); setStatusFilter("all"); }}>
              Сбросить
            </Button>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle>Агенты этой компании</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
            <div className="text-sm text-muted-foreground">
              BAT/SH файл скачивается для конкретной компании и сразу привязывается к её рабочему пространству мониторинга.
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" onClick={() => downloadAgent("windows", "server")} disabled={selectedCompanyId === "none"}>
                <Download className="mr-2 h-4 w-4" />
                Windows Server
              </Button>
              <Button variant="outline" onClick={() => downloadAgent("windows", "computer")} disabled={selectedCompanyId === "none"}>
                <Download className="mr-2 h-4 w-4" />
                Windows Workstation
              </Button>
              <Button variant="outline" onClick={() => downloadAgent("linux", "server")} disabled={selectedCompanyId === "none"}>
                <Download className="mr-2 h-4 w-4" />
                Linux Server
              </Button>
              <Button variant="outline" onClick={() => { window.location.href = "/monitoring"; }}>
                <Activity className="mr-2 h-4 w-4" />
                Открыть мониторинг
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {pendingAgentItems.length > 0 && (
        <Card className="border-violet-300/70 bg-violet-500/10">
          <CardHeader className="pb-3">
            <CardTitle>Агенты в ожидании</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingAgentItems.map((item) => {
              const agent = asRecord(item.details.agent);
              const metrics = asRecord(item.details.metrics);
              const hardware = asRecord(item.details.hardware);
              const motherboard = asRecord(hardware.motherboard);
              const captureDevices = Array.isArray(hardware.captureDevices) ? hardware.captureDevices : [];
              return (
                <div key={`pending-${item.id}`} className="rounded-md border border-violet-300/60 bg-background/80 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium text-foreground">{item.name}</div>
                        <Badge className={getStatusBadge("pending")}>Ожидает</Badge>
                        <Badge variant="outline">{String(agent.deviceType || item.kind)}</Badge>
                      </div>
                      <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                        <div>IP: <span className="font-mono text-foreground">{item.ipAddress || "-"}</span></div>
                        <div>CPU: <span className="text-foreground">{String(metrics.cpuName || "-")}</span></div>
                        <div>RAM: <span className="text-foreground">{metrics.memoryTotalGb ? `${metrics.memoryTotalGb} GB` : "-"}</span></div>
                        <div>Материнская плата: <span className="text-foreground">{[motherboard.manufacturer, motherboard.product].filter(Boolean).join(" ") || "-"}</span></div>
                        <div>Платы захвата: <span className="text-foreground">{captureDevices.length || 0}</span></div>
                        <div>Последний heartbeat: <span className="text-foreground">{formatDate(item.lastSeen)}</span></div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => approveAgentMutation.mutate(item.id)}
                        disabled={approveAgentMutation.isPending}
                      >
                        Добавить
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => rejectAgentMutation.mutate(item.id)}
                        disabled={rejectAgentMutation.isPending}
                      >
                        Отклонить
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {filteredInventory.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="flex flex-col items-center justify-center py-14 text-center">
              <Server className="mb-4 h-12 w-12 text-muted-foreground" />
              <div className="text-lg font-medium">Инфраструктура не найдена</div>
              <div className="text-sm text-muted-foreground">
                Добавьте сервер вручную или запустите agent bat/sh на машине компании.
              </div>
            </CardContent>
          </Card>
        ) : (
          filteredInventory.map((item) => {
            const detailEntries = Object.entries(item.details)
              .filter(([key, value]) => !["agent", "metrics", "hardware", "vmix", "workspace", "companyId"].includes(key) && value != null && String(value).trim().length > 0)
              .slice(0, 4);
            return (
              <Card key={`${item.kind}-${item.id}`} className="border-border/70 bg-card/90">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        {item.kind === "server" ? <Server className="h-5 w-5" /> : <Laptop className="h-5 w-5" />}
                      </div>
                      <div>
                        <CardTitle className="text-base">{item.name}</CardTitle>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <Badge className={getStatusBadge(item.status)}>{getStatusLabel(item.status)}</Badge>
                          <Badge variant="outline">{item.kind === "server" ? "Сервер" : "Рабочая станция"}</Badge>
                        </div>
                      </div>
                    </div>
                    {item.kind === "server" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedSystem(item.source);
                          setIsFormOpen(true);
                        }}
                      >
                        <Edit3 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2 text-sm text-muted-foreground">
                    <div className="flex items-center justify-between gap-3">
                      <span>Тип</span>
                      <span className="font-medium text-foreground">{item.type}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>IP</span>
                      <span className="font-mono text-foreground">{item.ipAddress || "Нет данных"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Локация</span>
                      <span className="text-foreground">{item.location || "Нет данных"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Последняя активность</span>
                      <span className="text-foreground">{formatDate(item.lastSeen)}</span>
                    </div>
                  </div>

                  <div className="grid gap-2 rounded-xl border border-border/60 bg-background/60 p-3">
                    {detailEntries.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        Спецификации подтянутся автоматически после запуска агента или будут заполнены вручную.
                      </div>
                    ) : (
                      detailEntries.map(([key, value], index) => (
                        <div key={`${item.id}-${key}-${index}`} className="flex items-center justify-between gap-3 text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            {index % 3 === 0 ? <Cpu className="h-4 w-4" /> : index % 3 === 1 ? <HardDrive className="h-4 w-4" /> : <Network className="h-4 w-4" />}
                            <span className="capitalize">{key}</span>
                          </div>
                          <span className="max-w-[55%] truncate text-right text-foreground">{String(value)}</span>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button className="flex-1" variant="outline" onClick={() => { window.location.href = "/monitoring"; }}>
                      <Activity className="mr-2 h-4 w-4" />
                      Мониторинг
                    </Button>
                    {item.kind === "server" ? (
                      <Button
                        className="flex-1"
                        onClick={() => {
                          setSelectedSystem(item.source);
                          setIsFormOpen(true);
                        }}
                      >
                        <Edit3 className="mr-2 h-4 w-4" />
                        Редактировать
                      </Button>
                    ) : (
                      <Button className="flex-1" variant="outline" onClick={() => { window.location.href = "/monitoring"; }}>
                        Heartbeat
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <SystemForm isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} system={selectedSystem} />
    </div>
  );
}
