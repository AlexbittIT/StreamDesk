import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { COMPANY_NEED_OPTIONS } from "@/lib/company-workspace";
import { Building2, CheckCircle2, Copy, Link2, Loader2, Trash2, UserCircle2, Users } from "lucide-react";

type OnboardingState = {
  user: {
    id: string;
    name: string;
    onboardingCompleted: boolean;
    workspaceMode: string;
    permissions?: string[];
  };
  isPlatformAdmin: boolean;
  activeCompanies: Array<{
    company: { id: string; name: string; status: string };
    membership: { id: string; role: string; status: string };
  }>;
  pendingCompanies: Array<{
    company: { id: string; name: string; status: string };
    membership: { id: string; role: string; status: string };
  }>;
};

type CompaniesMe = {
  companies: Array<{
    company: { id: string; name: string; status: string };
    membership: { id: string; role: string; status: string };
    members: Array<{ id: string; status: string }>;
    activeInvite?: {
      id: string;
      token: string;
      url: string;
      expiresAt?: string | null;
      status: string;
    } | null;
  }>;
  pendingApprovals: Array<{
    id: string;
    companyId: string;
    userId: string;
    user?: { id: string; name: string; email?: string };
    company?: { id: string; name: string };
  }>;
};

type InviteResolve = {
  invite: {
    companyId: string;
    role?: string;
    note?: string | null;
  };
  company?: {
    id: string;
    name: string;
    description?: string | null;
  };
  valid: boolean;
  expired: boolean;
};

function normalizeInviteToken(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  if (raw.includes("invite=")) {
    try {
      const url = new URL(raw);
      return url.searchParams.get("invite") || raw;
    } catch {
      const match = raw.match(/invite=([^&]+)/);
      return match?.[1] || raw;
    }
  }
  return raw;
}

export default function Onboarding() {
  const { toast } = useToast();
  const search = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const initialInvite = search?.get("invite") || "";
  const [companyName, setCompanyName] = useState("");
  const [companyDescription, setCompanyDescription] = useState("");
  const [companyNeeds, setCompanyNeeds] = useState<string[]>(["projects", "tasks"]);
  const [inviteToken, setInviteToken] = useState(initialInvite);
  const [inviteLinks, setInviteLinks] = useState<Record<string, string>>({});

  const { data: state, isLoading } = useQuery<OnboardingState>({
    queryKey: ["/api/auth/onboarding-state"],
  });

  const { data: companyData } = useQuery<CompaniesMe>({
    queryKey: ["/api/companies/me"],
    enabled: !!state?.user?.id,
  });

  const normalizedInviteToken = normalizeInviteToken(inviteToken);
  const { data: inviteDetails, isLoading: inviteDetailsLoading } = useQuery<InviteResolve | null>({
    queryKey: ["/api/company-invites/resolve", normalizedInviteToken],
    queryFn: async () => {
      if (!normalizedInviteToken) return null;
      const res = await apiRequest("GET", `/api/company-invites/resolve/${encodeURIComponent(normalizedInviteToken)}`);
      return res.json();
    },
    enabled: normalizedInviteToken.length > 0,
    retry: false,
  });

  const personalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/onboarding/personal", {});
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data?.user) {
        localStorage.setItem("streamstudio_user", JSON.stringify(data.user));
      }
      queryClient.invalidateQueries({ queryKey: ["/api/auth/onboarding-state"] });
      toast({ title: "Готово", description: "Личное рабочее пространство включено." });
      window.location.href = "/";
    },
  });

  const companyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/onboarding/company", {
        name: companyName,
        description: companyDescription,
        needs: companyNeeds,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data?.user) {
        localStorage.setItem("streamstudio_user", JSON.stringify(data.user));
      }
      queryClient.invalidateQueries({ queryKey: ["/api/auth/onboarding-state"] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies/me"] });
      toast({ title: "Компания создана", description: "Теперь можно приглашать сотрудников." });
      window.location.href = "/onboarding";
    },
    onError: (error: any) => {
      toast({ title: "Ошибка", description: error.message || "Не удалось создать компанию", variant: "destructive" });
    },
  });

  const joinMutation = useMutation({
    mutationFn: async () => {
      const normalizedToken = normalizeInviteToken(inviteToken);
      const res = await apiRequest("POST", "/api/onboarding/join", { token: normalizedToken });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data?.user) {
        localStorage.setItem("streamstudio_user", JSON.stringify(data.user));
      }
      queryClient.invalidateQueries({ queryKey: ["/api/auth/onboarding-state"] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies/me"] });
      toast({ title: "Заявка отправлена", description: data.message || "Ожидайте подтверждения владельца компании." });
    },
    onError: (error: any) => {
      toast({ title: "Ошибка", description: error.message || "Не удалось отправить заявку", variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ companyId, memberId }: { companyId: string; memberId: string }) => {
      const res = await apiRequest("POST", `/api/company-members/${memberId}/approve`, { companyId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies/me"] });
      toast({ title: "Подтверждено", description: "Сотрудник получил доступ к компании." });
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async (companyId: string) => {
      const res = await apiRequest("POST", "/api/company-invites", { companyId });
      return res.json();
    },
    onSuccess: (data: any, companyId: string) => {
      if (data?.url) {
        setInviteLinks((prev) => ({ ...prev, [companyId]: data.url }));
      }
      queryClient.invalidateQueries({ queryKey: ["/api/companies/me"] });
      toast({ title: "Ссылка активирована", description: "Она будет доступна 24 часа." });
    },
  });

  const deleteCompanyMutation = useMutation({
    mutationFn: async (companyId: string) => {
      const res = await apiRequest("DELETE", `/api/companies/${companyId}`);
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data?.user) {
        localStorage.setItem("streamstudio_user", JSON.stringify(data.user));
      }
      queryClient.invalidateQueries({ queryKey: ["/api/auth/onboarding-state"] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies/me"] });
      toast({ title: "Компания удалена", description: "Можно выбрать другой сценарий работы." });
      window.location.href = "/onboarding";
    },
    onError: (error: any) => {
      toast({ title: "Ошибка", description: error.message || "Не удалось удалить компанию", variant: "destructive" });
    },
  });

  const canContinue = useMemo(() => {
    if (!state) return false;
    return state.isPlatformAdmin || state.activeCompanies.length > 0 || state.user.workspaceMode === "personal";
  }, [state]);

  const copyInviteLink = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: "Скопировано", description: "Ссылка приглашения скопирована." });
    } catch {
      toast({ title: "Не удалось скопировать", description: value, variant: "destructive" });
    }
  };

  const toggleNeed = (needId: string, checked: boolean) => {
    setCompanyNeeds((prev) => {
      if (checked) {
        return prev.includes(needId) ? prev : [...prev, needId];
      }
      return prev.filter((item) => item !== needId);
    });
  };

  const declineInvite = () => {
    setInviteToken("");
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("invite");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
    toast({ title: "Приглашение отклонено", description: "Вы можете выбрать личное пространство или создать свою компанию." });
  };

  if (isLoading || !state) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <div className="space-y-2">
        <Badge variant="secondary">Workspace Setup</Badge>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Настройка рабочего пространства
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Выберите, как будете работать в StreamDesk: лично, внутри своей компании или по приглашению в чужую.
        </p>
      </div>

      {state.pendingCompanies.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-200">
              <CheckCircle2 className="h-5 w-5" />
              Заявка отправлена
            </CardTitle>
            <CardDescription>
              Владелец компании должен подтвердить доступ. Пока это не произошло, вы можете следить за статусом здесь.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {state.pendingCompanies.map((item) => (
              <div key={item.membership.id} className="rounded-xl border border-border/60 bg-background/70 px-4 py-3">
                <div className="font-medium">{item.company.name}</div>
                <div className="text-sm text-muted-foreground">Статус: ожидает подтверждения</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/60 bg-card/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCircle2 className="h-5 w-5" />
              Для себя
            </CardTitle>
            <CardDescription>
              Личное пространство без компании. Подходит для своих заметок, проектов и задач.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={() => personalMutation.mutate()}
              disabled={personalMutation.isPending}
            >
              {personalMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Использовать лично
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Создать компанию
            </CardTitle>
            <CardDescription>
              Ваша команда, сотрудники, доски, роли и дальнейшие интеграции будут жить внутри компании.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="company-name">Название</Label>
              <Input id="company-name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Например, OTIS Media" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company-description">Описание</Label>
              <Textarea id="company-description" value={companyDescription} onChange={(e) => setCompanyDescription(e.target.value)} placeholder="Чем занимается команда и как будете использовать StreamDesk" rows={4} />
            </div>
            <div className="space-y-2">
              <Label>Что пригодится сразу</Label>
              <div className="grid gap-2 rounded-2xl border border-border/60 bg-background/60 p-3">
                {COMPANY_NEED_OPTIONS.map((need) => (
                  <label
                    key={need.id}
                    className="flex items-start gap-3 rounded-xl border border-transparent px-2 py-2 transition-colors hover:border-primary/20 hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={companyNeeds.includes(need.id)}
                      onCheckedChange={(checked) => toggleNeed(need.id, Boolean(checked))}
                      className="mt-0.5"
                    />
                    <div className="space-y-1">
                      <div className="text-sm font-medium">{need.label}</div>
                      <div className="text-xs text-muted-foreground">{need.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <Button
              className="w-full"
              onClick={() => companyMutation.mutate()}
              disabled={companyMutation.isPending || companyName.trim().length === 0}
            >
              {companyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Создать компанию
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Вступить по ссылке
            </CardTitle>
            <CardDescription>
              Вставьте токен или целую ссылку приглашения. После этого владелец компании подтвердит вход.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {inviteDetailsLoading && normalizedInviteToken && (
              <div className="rounded-xl border border-border/60 bg-background/60 p-3 text-sm text-muted-foreground">
                Проверяю приглашение компании...
              </div>
            )}
            {inviteDetails?.company && (
              <div className={`rounded-2xl border p-4 ${inviteDetails.valid ? "border-primary/30 bg-primary/5" : "border-amber-500/30 bg-amber-500/5"}`}>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Приглашение в компанию</div>
                  <div className="text-base font-semibold">{inviteDetails.company.name}</div>
                  {inviteDetails.company.description && (
                    <div className="text-sm text-muted-foreground">{inviteDetails.company.description}</div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Badge variant="outline">Роль: {inviteDetails.invite.role || "member"}</Badge>
                    {inviteDetails.expired && <Badge variant="destructive">Срок истёк</Badge>}
                    {!inviteDetails.valid && !inviteDetails.expired && <Badge variant="secondary">Недоступно</Badge>}
                  </div>
                  {inviteDetails.invite.note && (
                    <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-sm text-muted-foreground">
                      {inviteDetails.invite.note}
                    </div>
                  )}
                </div>

                {inviteDetails.valid && (
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <Button className="sm:flex-1" onClick={() => joinMutation.mutate()} disabled={joinMutation.isPending}>
                      {joinMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Принять приглашение
                    </Button>
                    <Button className="sm:flex-1" variant="outline" onClick={declineInvite} disabled={joinMutation.isPending}>
                      Отказаться
                    </Button>
                  </div>
                )}
              </div>
            )}
            <Input
              value={inviteToken}
              onChange={(e) => setInviteToken(e.target.value)}
              placeholder="invite-token или ссылка"
            />
            <Button
              className="w-full"
              variant="outline"
              onClick={() => joinMutation.mutate()}
              disabled={joinMutation.isPending || inviteToken.trim().length === 0}
            >
              {joinMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Отправить заявку
            </Button>
          </CardContent>
        </Card>
      </div>

      {companyData?.companies?.length ? (
        <Card className="border-border/60 bg-card/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Мои компании
            </CardTitle>
            <CardDescription>
              Здесь можно быстро увидеть активные компании, получить ссылку-приглашение и подтвердить сотрудников.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {companyData.companies.map((item) => (
              <div key={item.company.id} className="rounded-2xl border border-border/60 bg-background/70 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-medium">{item.company.name}</div>
                    <div className="text-sm text-muted-foreground">
                      Роль: {item.membership.role} • Сотрудников: {item.members.length}
                    </div>
                    {item.activeInvite?.url && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Активная ссылка до {item.activeInvite.expiresAt ? new Date(item.activeInvite.expiresAt).toLocaleString("ru-RU") : "отзыва"}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(item.activeInvite?.url || inviteLinks[item.company.id]) && (
                      <Button size="sm" onClick={() => copyInviteLink(inviteLinks[item.company.id] || item.activeInvite!.url)}>
                        <Copy className="mr-2 h-4 w-4" />
                        Скопировать
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => inviteMutation.mutate(item.company.id)}
                      disabled={inviteMutation.isPending}
                    >
                      <Link2 className="mr-2 h-4 w-4" />
                      {item.activeInvite?.url ? "Обновить на 24 часа" : "Активировать ссылку"}
                    </Button>
                    {item.membership.role === "owner" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-500/30 text-red-300 hover:bg-red-500/10 hover:text-red-200"
                        onClick={() => {
                          if (confirm(`Удалить компанию "${item.company.name}"?`)) {
                            deleteCompanyMutation.mutate(item.company.id);
                          }
                        }}
                        disabled={deleteCompanyMutation.isPending}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Удалить
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {companyData?.pendingApprovals?.length ? (
        <Card className="border-border/60 bg-card/90">
          <CardHeader>
            <CardTitle>Ожидают подтверждения</CardTitle>
            <CardDescription>
              Новые сотрудники попадут в компанию только после вашего подтверждения.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {companyData.pendingApprovals.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium">{item.user?.name || "Новый сотрудник"}</div>
                  <div className="text-sm text-muted-foreground">
                    {item.company?.name || "Компания"}{item.user?.email ? ` • ${item.user.email}` : ""}
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => approveMutation.mutate({ companyId: item.companyId, memberId: item.id })}
                  disabled={approveMutation.isPending}
                >
                  Подтвердить
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {canContinue && (
        <div className="flex justify-end">
          <Button size="lg" onClick={() => { window.location.href = state.isPlatformAdmin ? "/platform-admin" : "/"; }}>
            Продолжить в рабочее пространство
          </Button>
        </div>
      )}
    </div>
  );
}
