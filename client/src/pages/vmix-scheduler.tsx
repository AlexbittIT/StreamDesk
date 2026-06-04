import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Video, 
  RefreshCw, 
  Play, 
  Square, 
  Settings, 
  CheckCircle2, 
  AlertCircle,
  Calendar,
  Clock,
  Radio,
  Power,
  PowerOff,
  Layers,
  Film,
  Plus,
  Trash2,
  Edit,
  Wifi,
  WifiOff,
  Monitor,
  Zap,
  ArrowRight,
  Info
} from "lucide-react";
import { format, parseISO, isPast, isToday, isTomorrow, addMinutes, differenceInMinutes } from "date-fns";
import { ru } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface VmixEvent {
  id: string;
  title: string;
  startTime: string;
  endTime?: string;
  status: "scheduled" | "live" | "completed" | "error";
  actions: string[];
  input?: string;
  preset?: string;
  channel?: string;
  vmixHost?: string | null;
  vmixPort?: number | null;
  executedAt?: string;
  errorMessage?: string | null;
}

interface VmixConnection {
  connected: boolean;
  host: string;
  port: number;
  inputs: Array<{ number: number; title: string; state: string }>;
  preview: number;
  program: number;
  recording: boolean;
  streaming: boolean;
}

type VmixTargetMode = "agent" | "direct";

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};

export default function VmixScheduler() {
  const [vmixHost, setVmixHost] = useState(localStorage.getItem("vmix_host") || "localhost");
  const [vmixPort, setVmixPort] = useState(localStorage.getItem("vmix_port") || "8088");
  const [targetMode, setTargetMode] = useState<VmixTargetMode>((localStorage.getItem("vmix_target_mode") as VmixTargetMode) || "agent");
  const [selectedAgentKey, setSelectedAgentKey] = useState(localStorage.getItem("vmix_agent_key") || "");
  const [isConnecting, setIsConnecting] = useState(false);
  const { toast } = useToast();

  const { data: systems = [] } = useQuery<any[]>({
    queryKey: ["/api/systems"],
    refetchInterval: 10000,
  });

  const vmixAgents = systems.filter((system: any) => {
    const spec = asRecord(system.specifications);
    const agent = asRecord(spec.agent);
    const vmix = asRecord(spec.vmix);
    const caps = Array.isArray(agent.capabilities) ? agent.capabilities : [];
    return agent.deviceType === "vmix" || caps.includes("vmix-scheduler") || vmix.enabled;
  });
  const selectedAgent = vmixAgents.find((system: any) => {
    const spec = asRecord(system.specifications);
    const agent = asRecord(spec.agent);
    return String(agent.agentKey || spec.agentKey || "") === selectedAgentKey;
  }) || vmixAgents[0];
  const selectedAgentSpec = asRecord(selectedAgent?.specifications);
  const selectedAgentInfo = asRecord(selectedAgentSpec.agent);
  const selectedAgentVmix = asRecord(selectedAgentSpec.vmix);
  const effectiveAgentKey = String(selectedAgentInfo.agentKey || selectedAgentSpec.agentKey || selectedAgentKey || "");

  // Проверка подключения только по кнопке «Подключиться» или «Обновить» — без авто-опросов и повторов
  const { data: directConnection, refetch: checkConnection, isFetching: isCheckingConnection } = useQuery<VmixConnection>({
    queryKey: ["/api/vmix/status", vmixHost, vmixPort],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/vmix/status?host=${vmixHost}&port=${vmixPort}`);
      return response.json();
    },
    enabled: false,
    retry: 0,
  });

  const agentConnection: VmixConnection | undefined = selectedAgent ? {
    connected: Boolean(selectedAgentVmix.connected),
    host: selectedAgent?.name || "vMix agent",
    port: 0,
    inputs: Array.isArray(selectedAgentVmix.inputs) ? selectedAgentVmix.inputs : [],
    preview: Number(selectedAgentVmix.preview || 0),
    program: Number(selectedAgentVmix.active || selectedAgentVmix.program || 0),
    recording: Boolean(selectedAgentVmix.recording),
    streaming: Boolean(selectedAgentVmix.streaming),
  } : undefined;
  const connection = targetMode === "agent" ? agentConnection : directConnection;

  // Получение событий расписания
  const { data: eventsData, refetch: refetchEvents, isLoading: isLoadingEvents } = useQuery<{ events: VmixEvent[] }>({
    queryKey: ["/api/vmix/scheduler"],
    refetchInterval: 30000, // Обновление каждые 30 секунд
  });

  // Подключение к vMix
  const connectMutation = useMutation({
    mutationFn: async (data: { host: string; port: number }) => {
      localStorage.setItem("vmix_host", data.host);
      localStorage.setItem("vmix_port", data.port.toString());
      const response = await apiRequest("POST", "/api/vmix/connect", data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Подключено", description: "Успешно подключено к vMix" });
      checkConnection();
    },
    onError: () => {
      toast({ 
        title: "Ошибка подключения", 
        description: "Не удалось подключиться к vMix. Проверьте настройки.",
        variant: "destructive" 
      });
    },
  });

  // Выполнение команды vMix
  const executeCommandMutation = useMutation({
    mutationFn: async ({ command, value, input, duration }: { command: string; value?: string; input?: string; duration?: number }) => {
      const response = await apiRequest("POST", "/api/vmix/command", { 
        command,
        value,
        input,
        duration,
        host: vmixHost,
        port: parseInt(vmixPort),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Не удалось выполнить команду" }));
        throw new Error(errorData.message || "Не удалось выполнить команду");
      }
      return response.json();
    },
    onSuccess: () => {
      checkConnection();
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось выполнить команду",
        variant: "destructive",
      });
    },
  });

  // Создание события
  const createEventMutation = useMutation({
    mutationFn: async (eventData: { title: string; startTime: string; input?: string; actions: string[]; vmixHost?: string; vmixPort?: number }) => {
      const response = await apiRequest("POST", "/api/vmix/scheduler/events", eventData);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Не удалось создать событие" }));
        throw new Error(errorData.message || "Не удалось создать событие");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Событие создано", description: "Событие успешно добавлено в расписание" });
      refetchEvents();
      setIsCreatingEvent(false);
      setNewEventTitle("");
      setNewEventStartTime("");
      setNewEventInput("");
      setNewEventActions([]);
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось создать событие",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (vmixHost && vmixPort) {
      checkConnection();
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("vmix_target_mode", targetMode);
  }, [targetMode]);

  useEffect(() => {
    if (!localStorage.getItem("vmix_target_mode") && vmixAgents.length > 0) {
      setTargetMode("agent");
    }
  }, [vmixAgents.length]);

  useEffect(() => {
    if (selectedAgentKey) localStorage.setItem("vmix_agent_key", selectedAgentKey);
  }, [selectedAgentKey]);

  useEffect(() => {
    if (!selectedAgentKey && effectiveAgentKey) {
      setSelectedAgentKey(effectiveAgentKey);
    }
  }, [selectedAgentKey, effectiveAgentKey]);

  const handleConnect = () => {
    if (targetMode === "agent") {
      refetchEvents();
      return;
    }
    setIsConnecting(true);
    connectMutation.mutate(
      { host: vmixHost, port: parseInt(vmixPort) },
      {
        onSettled: () => setIsConnecting(false),
      }
    );
  };

  const handleCommand = (command: string, value?: string, input?: string, duration?: number) => {
    if (targetMode === "agent") {
      toast({
        title: "vMix через агент",
        description: "Прямые команды доступны только при IP-подключении. Через BAT-агент создайте событие расписания на нужное время.",
      });
      return;
    }
    if (!connection?.connected) {
      toast({
        title: "Не подключено",
        description: "Сначала подключитесь к vMix",
        variant: "destructive",
      });
      return;
    }
    executeCommandMutation.mutate({ command, value, input, duration });
  };

  const handleCreateEvent = () => {
    if (!newEventTitle.trim()) {
      toast({
        title: "Ошибка",
        description: "Введите название события",
        variant: "destructive",
      });
      return;
    }
    if (!newEventStartTime) {
      toast({
        title: "Ошибка",
        description: "Выберите время начала",
        variant: "destructive",
      });
      return;
    }
    if (!newEventInput && newEventActions.length === 0) {
      toast({
        title: "Ошибка",
        description: "Выберите инпут или действие",
        variant: "destructive",
      });
      return;
    }

    const actions: string[] = [...newEventActions];
    if (newEventInput) {
      actions.push(`PreviewInput${newEventInput}`);
      // Если Cut не выбран вручную, но выбран Fade - используем Fade
      // Если ни Cut ни Fade не выбраны - используем Cut по умолчанию
      if (!actions.includes("Cut") && !actions.includes("Fade")) {
        actions.push("Cut");
      }
    }

    createEventMutation.mutate({
      title: newEventTitle.trim(),
      startTime: new Date(newEventStartTime).toISOString(),
      input: newEventInput || undefined,
      actions,
      vmixHost: targetMode === "agent" ? effectiveAgentKey || undefined : vmixHost || undefined,
      vmixPort: targetMode === "agent" ? undefined : parseInt(vmixPort) || undefined,
    });
  };

  const getEventStatusColor = (status: string) => {
    switch (status) {
      case "live":
        return "bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/50";
      case "scheduled":
        return "bg-blue-500 text-white dark:bg-blue-600";
      case "completed":
        return "bg-emerald-500 text-white dark:bg-emerald-600";
      case "error":
        return "bg-red-500 text-white dark:bg-red-600";
      default:
        return "bg-slate-500 text-white dark:bg-slate-600";
    }
  };

  const getEventStatusText = (status: string) => {
    switch (status) {
      case "live":
        return "В эфире";
      case "scheduled":
        return "Запланировано";
      case "completed":
        return "Завершено";
      case "error":
        return "Ошибка";
      default:
        return status;
    }
  };

  const formatEventDate = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      if (isToday(date)) {
        return `Сегодня, ${format(date, "HH:mm")}`;
      } else if (isTomorrow(date)) {
        return `Завтра, ${format(date, "HH:mm")}`;
      } else {
        return format(date, "d MMM, HH:mm", { locale: ru });
      }
    } catch {
      return dateStr;
    }
  };

  const getTimeUntilEvent = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      const now = new Date();
      const diff = differenceInMinutes(date, now);
      
      if (diff < 0) return null;
      if (diff < 60) return `${diff} мин`;
      const hours = Math.floor(diff / 60);
      const mins = diff % 60;
      return `${hours}ч ${mins}м`;
    } catch {
      return null;
    }
  };

  const events = eventsData?.events || [];
  const [eventInputs, setEventInputs] = useState<Record<string, string>>({});
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventStartTime, setNewEventStartTime] = useState("");
  const [newEventInput, setNewEventInput] = useState("");
  const [newEventActions, setNewEventActions] = useState<string[]>([]);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [executedEvents, setExecutedEvents] = useState<Set<string>>(new Set());

  const upcomingEvents = events.filter((e) => {
    try {
      return !isPast(parseISO(e.startTime)) || e.status === "live";
    } catch {
      return true;
    }
  }).slice(0, 5);

  // Автоматическое выполнение событий по расписанию
  useEffect(() => {
    if (targetMode !== "direct") return;
    if (!connection?.connected) return;

    const checkAndExecuteEvents = async () => {
      const now = new Date();
      
      for (const event of events) {
        if (executedEvents.has(event.id)) continue;
        if (event.status !== "scheduled") continue;

        try {
          const startTime = parseISO(event.startTime);
          const timeDiff = differenceInMinutes(startTime, now);

          // Выполняем событие в момент начала (0 минут разницы, допуск ±30 секунд)
          if (timeDiff <= 0 && timeDiff >= -0.5) {
            const inputNumber = eventInputs[event.id] || event.input || event.actions.find(a => a.startsWith("PreviewInput"))?.replace("PreviewInput", "");
            
            if (inputNumber || event.actions.length > 0) {
              // Помечаем событие как выполненное сразу, чтобы избежать повторного выполнения
              setExecutedEvents(prev => new Set(prev).add(event.id));
              
              // Обновляем статус события в БД
              try {
                await apiRequest("PUT", `/api/vmix/scheduler/events/${event.id}`, {
                  status: "live",
                  executedAt: new Date().toISOString(),
                });
              } catch (updateError) {
                console.error("Failed to update event status:", updateError);
              }

              let delay = 0;
              
              // Переключаем на выбранный инпут, если указан
              if (inputNumber) {
                setTimeout(() => {
                  handleCommand("PreviewInput", undefined, inputNumber);
                }, delay);
                delay += 500; // Увеличена задержка для надежности
              }
              
              // Выполняем переход (Cut или Fade)
              if (event.actions.includes("Cut")) {
                setTimeout(() => {
                  handleCommand("Cut");
                }, delay);
                delay += 500;
              } else if (event.actions.includes("Fade")) {
                setTimeout(() => {
                  handleCommand("Fade");
                }, delay);
                delay += 500;
              }
              
              // Запускаем стрим
              if (event.actions.includes("StartStreaming")) {
                setTimeout(() => {
                  handleCommand("StartStreaming");
                }, delay);
                delay += 1000;
              }
              
              // Запускаем запись
              if (event.actions.includes("StartRecording")) {
                setTimeout(() => {
                  handleCommand("StartRecording");
                }, delay);
                delay += 1000;
              }
              
              // Останавливаем стрим
              if (event.actions.includes("StopStreaming")) {
                setTimeout(() => {
                  handleCommand("StopStreaming");
                }, delay);
                delay += 1000;
              }
              
              // Останавливаем запись
              if (event.actions.includes("StopRecording")) {
                setTimeout(() => {
                  handleCommand("StopRecording");
                }, delay);
                delay += 1000;
              }

              toast({
                title: "Событие выполнено",
                description: `Событие "${event.title}" автоматически выполнено`,
              });
            }
          }
        } catch (error) {
          console.error("Error executing event:", error);
          // Помечаем событие как ошибку
          try {
            await apiRequest("PUT", `/api/vmix/scheduler/events/${event.id}`, {
              status: "error",
              errorMessage: error instanceof Error ? error.message : "Unknown error",
            });
          } catch (updateError) {
            console.error("Failed to update event error status:", updateError);
          }
        }
      }
    };

    const interval = setInterval(checkAndExecuteEvents, 5000); // Проверяем каждые 5 секунд
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, connection?.connected, eventInputs]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-4 sm:space-y-6">
        {/* Заголовок */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Расписатель vMix
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">
              Управление эфирным расписанием и контролем vMix
            </p>
          </div>
          {connection?.connected && (
            <Badge className="px-4 py-2 text-sm bg-green-500 text-white hover:bg-green-600">
              <Wifi className="w-4 h-4 mr-2" />
              Онлайн
            </Badge>
          )}
        </div>

        {/* Подключение к vMix */}
        <Card className="border-2 shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <Video className="w-5 h-5 sm:w-6 sm:h-6" />
              Подключение к vMix
            </CardTitle>
            <CardDescription>
              Введите IP адрес и порт компьютера с vMix
              <br />
              <span className="text-xs text-muted-foreground">
                Локальная сеть: 192.168.x.x | Интернет: узнайте IP на whatismyipaddress.com
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid gap-3 lg:grid-cols-[220px_1fr]">
              <div>
                <Label className="text-sm font-medium">Режим</Label>
                <Select value={targetMode} onValueChange={(value) => setTargetMode(value as VmixTargetMode)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agent">Через BAT-агент</SelectItem>
                    <SelectItem value="direct">Прямой IP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {targetMode === "agent" ? (
                <div>
                  <Label className="text-sm font-medium">vMix-устройство</Label>
                  <Select value={effectiveAgentKey || "__none__"} onValueChange={(value) => setSelectedAgentKey(value === "__none__" ? "" : value)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Выберите vMix-агент" />
                    </SelectTrigger>
                    <SelectContent>
                      {vmixAgents.length === 0 ? (
                        <SelectItem value="__none__">Нет vMix-агентов</SelectItem>
                      ) : (
                        vmixAgents.map((system: any) => {
                          const spec = asRecord(system.specifications);
                          const agent = asRecord(spec.agent);
                          const key = String(agent.agentKey || spec.agentKey || system.id);
                          return (
                            <SelectItem key={key} value={key}>
                              {system.name} {asRecord(spec.vmix).connected ? "online" : "offline"}
                            </SelectItem>
                          );
                        })
                      )}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Если vMix не в одной сети с CRM, скачайте vMix BAT в мониторинге и запустите его на этой машине.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Прямой IP работает, когда сервер StreamDesk видит компьютер с vMix по сети.
                </div>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-end">
              <div className="flex-1 w-full sm:w-auto">
                <Label htmlFor="vmix-host" className="text-sm font-medium">
                  IP адрес компьютера с vMix
                </Label>
                <Input
                  id="vmix-host"
                  value={vmixHost}
                  onChange={(e) => setVmixHost(e.target.value)}
                  placeholder="192.168.1.100 или внешний IP"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Локальная сеть: 192.168.x.x | Через интернет: узнайте IP на whatismyipaddress.com
                </p>
              </div>
              <div className="w-full sm:w-32">
                <Label htmlFor="vmix-port" className="text-sm font-medium">Порт</Label>
                <Input
                  id="vmix-port"
                  type="number"
                  value={vmixPort}
                  onChange={(e) => setVmixPort(e.target.value)}
                  placeholder="8088"
                  className="mt-1"
                />
              </div>
              <Button
                onClick={() => (connection?.connected ? checkConnection() : handleConnect())}
                disabled={isConnecting || connectMutation.isPending || isCheckingConnection}
                className="w-full sm:w-auto min-w-[140px]"
                size="lg"
              >
                {isConnecting || connectMutation.isPending || isCheckingConnection ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Подключение...
                  </>
                ) : connection?.connected ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Обновить
                  </>
                ) : (
                  <>
                    <Radio className="w-4 h-4 mr-2" />
                    Подключиться
                  </>
                )}
              </Button>
            </div>
            {connection && (
              <div className={cn(
                "mt-4 p-3 rounded-lg flex items-center gap-2",
                connection.connected 
                  ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800" 
                  : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
              )}>
                {connection.connected ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-green-900 dark:text-green-100">
                        Подключено к vMix
                      </p>
                      <p className="text-xs text-green-700 dark:text-green-300">
                        {targetMode === "agent" ? (selectedAgent?.name || "vMix agent") : `${vmixHost}:${vmixPort}`} • {connection.inputs?.length || 0} входов
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-900 dark:text-red-100">
                        Не подключено
                      </p>
                      <p className="text-xs text-red-700 dark:text-red-300">
                        Проверьте настройки подключения
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Статус vMix */}
        {connection?.connected && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Monitor className="w-5 h-5 text-blue-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Preview</p>
                    <p className="text-lg font-bold">{connection.preview || "-"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-green-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Play className="w-5 h-5 text-green-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Program</p>
                    <p className="text-lg font-bold">{connection.program || "-"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className={cn(
              "border-l-4",
              connection.recording ? "border-l-red-500" : "border-l-slate-300"
            )}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Film className={cn(
                    "w-5 h-5",
                    connection.recording ? "text-red-500" : "text-slate-400"
                  )} />
                  <div>
                    <p className="text-xs text-muted-foreground">Запись</p>
                    <p className={cn(
                      "text-lg font-bold",
                      connection.recording ? "text-red-500" : "text-muted-foreground"
                    )}>
                      {connection.recording ? "ON" : "OFF"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className={cn(
              "border-l-4",
              connection.streaming ? "border-l-purple-500" : "border-l-slate-300"
            )}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Video className={cn(
                    "w-5 h-5",
                    connection.streaming ? "text-purple-500" : "text-slate-400"
                  )} />
                  <div>
                    <p className="text-xs text-muted-foreground">Стрим</p>
                    <p className={cn(
                      "text-lg font-bold",
                      connection.streaming ? "text-purple-500" : "text-muted-foreground"
                    )}>
                      {connection.streaming ? "ON" : "OFF"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs defaultValue="schedule" className="space-y-4 sm:space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="schedule" className="text-xs sm:text-sm">
              <Calendar className="w-4 h-4 mr-2 hidden sm:inline" />
              Расписание
            </TabsTrigger>
            <TabsTrigger value="control" className="text-xs sm:text-sm">
              <Settings className="w-4 h-4 mr-2 hidden sm:inline" />
              Управление
            </TabsTrigger>
            <TabsTrigger value="events" className="text-xs sm:text-sm">
              <Clock className="w-4 h-4 mr-2 hidden sm:inline" />
              События
            </TabsTrigger>
          </TabsList>

          {/* Вкладка Расписание */}
          <TabsContent value="schedule" className="space-y-4">
            <Card className="shadow-lg">
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <CardTitle className="text-xl">Эфирное расписание</CardTitle>
                    <CardDescription className="mt-1">
                      Предстоящие события и их статус
                    </CardDescription>
                  </div>
                  <Button 
                    onClick={() => refetchEvents()} 
                    variant="outline"
                    size="sm"
                    disabled={isLoadingEvents}
                  >
                    <RefreshCw className={cn("w-4 h-4 mr-2", isLoadingEvents && "animate-spin")} />
                    Обновить
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 sm:space-y-4">
                  {isLoadingEvents ? (
                    <div className="flex items-center justify-center py-12">
                      <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : upcomingEvents.length > 0 ? (
                    upcomingEvents.map((event) => {
                      const timeUntil = getTimeUntilEvent(event.startTime);
                      const selectedInput =
                        eventInputs[event.id] ||
                        (connection?.inputs && connection.inputs[0]
                          ? connection.inputs[0].number.toString()
                          : "");

                      return (
                        <Card 
                          key={event.id} 
                          className={cn(
                            "transition-all hover:shadow-md border-l-4",
                            event.status === "live" && "border-l-red-500 shadow-lg shadow-red-500/20",
                            event.status === "scheduled" && "border-l-blue-500",
                            event.status === "completed" && "border-l-emerald-500",
                            event.status === "error" && "border-l-red-500"
                          )}
                        >
                          <CardContent className="p-4 sm:p-6">
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                  <h3 className="font-semibold text-base sm:text-lg truncate">{event.title}</h3>
                                  <Badge className={getEventStatusColor(event.status)}>
                                    {getEventStatusText(event.status)}
                                  </Badge>
                                  {timeUntil && event.status !== "live" && (
                                    <Badge variant="outline" className="text-xs">
                                      <Clock className="w-3 h-3 mr-1" />
                                      через {timeUntil}
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-sm text-muted-foreground">
                                  <div className="flex items-center gap-1">
                                    <Calendar className="w-4 h-4" />
                                    <span>{formatEventDate(event.startTime)}</span>
                                  </div>
                                  {event.endTime && (
                                    <div className="flex items-center gap-1">
                                      <Clock className="w-4 h-4" />
                                      <span>до {formatEventDate(event.endTime)}</span>
                                    </div>
                                  )}
                                  {event.actions && event.actions.length > 0 && (
                                    <div className="flex items-center gap-1">
                                      <Zap className="w-4 h-4" />
                                      <span>{event.actions.length} действий</span>
                                    </div>
                                  )}
                                </div>
                                {event.actions && event.actions.length > 0 && (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {event.actions.slice(0, 3).map((action, idx) => (
                                      <Badge key={idx} variant="secondary" className="text-xs">
                                        {action}
                                      </Badge>
                                    ))}
                                    {event.actions.length > 3 && (
                                      <Badge variant="secondary" className="text-xs">
                                        +{event.actions.length - 3}
                                      </Badge>
                                    )}
                                  </div>
                                )}
                              </div>
                              {event.status === "scheduled" && connection?.inputs && connection.inputs.length > 0 && (
                                <div className="flex flex-col gap-2 flex-shrink-0 w-full sm:w-56">
                                  <Select
                                    value={selectedInput}
                                    onValueChange={(value) =>
                                      setEventInputs((prev) => ({
                                        ...prev,
                                        [event.id]: value,
                                      }))
                                    }
                                  >
                                    <SelectTrigger className="h-9 text-xs sm:text-sm">
                                      <SelectValue placeholder="Выберите вход" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {connection.inputs.map((input) => (
                                        <SelectItem
                                          key={input.number}
                                          value={input.number.toString()}
                                        >
                                          {input.number}. {input.title || "Input"}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <div className="flex gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="flex-1"
                                      onClick={() =>
                                        selectedInput &&
                                        handleCommand("PreviewInput", undefined, selectedInput)
                                      }
                                      disabled={!selectedInput}
                                    >
                                      <Monitor className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-1" />
                                      <span className="hidden sm:inline">Preview</span>
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="flex-1"
                                      onClick={() => {
                                        if (!selectedInput) return;
                                        handleCommand("PreviewInput", undefined, selectedInput);
                                        setTimeout(() => handleCommand("Cut"), 100);
                                      }}
                                      disabled={!selectedInput}
                                    >
                                      <Play className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-1" />
                                      <span className="hidden sm:inline">Switch</span>
                                    </Button>
                                  </div>
                                  <Button
                                    variant="default"
                                    size="sm"
                                    className="w-full"
                                    onClick={() => {
                                      if (!selectedInput && event.actions.length === 0) {
                                        toast({
                                          title: "Ошибка",
                                          description: "Выберите инпут или добавьте действия",
                                          variant: "destructive",
                                        });
                                        return;
                                      }
                                      
                                      const inputNum = selectedInput || event.actions.find(a => a.startsWith("PreviewInput"))?.replace("PreviewInput", "");
                                      let delay = 0;
                                      
                                      if (inputNum) {
                                        handleCommand("PreviewInput", undefined, inputNum);
                                        delay = 100;
                                      }
                                      
                                      // Выполняем переход
                                      if (event.actions.includes("Cut")) {
                                        setTimeout(() => handleCommand("Cut"), delay);
                                        delay += 100;
                                      } else if (event.actions.includes("Fade")) {
                                        setTimeout(() => handleCommand("Fade"), delay);
                                        delay += 100;
                                      }
                                      
                                      // Запускаем стрим
                                      if (event.actions.includes("StartStreaming")) {
                                        setTimeout(() => handleCommand("StartStreaming"), delay);
                                        delay += 200;
                                      }
                                      
                                      // Запускаем запись
                                      if (event.actions.includes("StartRecording")) {
                                        setTimeout(() => handleCommand("StartRecording"), delay);
                                        delay += 200;
                                      }
                                      
                                      // Останавливаем стрим
                                      if (event.actions.includes("StopStreaming")) {
                                        setTimeout(() => handleCommand("StopStreaming"), delay);
                                        delay += 200;
                                      }
                                      
                                      // Останавливаем запись
                                      if (event.actions.includes("StopRecording")) {
                                        setTimeout(() => handleCommand("StopRecording"), delay);
                                        delay += 200;
                                      }
                                      
                                      toast({
                                        title: "Событие выполнено",
                                        description: `Событие "${event.title}" выполнено вручную`,
                                      });
                                    }}
                                  >
                                    <Zap className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-1" />
                                    <span className="hidden sm:inline">Выполнить сейчас</span>
                                    <span className="sm:hidden">Сейчас</span>
                                  </Button>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p className="text-sm sm:text-base">Нет запланированных событий</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Вкладка Управление */}
          <TabsContent value="control" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              {/* Управление входами */}
              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Layers className="w-5 h-5" />
                    Управление входами
                  </CardTitle>
                  <CardDescription>
                    Выберите вход для Preview или Program
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 sm:space-y-3 max-h-[600px] overflow-y-auto hide-scrollbar">
                  {connection?.inputs && connection.inputs.length > 0 ? (
                    connection.inputs.map((input) => (
                      <div 
                        key={input.number} 
                        className={cn(
                          "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 p-3 border rounded-lg transition-all hover:shadow-md",
                          connection?.preview === input.number && "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 shadow-md",
                          connection?.program === input.number && "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 shadow-md"
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm sm:text-base truncate">{input.title || `Input ${input.number}`}</p>
                          <p className="text-xs text-muted-foreground">Input {input.number}</p>
                        </div>
                        <div className="flex flex-wrap gap-2 flex-shrink-0">
                          <Button
                            size="sm"
                            variant={connection?.preview === input.number ? "default" : "outline"}
                            onClick={() => handleCommand("PreviewInput", undefined, input.number.toString())}
                            className="text-xs sm:text-sm"
                          >
                            <Monitor className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-1" />
                            <span className="hidden sm:inline">Preview</span>
                          </Button>
                          <Button
                            size="sm"
                            variant={connection?.program === input.number ? "default" : "outline"}
                            onClick={() => {
                              // Сначала переключаем на Preview, потом делаем Cut
                              handleCommand("PreviewInput", undefined, input.number.toString());
                              setTimeout(() => handleCommand("Cut"), 100);
                            }}
                            className="text-xs sm:text-sm"
                          >
                            <Play className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-1" />
                            <span className="hidden sm:inline">Program</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              handleCommand("PreviewInput", undefined, input.number.toString());
                              setTimeout(() => handleCommand("Fade"), 100);
                            }}
                            className="text-xs sm:text-sm hidden lg:flex"
                            title="Fade to Program"
                          >
                            <Layers className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-1" />
                            <span className="hidden sm:inline">Fade</span>
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      Нет доступных входов
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Быстрые команды */}
              <div className="space-y-4 sm:space-y-6">
                <Card className="shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="w-5 h-5" />
                      Быстрые команды
                    </CardTitle>
                    <CardDescription>
                      Основные действия управления
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 sm:space-y-3">
                    <Button
                      className="w-full justify-start"
                      variant={connection?.recording ? "destructive" : "outline"}
                      onClick={() => handleCommand(connection?.recording ? "StopRecording" : "StartRecording")}
                      size="lg"
                    >
                      <Film className="w-4 h-4 mr-2" />
                      {connection?.recording ? "Остановить запись" : "Начать запись"}
                      {connection?.recording && (
                        <div className="ml-auto w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                      )}
                    </Button>
                    <Button
                      className="w-full justify-start"
                      variant={connection?.streaming ? "destructive" : "outline"}
                      onClick={() => handleCommand(connection?.streaming ? "StopStreaming" : "StartStreaming")}
                      size="lg"
                    >
                      <Video className="w-4 h-4 mr-2" />
                      {connection?.streaming ? "Остановить стрим" : "Начать стрим"}
                      {connection?.streaming && (
                        <div className="ml-auto w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                      )}
                    </Button>
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <Button
                        variant="outline"
                        onClick={() => handleCommand("Cut")}
                        size="lg"
                      >
                        <ArrowRight className="w-4 h-4 mr-2" />
                        Cut
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleCommand("Fade")}
                        size="lg"
                      >
                        <Layers className="w-4 h-4 mr-2" />
                        Fade
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Переход на рекламу */}
                <Card className="shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Monitor className="w-5 h-5" />
                      Реклама
                    </CardTitle>
                    <CardDescription>
                      Быстрый переход на рекламу
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={() => handleCommand("PreviewInput", undefined, "1")}
                      size="lg"
                    >
                      <Video className="w-4 h-4 mr-2" />
                      Перейти на рекламу
                    </Button>
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={() => handleCommand("Cut")}
                      size="lg"
                    >
                      <ArrowRight className="w-4 h-4 mr-2" />
                      Вернуться из рекламы
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Вкладка События */}
          <TabsContent value="events" className="space-y-4">
            <Card className="shadow-lg">
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <CardTitle className="text-xl">Управление событиями</CardTitle>
                    <CardDescription className="mt-1">
                      Создание и редактирование событий расписания
                    </CardDescription>
                  </div>
                  <Dialog open={isCreatingEvent} onOpenChange={setIsCreatingEvent}>
                    <DialogTrigger asChild>
                      <Button size="lg" onClick={() => setIsCreatingEvent(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Добавить событие
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto hide-scrollbar">
                      <DialogHeader>
                        <DialogTitle>Новое событие</DialogTitle>
                        <DialogDescription>
                          Запланируйте новое событие для автоматического выполнения. Выберите время, инпут и действия.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label>Название события *</Label>
                          <Input 
                            placeholder="Например: Утренний эфир" 
                            value={newEventTitle}
                            onChange={(e) => setNewEventTitle(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label>Время начала *</Label>
                          <Input 
                            type="datetime-local" 
                            value={newEventStartTime}
                            onChange={(e) => setNewEventStartTime(e.target.value)}
                            min={new Date().toISOString().slice(0, 16)}
                          />
                        </div>
                        {connection?.inputs && connection.inputs.length > 0 && (
                          <div>
                            <Label>Инпут для переключения</Label>
                              <Select
                                value={newEventInput || "__none__"}
                                onValueChange={(v) => setNewEventInput(v === "__none__" ? "" : v)}
                              >
                              <SelectTrigger>
                                <SelectValue placeholder="Выберите инпут (опционально)" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Не выбирать</SelectItem>
                                {connection.inputs.map((input) => (
                                  <SelectItem key={input.number} value={input.number.toString()}>
                                    {input.number}. {input.title || `Input ${input.number}`}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground mt-1">
                              При выборе инпута будет выполнено: Preview → Cut
                            </p>
                          </div>
                        )}
                        <div>
                          <Label>Действия</Label>
                          <div className="space-y-2 mt-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  id="action-cut"
                                  checked={newEventActions.includes("Cut")}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setNewEventActions([...newEventActions, "Cut"]);
                                    } else {
                                      setNewEventActions(newEventActions.filter(a => a !== "Cut"));
                                    }
                                  }}
                                  className="rounded border-gray-300"
                                />
                                <Label htmlFor="action-cut" className="font-normal cursor-pointer text-sm">
                                  Cut (резкий переход)
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  id="action-fade"
                                  checked={newEventActions.includes("Fade")}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setNewEventActions([...newEventActions, "Fade"]);
                                    } else {
                                      setNewEventActions(newEventActions.filter(a => a !== "Fade"));
                                    }
                                  }}
                                  className="rounded border-gray-300"
                                />
                                <Label htmlFor="action-fade" className="font-normal cursor-pointer text-sm">
                                  Fade (плавный переход)
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  id="action-stream"
                                  checked={newEventActions.includes("StartStreaming")}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setNewEventActions([...newEventActions, "StartStreaming"]);
                                    } else {
                                      setNewEventActions(newEventActions.filter(a => a !== "StartStreaming"));
                                    }
                                  }}
                                  className="rounded border-gray-300"
                                />
                                <Label htmlFor="action-stream" className="font-normal cursor-pointer text-sm">
                                  Начать стрим
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  id="action-recording"
                                  checked={newEventActions.includes("StartRecording")}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setNewEventActions([...newEventActions, "StartRecording"]);
                                    } else {
                                      setNewEventActions(newEventActions.filter(a => a !== "StartRecording"));
                                    }
                                  }}
                                  className="rounded border-gray-300"
                                />
                                <Label htmlFor="action-recording" className="font-normal cursor-pointer text-sm">
                                  Начать запись
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  id="action-stop-stream"
                                  checked={newEventActions.includes("StopStreaming")}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setNewEventActions([...newEventActions, "StopStreaming"]);
                                    } else {
                                      setNewEventActions(newEventActions.filter(a => a !== "StopStreaming"));
                                    }
                                  }}
                                  className="rounded border-gray-300"
                                />
                                <Label htmlFor="action-stop-stream" className="font-normal cursor-pointer text-sm">
                                  Остановить стрим
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  id="action-stop-recording"
                                  checked={newEventActions.includes("StopRecording")}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setNewEventActions([...newEventActions, "StopRecording"]);
                                    } else {
                                      setNewEventActions(newEventActions.filter(a => a !== "StopRecording"));
                                    }
                                  }}
                                  className="rounded border-gray-300"
                                />
                                <Label htmlFor="action-stop-recording" className="font-normal cursor-pointer text-sm">
                                  Остановить запись
                                </Label>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                              Примечание: Если выбран инпут, автоматически выполнится Preview → Cut. 
                              Вы можете выбрать Fade вместо Cut или добавить другие действия.
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2 pt-2">
                          <Button 
                            className="flex-1" 
                            onClick={handleCreateEvent}
                            disabled={createEventMutation.isPending}
                          >
                            {createEventMutation.isPending ? (
                              <>
                                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                Создание...
                              </>
                            ) : (
                              "Создать событие"
                            )}
                          </Button>
                          <Button 
                            variant="outline" 
                            onClick={() => {
                              setIsCreatingEvent(false);
                              setNewEventTitle("");
                              setNewEventStartTime("");
                              setNewEventInput("");
                              setNewEventActions([]);
                            }}
                            disabled={createEventMutation.isPending}
                          >
                            Отмена
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {events.length > 0 ? (
                    events.map((event) => (
                      <Card key={event.id} className="border-l-4 border-l-blue-500">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <h3 className="font-semibold text-base mb-1">{event.title}</h3>
                              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <Calendar className="w-4 h-4" />
                                  <span>{formatEventDate(event.startTime)}</span>
                                </div>
                                {event.actions && event.actions.length > 0 && (
                                  <div className="flex items-center gap-1">
                                    <Zap className="w-4 h-4" />
                                    <span>{event.actions.length} действий</span>
                                  </div>
                                )}
                              </div>
                              {event.actions && event.actions.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {event.actions.map((action, idx) => (
                                    <Badge key={idx} variant="secondary" className="text-xs">
                                      {action}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                            <Badge className={getEventStatusColor(event.status)}>
                              {getEventStatusText(event.status)}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <div className="flex items-center gap-3 p-6 border-2 border-dashed rounded-lg bg-muted/50">
                      <Info className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                      <p className="text-sm text-muted-foreground">
                        Нет созданных событий. Создайте новое событие для автоматического выполнения.
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
