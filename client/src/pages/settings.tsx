import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Settings as SettingsIcon, User, Bell, Shield, Palette, Globe, Smartphone, Languages, Sun, Moon, Sparkles, Camera, ChevronRight, Link2, CheckCircle2, XCircle, Loader2, Terminal } from "lucide-react";
import {
  getBottomNavTabKeys,
  setBottomNavTabKeys,
  getBottomNavCandidates,
  BOTTOM_NAV_MAX_TABS,
  DEFAULT_BOTTOM_NAV_KEYS,
} from "@/components/layout/bottom-nav";
import { useToast } from "@/hooks/use-toast";
import { TelegramAuth } from "@/components/auth/telegram-auth";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";
import { apiUrl, encodeUserHeader } from "@/lib/queryClient";

const API_BASE = (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_BASE) || "";

const CRM_COLUMNS = [
  { id: "not_ready", name: "Бэклог" },
  { id: "todo", name: "К выполнению" },
  { id: "in_progress", name: "В работе" },
  { id: "done", name: "Готово" },
];

function YouGileIntegration() {
  const [status, setStatus] = useState<{ configured: boolean } | null>(null);
  const [config, setConfig] = useState<{ companyId?: string | null; enabled?: boolean } | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [gettingKey, setGettingKey] = useState(false);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [projects, setProjects] = useState<{ id: string; title?: string }[]>([]);
  const [boards, setBoards] = useState<{ id: string; title?: string; projectId?: string }[]>([]);
  const [columns, setColumns] = useState<{ id: string; title?: string }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedBoardId, setSelectedBoardId] = useState("");
  const [savingMap, setSavingMap] = useState(false);
  const { toast } = useToast();

  const base = API_BASE.replace(/\/$/, "");
  const fetchStatus = () => {
    fetch(base ? `${base}/api/yougile/status` : "/api/yougile/status", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setStatus(data))
      .catch(() => setStatus({ configured: false }));
  };
  const fetchConfig = () => {
    fetch(base ? `${base}/api/yougile/config` : "/api/yougile/config", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setConfig(data))
      .catch(() => setConfig(null));
  };

  useEffect(() => {
    fetchStatus();
    fetchConfig();
  }, []);

  useEffect(() => {
    if (!status?.configured) return;
    fetch(base ? `${base}/api/yougile/column-map` : "/api/yougile/column-map", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setColumnMap(typeof data === "object" && data !== null ? data : {}))
      .catch(() => setColumnMap({}));
  }, [status?.configured, base]);

  useEffect(() => {
    if (!status?.configured) return;
    fetch(base ? `${base}/api/yougile/projects` : "/api/yougile/projects", { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then((list) => setProjects(Array.isArray(list) ? list : []))
      .catch(() => setProjects([]));
  }, [status?.configured, base]);

  useEffect(() => {
    if (!selectedProjectId) {
      setBoards([]);
      setSelectedBoardId("");
      setColumns([]);
      return;
    }
    const url = `${base ? base : ""}/api/yougile/boards?projectId=${encodeURIComponent(selectedProjectId)}`;
    fetch(url, { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then((list) => {
        setBoards(Array.isArray(list) ? list : []);
        setSelectedBoardId("");
        setColumns([]);
      })
      .catch(() => setBoards([]));
  }, [selectedProjectId, base]);

  useEffect(() => {
    if (!selectedBoardId) {
      setColumns([]);
      return;
    }
    const url = `${base ? base : ""}/api/yougile/columns?boardId=${encodeURIComponent(selectedBoardId)}`;
    fetch(url, { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then((list) => setColumns(Array.isArray(list) ? list : []))
      .catch(() => setColumns([]));
  }, [selectedBoardId, base]);

  const handleSaveColumnMap = () => {
    setSavingMap(true);
    fetch(base ? `${base}/api/yougile/column-map` : "/api/yougile/column-map", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(columnMap),
    })
      .then((r) => r.ok ? r.json() : r.json().then((e) => Promise.reject(new Error(e?.message || "Ошибка"))))
      .then((saved) => {
        setColumnMap(saved);
        toast({ title: "Сохранено", description: "Сопоставление колонок CRM ↔ YouGile сохранено. Перемещение карточек будет синхронизироваться с YouGile." });
      })
      .catch((e) => toast({ title: "Ошибка", description: e?.message || "Не удалось сохранить", variant: "destructive" }))
      .finally(() => setSavingMap(false));
  };

  const handleCheck = () => {
    setChecking(true);
    setCheckResult(null);
    const url = base ? `${base}/api/yougile/projects` : "/api/yougile/projects";
    fetch(url, { credentials: "include" })
      .then((r) => {
        if (r.ok) return r.json();
        return r.json().then((body) => Promise.reject(new Error(body?.message || body?.error || r.statusText)));
      })
      .then((projects) => {
        setCheckResult({ ok: true, message: `Проектов в YouGile: ${Array.isArray(projects) ? projects.length : 0}` });
      })
      .catch((e) => {
        setCheckResult({ ok: false, message: e.message || "Ошибка подключения" });
        toast({ title: "YouGile", description: e.message, variant: "destructive" });
      })
      .finally(() => setChecking(false));
  };

  const handleGetKey = async () => {
    if (!login.trim() || !password) {
      toast({ title: "Введите логин и пароль YouGile", variant: "destructive" });
      return;
    }
    setGettingKey(true);
    try {
      const url = base ? `${base}/api/yougile/auth/key` : "/api/yougile/auth/key";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ login: login.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Не удалось получить ключ");
      toast({ title: "Готово", description: data?.message || "Ключ сохранён. YouGile готов к работе." });
      setPassword("");
      fetchStatus();
    } catch (e: any) {
      toast({ title: "Ошибка YouGile", description: e?.message || "Не удалось получить ключ", variant: "destructive" });
    } finally {
      setGettingKey(false);
    }
  };

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <h3 className="font-semibold flex items-center gap-2">
        <Link2 className="w-5 h-5 text-primary" />
        YouGile (таск-менеджер)
      </h3>
      <p className="text-sm text-muted-foreground">
        Интеграция с <a href="https://ru.yougile.com/api-v2#/" target="_blank" rel="noopener noreferrer" className="text-primary underline">YouGile API v2</a>.
        {config?.companyId ? (
          <> Company ID задан в .env. Получите API-ключ один раз по логину и паролю YouGile — ключ сохранится на сервере. </>
        ) : (
          <> Задайте <code className="text-xs bg-muted px-1 rounded">YOUGILE_COMPANY_ID</code> в .env, затем получите ключ здесь или укажите <code className="text-xs bg-muted px-1 rounded">YOUGILE_API_KEY</code> в .env. </>
        )}
      </p>
      {config?.companyId && !status?.configured && (
        <div className="grid gap-2 max-w-sm">
          <Label>Логин YouGile</Label>
          <Input type="text" placeholder="email или логин" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" />
          <Label>Пароль YouGile</Label>
          <Input type="password" placeholder="пароль" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          <Button onClick={handleGetKey} disabled={gettingKey}>
            {gettingKey ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Получить и сохранить API-ключ
          </Button>
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        {status?.configured ? (
          <>
            <Badge variant="secondary" className="gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Подключён
            </Badge>
            <Button variant="outline" size="sm" onClick={handleCheck} disabled={checking}>
              {checking ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Проверить подключение
            </Button>
          </>
        ) : (
          <Badge variant="outline" className="gap-1">
            <XCircle className="w-3 h-3" />
            Не настроен
          </Badge>
        )}
      </div>
      {checkResult && (
        <p className={cn("text-sm", checkResult.ok ? "text-green-600 dark:text-green-400" : "text-destructive")}>
          {checkResult.message}
        </p>
      )}
      {status?.configured && (
        <div className="border-t border-border pt-4 mt-4 space-y-3">
          <h4 className="text-sm font-medium">Сопоставление колонок CRM ↔ YouGile</h4>
          <p className="text-xs text-muted-foreground">
            Чтобы при перетаскивании карточек между столбцами изменения попадали в YouGile, выберите доску и сопоставьте каждую колонку CRM с колонкой YouGile.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Проект YouGile</Label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue placeholder="Выберите проект" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.title || p.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Доска YouGile</Label>
              <Select value={selectedBoardId} onValueChange={setSelectedBoardId} disabled={!selectedProjectId}>
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue placeholder="Выберите доску" />
                </SelectTrigger>
                <SelectContent>
                  {boards.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.title || b.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {columns.length > 0 && (
            <div className="space-y-2">
              {CRM_COLUMNS.map((crm) => (
                <div key={crm.id} className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm w-28 shrink-0">{crm.name}</span>
                  <Select
                    value={columnMap[crm.id] || ""}
                    onValueChange={(value) => setColumnMap((prev) => ({ ...prev, [crm.id]: value }))}
                  >
                    <SelectTrigger className="h-8 flex-1 max-w-[200px]">
                      <SelectValue placeholder="Колонка YouGile" />
                    </SelectTrigger>
                    <SelectContent>
                      {columns.map((col) => (
                        <SelectItem key={col.id} value={col.id}>{col.title || col.id}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              <Button size="sm" onClick={handleSaveColumnMap} disabled={savingMap}>
                {savingMap ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Сохранить сопоставление
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const { isSupported, isSubscribed, subscribe, unsubscribe } = usePushNotifications();
  const { language, setLanguage, t } = useI18n();
  const { toast } = useToast();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [profileUser, setProfileUser] = useState<{
    id: string;
    name: string;
    username?: string;
    email?: string;
    phone?: string;
    avatar?: string;
    role?: string;
    permissions?: string[];
    workspaceMode?: string;
  } | null>(() => {
    try {
      const raw = localStorage.getItem("streamstudio_user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [terminalAllowedRoles, setTerminalAllowedRoles] = useState<string[]>([]);
  const [terminalSaving, setTerminalSaving] = useState(false);
  const [bottomNavSelected, setBottomNavSelected] = useState<string[]>(() => {
    const keys = getBottomNavTabKeys().filter((k) => k !== "more");
    return keys.length > 0 ? keys : DEFAULT_BOTTOM_NAV_KEYS.filter((k) => k !== "more");
  });

  const refreshProfile = async (silent = true) => {
    try {
      const response = await fetch(apiUrl("/api/auth/me"), { credentials: "include" });
      if (!response.ok) return;
      const data = await response.json();
      if (!data?.user) return;
      setProfileUser(data.user);
      localStorage.setItem("streamstudio_user", JSON.stringify(data.user));
      if (!silent) toast({ title: "Данные профиля обновлены" });
    } catch {
      if (!silent) toast({ title: "Не удалось обновить профиль", variant: "destructive" });
    }
  };

  const roleLabel = (role?: string) => {
    if (isPlatformOwner) return "Владелец платформы";
    switch (role) {
      case "admin":
        return "Администратор";
      case "manager":
        return "Менеджер";
      case "employee":
        return "Сотрудник";
      default:
        return role || "Не указана";
    }
  };

  useEffect(() => {
    setBottomNavSelected(getBottomNavTabKeys().filter((k) => k !== "more"));
  }, []);

  useEffect(() => {
    void refreshProfile();
  }, []);

  useEffect(() => {
    fetch(API_BASE ? `${API_BASE}/api/terminal/access` : "/api/terminal/access", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { allowedRoles: [] }))
      .then((d) => setTerminalAllowedRoles(Array.isArray(d?.allowedRoles) ? d.allowedRoles : []))
      .catch(() => setTerminalAllowedRoles([]));
  }, []);

  const TERMINAL_ROLES = [
    { id: "admin", label: "Администратор" },
    { id: "manager", label: "Менеджер" },
    { id: "employee", label: "Сотрудник" },
  ];
  const handleTerminalRoleToggle = (roleId: string, checked: boolean) => {
    setTerminalAllowedRoles((prev) =>
      checked ? (prev.includes(roleId) ? prev : [...prev, roleId]) : prev.filter((r) => r !== roleId)
    );
  };
  const handleSaveTerminalAccess = () => {
    setTerminalSaving(true);
    fetch(API_BASE ? `${API_BASE}/api/terminal/access` : "/api/terminal/access", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowedRoles: terminalAllowedRoles.length ? terminalAllowedRoles : ["admin"] }),
    })
      .then((r) => {
        if (!r.ok) throw new Error("Только администратор может менять доступ");
        return r.json();
      })
      .then((d) => {
        setTerminalAllowedRoles(Array.isArray(d?.allowedRoles) ? d.allowedRoles : []);
        toast({ title: "Сохранено", description: "Доступ к Терминалу обновлён." });
      })
      .catch((e) => toast({ title: "Ошибка", description: e?.message || "Не удалось сохранить", variant: "destructive" }))
      .finally(() => setTerminalSaving(false));
  };

  const candidates = getBottomNavCandidates();
  const maxSelect = BOTTOM_NAV_MAX_TABS - 1; // один слот под «Ещё»
  const isPlatformOwner =
    profileUser?.workspaceMode === "platform_admin" ||
    (Array.isArray(profileUser?.permissions) && profileUser.permissions.includes("platform:admin"));
  const settingsTabs = [
    { value: "profile", label: "Профиль", icon: User, visible: true },
    { value: "notifications", label: "Уведомления", icon: Bell, visible: true },
    { value: "security", label: "Безопасность", icon: Shield, visible: true },
    { value: "appearance", label: "Внешний вид", icon: Palette, visible: true },
    { value: "language", label: "Язык", icon: Languages, visible: true },
    { value: "integrations", label: "Интеграции", icon: Globe, visible: !isPlatformOwner },
    { value: "mobile", label: "Телефон", icon: Smartphone, visible: !isPlatformOwner },
  ].filter((tab) => tab.visible);

  const handleBottomNavToggle = (tabKey: string, checked: boolean) => {
    setBottomNavSelected((prev) => {
      if (checked) {
        if (prev.length >= maxSelect) return prev;
        return [...prev, tabKey];
      }
      return prev.filter((k) => k !== tabKey);
    });
  };

  const handleSaveBottomNav = () => {
    const withMore = bottomNavSelected.length > 0 ? [...bottomNavSelected, "more"] : DEFAULT_BOTTOM_NAV_KEYS;
    setBottomNavTabKeys(withMore);
    toast({ title: "Сохранено", description: "Кнопки внизу экрана обновлены. Откройте приложение на телефоне." });
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profileUser?.id) return;
    setAvatarLoading(true);
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      const base = API_BASE.replace(/\/$/, "");
      const url = base ? `${base}/api/users/${profileUser.id}/avatar` : `/api/users/${profileUser.id}/avatar`;
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "x-user": encodeUserHeader(profileUser) },
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Не удалось загрузить фото");
      }
      const data = await res.json();
      const newUser = { ...profileUser, avatar: data.avatar || data.avatarUrl };
      setProfileUser(newUser);
      localStorage.setItem("streamstudio_user", JSON.stringify({ ...JSON.parse(localStorage.getItem("streamstudio_user") || "{}"), avatar: newUser.avatar }));
      toast({ title: "Фото профиля обновлено" });
    } catch (err: any) {
      toast({ title: "Ошибка", description: err?.message || "Не удалось загрузить фото", variant: "destructive" });
    } finally {
      setAvatarLoading(false);
      e.target.value = "";
    }
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem("streamstudio_user");
      if (raw) setProfileUser(JSON.parse(raw));
    } catch {}
  }, []);

  return (
    <div className="min-w-0 overflow-x-hidden space-y-4 sm:space-y-6">
      {/* Блок профиля в стиле Telegram: аватар + имя + контакты */}
      <div className="rounded-2xl border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm overflow-hidden">
        <div className="p-6 sm:p-8 flex flex-col items-center text-center">
          <div className="relative group">
            <Avatar className="h-24 w-24 sm:h-28 sm:w-28 rounded-full border-4 border-background shadow-lg">
              <AvatarImage src={profileUser?.avatar ? (profileUser.avatar.startsWith("http") ? profileUser.avatar : (API_BASE.replace(/\/$/, "") || "") + profileUser.avatar) : undefined} />
              <AvatarFallback className="bg-primary/20 text-primary text-2xl font-semibold">
                {profileUser?.name?.split(" ").map((n) => n[0]).join("").slice(0, 2) || "U"}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarLoading}
              className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg border-2 border-background hover:bg-primary/90 transition-colors"
              aria-label="Сменить фото"
            >
              <Camera className="w-4 h-4" />
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
          <h2 className="mt-4 text-xl font-bold text-foreground">{profileUser?.name || "Пользователь"}</h2>
          {profileUser?.phone && <p className="text-sm text-muted-foreground mt-0.5">{profileUser.phone}</p>}
          {profileUser?.username && <p className="text-sm text-muted-foreground">@{profileUser.username}</p>}
        </div>
      </div>

      <Tabs defaultValue="profile" className="space-y-4 sm:space-y-6 min-w-0">
        <TabsList className="flex w-full overflow-x-auto gap-0.5 p-1 min-w-0 sm:overflow-visible h-auto flex-nowrap">
          {settingsTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger key={tab.value} value={tab.value} className="flex items-center gap-2 shrink-0 sm:shrink">
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <User className="w-5 h-5 mr-2" />
                Профиль пользователя
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Полное имя</Label>
                  <Input id="name" value={profileUser?.name || ""} readOnly />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username">Имя пользователя</Label>
                  <Input id="username" value={profileUser?.username || ""} readOnly />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={profileUser?.email || ""} readOnly placeholder="Не указан" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Телефон</Label>
                  <Input id="phone" value={profileUser?.phone || ""} readOnly placeholder="Не указан" />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="role">Роль</Label>
                <Input id="role" value={roleLabel(profileUser?.role)} disabled />
              </div>

              <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={() => void refreshProfile(false)}>Обновить данные</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Bell className="w-5 h-5 mr-2" />
                Настройки уведомлений
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="email-notifications">Email уведомления</Label>
                    <p className="text-sm text-gray-600">Получать уведомления по электронной почте</p>
                  </div>
                  <Switch id="email-notifications" defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="system-alerts">Системные предупреждения</Label>
                    <p className="text-sm text-gray-600">Уведомления о проблемах с системой</p>
                  </div>
                  <Switch id="system-alerts" defaultChecked />
                </div>

                {!isPlatformOwner && (
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="stream-notifications">Уведомления о стримах</Label>
                      <p className="text-sm text-gray-600">Уведомления о начале и окончании стримов</p>
                    </div>
                    <Switch id="stream-notifications" defaultChecked />
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="calendar-reminders">Напоминания календаря</Label>
                    <p className="text-sm text-gray-600">Напоминания о предстоящих событиях</p>
                  </div>
                  <Switch id="calendar-reminders" defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="equipment-alerts">Уведомления об оборудовании</Label>
                    <p className="text-sm text-gray-600">Уведомления о статусе оборудования</p>
                  </div>
                  <Switch id="equipment-alerts" />
                </div>
              </div>

              {/* Push Notifications */}
              <div className="border-t pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Label htmlFor="push-notifications">Push-уведомления в браузере</Label>
                      {!isSupported && (
                        <Badge variant="secondary" className="text-xs">Не поддерживается</Badge>
                      )}
                      {isSupported && isSubscribed && (
                        <Badge variant="default" className="text-xs bg-green-500">Включено</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">
                      Получать уведомления даже когда браузер закрыт
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isSupported && (
                      <Button
                        onClick={() => isSubscribed ? unsubscribe() : subscribe()}
                        variant={isSubscribed ? "destructive" : "default"}
                        size="sm"
                      >
                        <Smartphone className="w-4 h-4 mr-2" />
                        {isSubscribed ? "Отключить" : "Включить"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button>Сохранить настройки</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mobile">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Smartphone className="w-5 h-5 mr-2 shrink-0" />
                <span className="min-w-0">Кнопки внизу экрана (телефон)</span>
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                На телефоне основные разделы отображаются внизу, как в Telegram. Выберите до {maxSelect} разделов — они появятся в нижней панели. Кнопка «Ещё» откроет полное меню.
              </p>
            </CardHeader>
            <CardContent className="space-y-4 min-w-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
                {candidates.map((c) => {
                  const checked = bottomNavSelected.includes(c.tabKey);
                  const disabled = !checked && bottomNavSelected.length >= maxSelect;
                  return (
                    <label
                      key={c.tabKey}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                        checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
                        disabled && "opacity-60 cursor-not-allowed",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={(v) => handleBottomNavToggle(c.tabKey, !!v)}
                      />
                      <c.icon className="w-5 h-5 text-muted-foreground shrink-0" />
                      <span className="font-medium">{c.label}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Выбрано: {bottomNavSelected.length} из {maxSelect}. В панели также будет кнопка «Ещё».
              </p>
              <Button onClick={handleSaveBottomNav}>Сохранить</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Shield className="w-5 h-5 mr-2" />
                Безопасность
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current-password">Текущий пароль</Label>
                  <Input id="current-password" type="password" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">Новый пароль</Label>
                  <Input id="new-password" type="password" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Подтвердите новый пароль</Label>
                  <Input id="confirm-password" type="password" />
                </div>
              </div>

              <div className="border-t pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="two-factor">Двухфакторная аутентификация</Label>
                    <p className="text-sm text-gray-600">Дополнительная защита вашего аккаунта</p>
                  </div>
                  <Switch id="two-factor" />
                </div>
              </div>

              <div className="flex justify-end space-x-4">
                <Button variant="outline">Отмена</Button>
                <Button>Обновить пароль</Button>
              </div>

              {profileUser?.role === "admin" && !isPlatformOwner && (
                <div className="border-t pt-6 mt-6 space-y-3">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-5 h-5 text-muted-foreground" />
                    <Label className="text-base font-medium">Доступ к Терминалу сервера</Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Выберите роли, которым разрешён просмотр логов сервера (вкладка «Терминал» в меню).
                  </p>
                  <div className="flex flex-wrap gap-4">
                    {TERMINAL_ROLES.map((r) => (
                      <label key={r.id} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={terminalAllowedRoles.includes(r.id)}
                          onCheckedChange={(v) => handleTerminalRoleToggle(r.id, !!v)}
                        />
                        <span>{r.label}</span>
                      </label>
                    ))}
                  </div>
                  <Button size="sm" onClick={handleSaveTerminalAccess} disabled={terminalSaving}>
                    {terminalSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                    Сохранить доступ к Терминалу
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Palette className="w-5 h-5 mr-2" />
                Внешний вид
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div>
                  <Label className="text-base font-semibold mb-3 block">Выбор темы</Label>
                  <p className="text-sm text-muted-foreground mb-4">
                    Используйте переключатель темы в правом верхнем углу для выбора темы
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className={cn(
                      "p-3 rounded-lg border-2 cursor-pointer transition-all",
                      "bg-gradient-to-br from-white to-gray-50 border-gray-200 hover:border-primary"
                    )}>
                      <Sun className="w-6 h-6 mx-auto mb-2 text-yellow-500" />
                      <p className="text-xs text-center font-medium">Светлая</p>
                    </div>
                    <div className={cn(
                      "p-3 rounded-lg border-2 cursor-pointer transition-all",
                      "bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700 hover:border-primary"
                    )}>
                      <Moon className="w-6 h-6 mx-auto mb-2 text-blue-300" />
                      <p className="text-xs text-center font-medium text-white">Тёмная</p>
                    </div>
                    <div className={cn(
                      "p-3 rounded-lg border-2 cursor-pointer transition-all neon-rainbow",
                      "bg-gradient-to-br from-cyan-900/50 via-purple-900/50 to-pink-900/50 border-cyan-500/50 hover:border-cyan-400"
                    )}>
                      <Sparkles className="w-6 h-6 mx-auto mb-2 text-cyan-400 animate-pulse" />
                      <p className="text-xs text-center font-medium text-cyan-300">Rainbow</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t">
                  <div>
                    <Label htmlFor="compact-mode">Компактный вид</Label>
                    <p className="text-sm text-muted-foreground">Уменьшить отступы и размеры элементов</p>
                  </div>
                  <Switch id="compact-mode" />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="animations">Анимации</Label>
                    <p className="text-sm text-muted-foreground">Включить анимации интерфейса</p>
                  </div>
                  <Switch id="animations" defaultChecked />
                </div>
              </div>

              <div className="flex justify-end">
                <Button>Применить настройки</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="language">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Languages className="w-5 h-5 mr-2" />
                Язык интерфейса
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="language">Выберите язык</Label>
                  <Select value={language} onValueChange={(value) => setLanguage(value as 'ru' | 'en')}>
                    <SelectTrigger id="language">
                      <SelectValue placeholder="Выберите язык" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ru">Русский</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Изменения применятся сразу после выбора
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations">
          <div className="space-y-6">
            <TelegramAuth onSuccess={(telegramUser) => {
              console.log('Telegram user connected:', telegramUser);
            }} />
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Globe className="w-5 h-5 mr-2" />
                  Интеграции с платформами
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Подключение аккаунтов и API для уведомлений и статистики. Стриминг и ключи эфира настраиваются в разделе «Стриминг».
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-lg border border-border p-4 space-y-2">
                  <h3 className="font-semibold flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400 text-sm font-bold">YT</span>
                    YouTube
                  </h3>
                  <p className="text-sm text-muted-foreground">API для статистики канала и уведомлений</p>
                  <Label htmlFor="youtube-key" className="text-xs">API Key (опционально)</Label>
                  <Input id="youtube-key" placeholder="Для статистики просмотров" className="max-w-md" />
                </div>
                <div className="rounded-lg border border-border p-4 space-y-2">
                  <h3 className="font-semibold flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 text-sm font-bold">VK</span>
                    ВКонтакте
                  </h3>
                  <p className="text-sm text-muted-foreground">Доступ для уведомлений и статистики</p>
                  <Label htmlFor="vk-token" className="text-xs">Access Token (опционально)</Label>
                  <Input id="vk-token" placeholder="Для доступа к API" className="max-w-md" />
                </div>
                <div className="rounded-lg border border-border p-4 space-y-2">
                  <h3 className="font-semibold flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 text-sm font-bold">TW</span>
                    Twitch
                  </h3>
                  <p className="text-sm text-muted-foreground">Подключение для уведомлений</p>
                  <Label htmlFor="twitch-token" className="text-xs">Client ID (опционально)</Label>
                  <Input id="twitch-token" placeholder="Для доступа к API" className="max-w-md" />
                </div>
                <YouGileIntegration />
                <div className="flex justify-end">
                  <Button>Сохранить</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
