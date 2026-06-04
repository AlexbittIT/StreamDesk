import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Check, Trash2, AlertCircle, Info, CheckCircle, AlertTriangle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

type Notification = {
  id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  read: boolean;
  userId: string | null;
  createdAt: string;
};

type CompaniesMe = {
  companies: Array<{
    company: { id: string; name: string; status: string };
    membership: { id: string; role: string; status: string };
  }>;
};

function getCurrentUserId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("streamstudio_user");
    if (!raw) return null;
    const user = JSON.parse(raw);
    return user?.id ?? null;
  } catch {
    return null;
  }
}

function decodePossiblyBrokenText(value: unknown): string {
  const text = String(value ?? "");
  if (!/[РС][\u0080-\uFFFF]|[ÐÑ]/.test(text)) return text;

  try {
    const bytes: number[] = [];
    for (const char of text) {
      const code = char.charCodeAt(0);
      if (code >= 0x0410 && code <= 0x044f) bytes.push(code - 0x0350);
      else if (code === 0x0401) bytes.push(0xa8);
      else if (code === 0x0451) bytes.push(0xb8);
      else bytes.push(code & 0xff);
    }
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes));
    const score = (sample: string) =>
      (sample.match(/[а-яё]/gi)?.length ?? 0) -
      (sample.match(/[�]/g)?.length ?? 0) * 20 -
      (sample.match(/[РС][\u0080-\uFFFF]/g)?.length ?? 0) * 2;
    return score(decoded) > score(text) ? decoded : text;
  } catch {
    return text;
  }
}

function getNotificationIcon(type: string) {
  switch (type) {
    case "success":
      return <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />;
    case "warning":
      return <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />;
    case "error":
      return <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />;
    default:
      return <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />;
  }
}

function getNotificationColor(type: string) {
  switch (type) {
    case "success":
      return "border-l-emerald-400";
    case "warning":
      return "border-l-amber-400";
    case "error":
      return "border-l-red-400";
    default:
      return "border-l-blue-400";
  }
}

function getTypeLabel(type: string) {
  switch (type) {
    case "success":
      return "Успех";
    case "warning":
      return "Предупреждение";
    case "error":
      return "Ошибка";
    default:
      return "Информация";
  }
}

export default function Notifications() {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(() => getCurrentUserId());
  const [reportTitle, setReportTitle] = useState("");
  const [reportMessage, setReportMessage] = useState("");
  const [reportSeverity, setReportSeverity] = useState("medium");
  const [reportCompanyId, setReportCompanyId] = useState("none");

  useEffect(() => {
    setUserId(getCurrentUserId());
  }, []);

  const { data: companyData } = useQuery<CompaniesMe>({
    queryKey: ["/api/companies/me"],
    enabled: !!userId,
  });

  useEffect(() => {
    if (reportCompanyId !== "none") return;
    const firstCompanyId = companyData?.companies?.[0]?.company?.id;
    if (firstCompanyId) setReportCompanyId(firstCompanyId);
  }, [companyData, reportCompanyId]);

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications", userId],
    queryFn: async () => {
      if (!userId) return [];
      const response = await fetch(`/api/notifications/${userId}`);
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!userId,
  });

  const { data: myReports = [] } = useQuery<any[]>({
    queryKey: ["/api/platform/incidents/mine"],
    enabled: !!userId,
  });

  const markAsReadMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PUT", `/api/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications", userId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/notifications/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications", userId] });
      toast({ title: "Готово", description: "Уведомление удалено" });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/notifications/mark-all-read", { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications", userId] });
      toast({ title: "Готово", description: "Все уведомления отмечены как прочитанные" });
    },
  });

  const reportIssueMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/platform/incidents/report", {
        title: reportTitle,
        message: reportMessage,
        severity: reportSeverity,
        companyId: reportCompanyId === "none" ? undefined : reportCompanyId,
        type: "complaint",
      });
      return response.json();
    },
    onSuccess: () => {
      setReportTitle("");
      setReportMessage("");
      setReportSeverity("medium");
      toast({
        title: "Обращение отправлено",
        description: "Владелец платформы увидит его в owner-console.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Не удалось отправить обращение",
        description: error?.message || "Попробуйте ещё раз через минуту.",
        variant: "destructive",
      });
    },
  });

  const unreadCount = notifications.filter((notification) => !notification.read).length;

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 px-3 py-4 sm:px-4 lg:px-0">
        <div className="h-5 w-64 max-w-full animate-pulse rounded bg-muted" />
        {[1, 2, 3].map((item) => (
          <div key={item} className="h-24 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-3 py-4 sm:space-y-5 sm:px-4 lg:px-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-normal text-foreground sm:text-2xl">Уведомления</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Системные события, задачи и обращения в поддержку.
            {unreadCount > 0 && (
              <Badge className="ml-2 border-red-200 bg-red-100 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-100">
                {unreadCount} новых
              </Badge>
            )}
          </p>
        </div>

        {unreadCount > 0 && (
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => markAllAsReadMutation.mutate()}
            disabled={!userId || markAllAsReadMutation.isPending}
          >
            <Check className="mr-2 h-4 w-4" />
            Прочитать все
          </Button>
        )}
      </div>

      <Card className="border-border bg-card">
        <CardContent className="px-4 py-3 text-sm text-muted-foreground sm:px-5">
          <strong className="text-foreground">Push-уведомления:</strong> чтобы получать события даже при закрытой вкладке,
          разрешите уведомления в браузере. На телефоне лучше установить приложение как PWA.
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-card">
        <CardHeader className="px-4 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <AlertCircle className="h-5 w-5 text-primary" />
            Обращение в поддержку платформы
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="support-title">Что случилось</Label>
              <Input
                id="support-title"
                value={reportTitle}
                onChange={(event) => setReportTitle(event.target.value)}
                placeholder="Коротко опишите проблему"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="support-message">Подробности</Label>
              <Textarea
                id="support-message"
                value={reportMessage}
                onChange={(event) => setReportMessage(event.target.value)}
                placeholder="Что не работает, у какой команды и как повторить"
                rows={5}
                className="min-h-28 resize-y"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Срочность</Label>
              <Select value={reportSeverity} onValueChange={setReportSeverity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Низкая</SelectItem>
                  <SelectItem value="medium">Средняя</SelectItem>
                  <SelectItem value="high">Высокая</SelectItem>
                  <SelectItem value="critical">Критическая</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Компания</Label>
              <Select value={reportCompanyId} onValueChange={setReportCompanyId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Личное пространство</SelectItem>
                  {(companyData?.companies || []).map((item) => (
                    <SelectItem key={item.company.id} value={item.company.id}>
                      {item.company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              onClick={() => reportIssueMutation.mutate()}
              disabled={reportIssueMutation.isPending || reportTitle.trim().length === 0 || reportMessage.trim().length === 0}
            >
              {reportIssueMutation.isPending && <Check className="mr-2 h-4 w-4 animate-pulse" />}
              Отправить
            </Button>
          </div>
        </CardContent>
      </Card>

      {myReports.length > 0 && (
        <Card className="border-primary/20 bg-card">
          <CardHeader className="px-4 sm:px-6">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <AlertTriangle className="h-5 w-5 text-primary" />
              Мои обращения
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 sm:px-6">
            {myReports.map((report) => {
              const done = report.status === "resolved" || report.status === "closed";
              const statusLabel = report.status === "investigating" ? "В работе" : done ? "Выполнено" : "Открыто";
              return (
                <div
                  key={report.id}
                  className={`rounded-lg border p-3 ${done ? "bg-muted/40 opacity-75" : report.status === "investigating" ? "border-blue-400/40 bg-blue-500/5" : "bg-background"}`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="break-words font-medium">{report.title}</div>
                      <div className="mt-1 break-words text-sm text-muted-foreground">{report.message}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Компания: {report.company?.name || "не указана"}
                      </div>
                    </div>
                    <Badge variant={done ? "secondary" : "outline"} className="w-fit shrink-0">{statusLabel}</Badge>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {notifications.length === 0 ? (
          <Card className="bg-card">
            <CardContent className="flex flex-col items-center justify-center px-4 py-12 text-center">
              <Bell className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="text-lg font-semibold text-foreground">Нет уведомлений</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Новые уведомления появятся здесь.
              </p>
            </CardContent>
          </Card>
        ) : (
          notifications.map((notification) => (
            <Card
              key={notification.id}
              className={`border-border bg-card text-card-foreground transition-colors dark:bg-slate-950/80 ${!notification.read ? `${getNotificationColor(notification.type)} border-l-4 shadow-sm` : ""}`}
            >
              <CardHeader className="px-4 pb-3 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-0.5 shrink-0">{getNotificationIcon(notification.type)}</div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="break-words text-base text-foreground">
                          {decodePossiblyBrokenText(notification.title)}
                        </CardTitle>
                        <Badge variant="outline" className="text-xs">{decodePossiblyBrokenText(getTypeLabel(notification.type))}</Badge>
                        {!notification.read && <span className="h-2 w-2 rounded-full bg-blue-600" />}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true, locale: ru })}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 justify-end gap-1">
                    {!notification.read && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        onClick={() => markAsReadMutation.mutate(notification.id)}
                        disabled={markAsReadMutation.isPending}
                        title="Отметить прочитанным"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => deleteMutation.mutate(notification.id)}
                      disabled={deleteMutation.isPending}
                      title="Удалить"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 pt-0 sm:px-5">
                <p className="break-words text-sm leading-6 text-foreground">{decodePossiblyBrokenText(notification.message)}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
