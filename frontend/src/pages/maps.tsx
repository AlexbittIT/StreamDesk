import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapCanvas, type MapCanvasHandle } from "@/components/maps/map-canvas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  addZoneComment,
  addZonePhoto,
  assignZone,
  assigneeInitials,
  canEditMaps,
  changeZoneStatus,
  countZonesByStatus,
  createMap,
  createZone,
  deleteMap,
  deleteZone,
  deleteZoneComment,
  deleteZonePhoto,
  filterMaps,
  getAllowedNextStatuses,
  getMap,
  getZoneStatusHistory,
  listMaps,
  MAP_STATUS_META,
  MAPS_FILTER_META,
  mapImageUrl,
  mapSummaryLine,
  plural,
  removeMapPlan,
  saveMapPlanRect,
  sortZonesForPanel,
  summarizeMaps,
  unassignedCount,
  updateMap,
  updateZone,
  uploadMapPlan,
  uploadZonePhotoFile,
  zonesWord,
  zoneStatusCount,
  type MapAssignee,
  type MapsFilter,
  type MapWithZones,
  type MapZone,
  type PlanRect,
  type SiteMap,
  type ZoneComment,
  type ZonePoint,
  type ZoneStatus,
  type ZoneStatusHistoryEntry,
} from "@/lib/maps-api";

/** Пользователь для выпадающего списка «Ответственный» (ответ /api/users). */
type ZoneUser = { id: string; name?: string; username?: string; role?: string };
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Edit,
  Loader2,
  ImagePlus,
  Map,
  MessageSquare,
  MoreVertical,
  Plus,
  Search,
  Send,
  Trash2,
  Upload,
  X,
} from "lucide-react";

function getCurrentUser() {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem("streamstudio_user") || "{}");
  } catch {
    return null;
  }
}

function CreateMapDialog({
  open,
  onOpenChange,
  onSubmit,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; file: File | null }) => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const submit = () => {
    onSubmit({ name: name.trim(), file });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Создать площадку</DialogTitle>
          <DialogDescription>Название обязательно, план можно добавить сразу или позже.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="map-name">Название</Label>
            <Input id="map-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Главный зал" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="map-plan">План PNG/JPG</Label>
            <Input
              id="map-plan"
              type="file"
              accept="image/png,image/jpeg"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="button" onClick={submit} disabled={pending || !name.trim()}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenameMapDialog({
  map,
  open,
  onOpenChange,
  onSubmit,
  pending,
}: {
  map: SiteMap | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => void;
  pending: boolean;
}) {
  const [name, setName] = useState(map?.name || "");

  useEffect(() => {
    if (open && map) setName(map.name);
  }, [open, map?.id]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next && map) setName(map.name);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Переименовать площадку</DialogTitle>
          <DialogDescription>Новое название будет видно всем пользователям в области видимости.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="rename-map">Название</Label>
          <Input id="rename-map" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="button" onClick={() => onSubmit(name.trim())} disabled={pending || !name.trim()}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** «Обновлено сегодня, 10:10» для свежих правок и «Обновлено 12.07» для остальных. */
function formatUpdated(value?: string): string {
  if (!value) return "Дата неизвестна";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Дата неизвестна";
  const isToday = date.toDateString() === new Date().toDateString();
  if (isToday) {
    return `Обновлено сегодня, ${date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return `Обновлено ${date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}`;
}

/**
 * Плитка-показатель над списком. Если у показателя есть парный быстрый фильтр — плитка
 * кликабельна и применяет его; иначе это просто цифра.
 */
function StatTile({
  value,
  label,
  accentClassName,
  active,
  onClick,
}: {
  value: number;
  label: string;
  accentClassName: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className={cn("h-9 w-1 shrink-0 rounded-full", accentClassName)} />
      <span className="min-w-0">
        <span className="block text-xl font-bold leading-none sm:text-2xl">{value}</span>
        <span className="mt-1 block truncate text-xs text-muted-foreground">{label}</span>
      </span>
    </>
  );
  const className = cn(
    "flex items-center gap-3 rounded-lg border bg-card p-3 text-left sm:p-4",
    onClick && "transition-colors hover:bg-accent/50",
    active && "border-primary ring-1 ring-primary",
  );

  if (!onClick) {
    return <div className={className}>{body}</div>;
  }
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={className}>
      {body}
    </button>
  );
}

/** Сколько аватаров показываем до сворачивания в «+N» — ответственных может быть много. */
const MAX_VISIBLE_ASSIGNEES = 3;

function AssigneeStack({ assignees }: { assignees: MapAssignee[] }) {
  if (assignees.length === 0) {
    return <span className="truncate text-xs italic text-muted-foreground">не назначены</span>;
  }
  const visible = assignees.slice(0, MAX_VISIBLE_ASSIGNEES);
  const hidden = assignees.slice(MAX_VISIBLE_ASSIGNEES);
  return (
    <div className="flex items-center -space-x-2">
      {visible.map((assignee) => (
        <Tooltip key={assignee.id}>
          <TooltipTrigger asChild>
            <Avatar className="h-7 w-7 border-2 border-background">
              {assignee.avatar && <AvatarImage src={mapImageUrl(assignee.avatar)} alt="" />}
              <AvatarFallback className="text-[10px] font-medium">{assigneeInitials(assignee.name)}</AvatarFallback>
            </Avatar>
          </TooltipTrigger>
          <TooltipContent>{assignee.name || "Без имени"}</TooltipContent>
        </Tooltip>
      ))}
      {hidden.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-medium">
              +{hidden.length}
            </span>
          </TooltipTrigger>
          <TooltipContent>{hidden.map((assignee) => assignee.name || "Без имени").join(", ")}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

/** Полоса готовности: доли зон по статусам. Нулевые статусы сегмента не занимают. */
function MapStatusBar({ map }: { map: SiteMap }) {
  const segments = (Object.keys(MAP_STATUS_META) as ZoneStatus[])
    .map((status) => ({ status, count: zoneStatusCount(map, status) }))
    .filter((segment) => segment.count > 0);
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);
  if (total === 0) {
    return <div className="h-1.5 w-full rounded-full bg-muted" />;
  }
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
      {segments.map((segment) => (
        <Tooltip key={segment.status}>
          <TooltipTrigger asChild>
            <div
              className={cn("h-full", MAP_STATUS_META[segment.status].className)}
              style={{ width: `${(segment.count / total) * 100}%` }}
            />
          </TooltipTrigger>
          <TooltipContent>
            {MAP_STATUS_META[segment.status].label}: {segment.count}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

/**
 * Карточка площадки: готовность зон, проблемы и ответственные видны до перехода в редактор.
 * Переименование и удаление — в меню «⋯», чтобы не путать их с основным действием «Открыть».
 */
function MapCard({
  map,
  canManage,
  onOpen,
  onRename,
  onDelete,
}: {
  map: SiteMap;
  canManage: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const zones = map.zonesCount || 0;
  const problems = zoneStatusCount(map, "problem");
  const unassigned = unassignedCount(map);

  return (
    <Card className="flex flex-col overflow-hidden rounded-lg transition-shadow hover:shadow-md">
      <div className="relative">
        <button type="button" onClick={onOpen} className="block w-full" aria-label={`Открыть площадку ${map.name}`}>
          <div className="flex h-36 items-center justify-center border-b bg-muted/40 text-muted-foreground">
            {map.imageUrl ? (
              <img src={mapImageUrl(map.imageUrl)} alt="" className="h-full w-full object-cover" draggable={false} />
            ) : (
              <div className="flex flex-col items-center gap-1">
                <Map className="h-8 w-8" />
                <span className="text-xs">Плана нет</span>
              </div>
            )}
          </div>
        </button>
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute right-2 top-2 h-8 w-8 shadow-sm"
                aria-label="Действия с площадкой"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onRename} className="gap-2">
                <Edit className="h-4 w-4" />
                Переименовать
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onDelete} className="gap-2 text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4" />
                Удалить
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <MapStatusBar map={map} />

        <div className="min-w-0">
          <h3 className="truncate font-semibold" title={map.name}>
            {map.name}
          </h3>
          <p className="truncate text-xs text-muted-foreground">
            {map.imageUrl ? formatUpdated(map.updatedAt || map.createdAt) : "План не загружен"}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="rounded-md font-normal">
            {zones} {zonesWord(zones)}
          </Badge>
          <Badge
            variant="outline"
            className={cn(
              "rounded-md font-normal",
              problems > 0
                ? "border-red-500/50 bg-red-500/10 font-medium text-red-600 dark:text-red-400"
                : "text-muted-foreground",
            )}
          >
            {problems} {plural(problems, "проблема", "проблемы", "проблем")}
          </Badge>
          <Badge
            variant="outline"
            className={cn(
              "rounded-md font-normal",
              unassigned > 0
                ? "border-amber-500/50 bg-amber-500/10 font-medium text-amber-600 dark:text-amber-400"
                : "text-muted-foreground",
            )}
          >
            {unassigned} без отв.
          </Badge>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-xs text-muted-foreground">Ответственные</span>
            <AssigneeStack assignees={map.assignees || []} />
          </div>
          <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={onOpen}>
            Открыть
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MapsListPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const currentUser = getCurrentUser();
  const canManage = canEditMaps(currentUser);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<MapsFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [renameMap, setRenameMap] = useState<SiteMap | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SiteMap | null>(null);

  const { data: maps = [], isLoading, isError, error, refetch } = useQuery<SiteMap[]>({
    queryKey: ["/api/maps"],
    queryFn: listMaps,
  });

  const visibleMaps = useMemo(() => filterMaps(maps, search, filter), [maps, search, filter]);
  // Показатели считаем по всем картам, а не по выборке: иначе плитки описывают сами себя.
  const overview = useMemo(() => summarizeMaps(maps), [maps]);
  const isFiltered = Boolean(search.trim()) || filter !== "all";

  /** Повторный клик по активной плитке снимает фильтр — иначе из него не выйти одним движением. */
  const toggleFilter = (next: MapsFilter) => setFilter((current) => (current === next ? "all" : next));

  const createMutation = useMutation({
    mutationFn: async ({ name, file }: { name: string; file: File | null }) => {
      if (!name) throw new Error("Введите название площадки");
      const created = await createMap({ name });
      if (file) return uploadMapPlan(created.id, file);
      return created;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["/api/maps"] });
      setCreateOpen(false);
      toast({ title: "Площадка создана" });
      setLocation(`/maps/${created.id}`);
    },
    onError: (e: any) => {
      toast({ title: "Ошибка", description: e?.message || "Не удалось создать площадку", variant: "destructive" });
    },
  });

  const renameMutation = useMutation({
    mutationFn: async ({ mapId, name }: { mapId: string; name: string }) => updateMap(mapId, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maps"] });
      setRenameMap(null);
      toast({ title: "Название обновлено" });
    },
    onError: (e: any) => {
      toast({ title: "Ошибка", description: e?.message || "Не удалось переименовать площадку", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (mapId: string) => deleteMap(mapId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maps"] });
      setDeleteTarget(null);
      toast({ title: "Площадка удалена" });
    },
    onError: (e: any) => {
      toast({ title: "Ошибка", description: e?.message || "Не удалось удалить площадку", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-3 p-1 sm:p-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <Map className="h-5 w-5 text-primary" />
            Площадки
          </h1>
          <p className="text-sm text-muted-foreground">Планы площадок и зоны готовности.</p>
        </div>
        {canManage && (
          <Button type="button" onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Создать площадку
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative w-full lg:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск по названию, зоне или ответственному"
            className="pl-9"
          />
        </div>
        {/* Чипы могут не влезть на узком экране — прокручиваем их горизонтально, а не переносим. */}
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:pb-0">
          {(Object.keys(MAPS_FILTER_META) as MapsFilter[]).map((key) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={filter === key ? "default" : "outline"}
              className="shrink-0 rounded-full"
              onClick={() => setFilter(key)}
            >
              {MAPS_FILTER_META[key].label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3">
        <StatTile
          value={overview.maps}
          label={plural(overview.maps, "карта", "карты", "карт")}
          accentClassName="bg-primary"
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <StatTile value={overview.inProgress} label="зоны в работе" accentClassName="bg-yellow-500" />
        <StatTile
          value={overview.problems}
          label={plural(overview.problems, "проблема", "проблемы", "проблем")}
          accentClassName="bg-red-500"
          active={filter === "problems"}
          onClick={() => toggleFilter("problems")}
        />
        <StatTile
          value={overview.unassigned}
          label="без ответственного"
          accentClassName="bg-blue-500"
          active={filter === "unassigned"}
          onClick={() => toggleFilter("unassigned")}
        />
      </div>

      {isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Не удалось загрузить площадки</AlertTitle>
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>{(error as any)?.message || "Проверьте подключение к серверу."}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
              Повторить
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="rounded-lg">
              <CardHeader>
                <Skeleton className="h-5 w-2/3" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : visibleMaps.length === 0 ? (
        <Card className="rounded-lg">
          <CardContent className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-center">
            <Map className="h-12 w-12 text-primary/60" />
            <div>
              <p className="font-medium">{isFiltered ? "Ничего не найдено" : "Площадок пока нет"}</p>
              <p className="text-sm text-muted-foreground">
                {isFiltered
                  ? "Измените запрос или сбросьте фильтр."
                  : "Создайте первую площадку и загрузите план."}
              </p>
            </div>
            {isFiltered ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                }}
              >
                Сбросить фильтры
              </Button>
            ) : (
              canManage && (
                <Button type="button" onClick={() => setCreateOpen(true)} className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Создать площадку
                </Button>
              )
            )}
          </CardContent>
        </Card>
      ) : (
        <TooltipProvider delayDuration={200}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleMaps.map((map) => (
              <MapCard
                key={map.id}
                map={map}
                canManage={canManage}
                onOpen={() => setLocation(`/maps/${map.id}`)}
                onRename={() => setRenameMap(map)}
                onDelete={() => setDeleteTarget(map)}
              />
            ))}
          </div>
        </TooltipProvider>
      )}

      <CreateMapDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        pending={createMutation.isPending}
        onSubmit={(data) => createMutation.mutate(data)}
      />

      <RenameMapDialog
        map={renameMap}
        open={Boolean(renameMap)}
        onOpenChange={(open) => !open && setRenameMap(null)}
        pending={renameMutation.isPending}
        onSubmit={(name) => renameMap && renameMutation.mutate({ mapId: renameMap.id, name })}
      />

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить площадку?</AlertDialogTitle>
            <AlertDialogDescription>
              Площадка «{deleteTarget?.name}» будет удалена вместе со всеми зонами.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MapLegend({ map }: { map: MapWithZones }) {
  const counts = (map.zones || []).reduce<Record<string, number>>((acc, zone) => {
    acc[zone.status] = (acc[zone.status] || 0) + 1;
    return acc;
  }, {});
  return (
    <div className="flex flex-wrap gap-1.5">
      {(Object.keys(MAP_STATUS_META) as ZoneStatus[]).map((status) => {
        const isProblem = status === "problem";
        const count = counts[status] || 0;
        return (
          <Badge
            key={status}
            variant="outline"
            className={cn(
              "gap-1.5 rounded-md bg-background",
              isProblem &&
                "border-red-500 bg-red-500/10 font-semibold text-red-600 ring-1 ring-red-500/50 dark:text-red-400",
              isProblem && count > 0 && "animate-pulse",
            )}
          >
            {isProblem ? (
              <AlertTriangle className="h-3 w-3 text-red-500" />
            ) : (
              <span className={cn("h-2.5 w-2.5 rounded-full", MAP_STATUS_META[status].className)} />
            )}
            {MAP_STATUS_META[status].label}
            <span className={cn("text-muted-foreground", isProblem && count > 0 && "text-red-600 dark:text-red-400")}>
              {count}
            </span>
          </Badge>
        );
      })}
    </div>
  );
}

/** Отображаемое имя ответственного по его id. */
function assigneeLabel(users: ZoneUser[], assigneeId?: string | null): string {
  if (!assigneeId) return "Не назначен";
  const user = users.find((candidate) => candidate.id === assigneeId);
  return user?.name || user?.username || assigneeId;
}

const UNASSIGNED = "__none__";

function formatDateTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Бейдж версии зоны — по клику разворачивает инлайн-историю смен статуса (кто/когда/из→в). */
function ZoneHistory({ mapId, zone, users }: { mapId: string; zone: MapZone; users: ZoneUser[] }) {
  const [open, setOpen] = useState(false);
  const { data: history = [], isLoading } = useQuery<ZoneStatusHistoryEntry[]>({
    queryKey: ["/api/maps", mapId, "zones", zone.id, "status-history"],
    queryFn: () => getZoneStatusHistory(mapId, zone.id),
    enabled: open,
  });
  const authorName = (id?: string | null) => {
    if (!id) return "Система";
    const user = users.find((candidate) => candidate.id === id);
    return user?.name || user?.username || id;
  };
  return (
    <>
      <button type="button" onClick={() => setOpen((value) => !value)} title="История статусов">
        <Badge variant="outline" className={cn("cursor-pointer rounded-md hover:bg-muted", open && "bg-muted")}>
          v{zone.version}
        </Badge>
      </button>
      {open && (
        <div className="mt-1 w-full basis-full rounded-md border p-2">
          <div className="mb-2 text-sm font-medium">История статусов</div>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Изменений статуса ещё не было.</p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {[...history].reverse().map((entry) => (
                <li key={entry.id} className="rounded-md border bg-background p-2 text-sm">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="flex items-center gap-1">
                      <span className={cn("h-2 w-2 rounded-full", MAP_STATUS_META[entry.fromStatus]?.className)} />
                      {MAP_STATUS_META[entry.fromStatus]?.label || entry.fromStatus}
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span className="flex items-center gap-1">
                      <span className={cn("h-2 w-2 rounded-full", MAP_STATUS_META[entry.toStatus]?.className)} />
                      {MAP_STATUS_META[entry.toStatus]?.label || entry.toStatus}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {authorName(entry.changedBy)} · {formatDateTime(entry.changedAt)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

/** Комментарии и фото зоны: доступны всем, кто видит зону; удаление ограничено правами. */
function ZoneMaterials({
  zone,
  users,
  currentUserId,
  canManage,
  commentPending,
  photoPending,
  onAddComment,
  onDeleteComment,
  onAddPhotos,
  onDeletePhoto,
}: {
  zone: MapZone;
  users: ZoneUser[];
  currentUserId?: string;
  canManage: boolean;
  commentPending?: boolean;
  photoPending?: boolean;
  onAddComment: (zone: MapZone, text: string) => void;
  onDeleteComment: (zone: MapZone, commentId: string) => void;
  onAddPhotos: (zone: MapZone, files: File[]) => void;
  onDeletePhoto: (zone: MapZone, url: string) => void;
}) {
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const comments = zone.comments || [];
  const photos = zone.photos || [];

  const authorName = (comment: ZoneComment) => {
    if (comment.authorName) return comment.authorName;
    const user = users.find((candidate) => candidate.id === comment.authorId);
    return user?.name || user?.username || "Аноним";
  };
  const canDeleteComment = (comment: ZoneComment) =>
    canManage || (!!currentUserId && comment.authorId === currentUserId);

  const submitComment = () => {
    const value = text.trim();
    if (!value) return;
    onAddComment(zone, value);
    setText("");
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <ImagePlus className="h-4 w-4" />
          Фото ({photos.length})
        </Label>
        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5">
            {photos.map((url) => (
              <div key={url} className="group relative">
                <a href={mapImageUrl(url)} target="_blank" rel="noreferrer">
                  <img src={mapImageUrl(url)} alt="" className="h-20 w-full rounded-md border object-cover" />
                </a>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => onDeletePhoto(zone, url)}
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="Удалить фото"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files || []);
            if (files.length) onAddPhotos(zone, files);
            if (fileRef.current) fileRef.current.value = "";
          }}
        />
        <Button type="button" variant="outline" size="sm" className="w-full gap-1.5" disabled={photoPending} onClick={() => fileRef.current?.click()}>
          {photoPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          {photoPending ? "Загрузка…" : "Добавить фото"}
        </Button>
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <MessageSquare className="h-4 w-4" />
          Комментарии ({comments.length})
        </Label>
        <div className="space-y-2">
          {comments.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">Комментариев пока нет</p>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="rounded-md border bg-muted/30 p-2 text-sm">
                <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate font-medium text-foreground">{authorName(comment)}</span>
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    {formatDateTime(comment.createdAt)}
                    {canDeleteComment(comment) && (
                      <button
                        type="button"
                        onClick={() => onDeleteComment(zone, comment.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Удалить комментарий"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                </div>
                <p className="whitespace-pre-wrap break-words">{comment.text}</p>
              </div>
            ))
          )}
        </div>
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={2}
          placeholder="Написать комментарий…"
          className="resize-none"
        />
        <Button type="button" size="sm" className="gap-1.5" disabled={commentPending || !text.trim()} onClick={submitComment}>
          {commentPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Отправить
        </Button>
      </div>
    </div>
  );
}

function ZonePanel({
  map,
  zone,
  open,
  canManage,
  users,
  currentUserId,
  onOpenChange,
  onRename,
  onDelete,
  onStatusChange,
  onAssign,
  onAddComment,
  onDeleteComment,
  onAddPhotos,
  onDeletePhoto,
  pending,
  commentPending,
  photoPending,
}: {
  map: MapWithZones;
  zone: MapZone | null;
  open: boolean;
  canManage: boolean;
  users: ZoneUser[];
  currentUserId?: string;
  onOpenChange: (open: boolean) => void;
  onRename: (zone: MapZone, name: string) => void;
  onDelete: (zone: MapZone) => void;
  onStatusChange: (zone: MapZone, status: ZoneStatus) => void;
  onAssign: (zone: MapZone, assigneeId: string | null) => void;
  onAddComment: (zone: MapZone, text: string) => void;
  onDeleteComment: (zone: MapZone, commentId: string) => void;
  onAddPhotos: (zone: MapZone, files: File[]) => void;
  onDeletePhoto: (zone: MapZone, url: string) => void;
  pending?: boolean;
  commentPending?: boolean;
  photoPending?: boolean;
}) {
  const [name, setName] = useState(zone?.name || "");
  // Сбрасываем поле переименования при переключении на другую зону (панель не перемонтируется).
  useEffect(() => {
    setName(zone?.name || "");
  }, [zone?.id]);
  const nextStatuses = zone ? getAllowedNextStatuses(zone.status) : [];

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next && zone) setName(zone.name);
        onOpenChange(next);
      }}
    >
      <SheetContent className="w-[min(420px,100vw)] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{zone?.name || "Зона"}</SheetTitle>
        </SheetHeader>
        {zone && (
          <div className="mt-5 space-y-5">
            <div className="space-y-2">
              <Label>Статус</Label>
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("h-3 w-3 rounded-full", MAP_STATUS_META[zone.status].className)} />
                <span className="font-medium">{MAP_STATUS_META[zone.status].label}</span>
                <ZoneHistory mapId={map.id} zone={zone} users={users} />
              </div>
              <Select
                value=""
                onValueChange={(value) => onStatusChange(zone, value as ZoneStatus)}
                disabled={pending || nextStatuses.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Сменить статус" />
                </SelectTrigger>
                <SelectContent>
                  {nextStatuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {MAP_STATUS_META[status].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Ответственный</Label>
              {canManage ? (
                <Select
                  value={zone.assigneeId || UNASSIGNED}
                  onValueChange={(value) => onAssign(zone, value === UNASSIGNED ? null : value)}
                  disabled={pending}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Не назначен" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>Не назначен</SelectItem>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name || user.username || user.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="truncate font-medium">{assigneeLabel(users, zone.assigneeId)}</p>
              )}
            </div>

            <ZoneMaterials
              key={zone.id}
              zone={zone}
              users={users}
              currentUserId={currentUserId}
              canManage={canManage}
              commentPending={commentPending}
              photoPending={photoPending}
              onAddComment={onAddComment}
              onDeleteComment={onDeleteComment}
              onAddPhotos={onAddPhotos}
              onDeletePhoto={onDeletePhoto}
            />

            {canManage && (
              <div className="space-y-3 rounded-lg border p-3">
                <div className="space-y-1.5">
                  <Label htmlFor="zone-name">Название зоны</Label>
                  <Input id="zone-name" value={name} onChange={(event) => setName(event.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={() => onRename(zone, name.trim())} disabled={pending || !name.trim()}>
                    Сохранить
                  </Button>
                  <Button type="button" size="sm" variant="destructive" onClick={() => onDelete(zone)} disabled={pending}>
                    Удалить
                  </Button>
                </div>
              </div>
            )}

            <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
              Карта: {map.name}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Левый сайдбар: переключение между площадками без возврата в список. */
function MapsSidebar({ maps, currentId, onSelect }: { maps: SiteMap[]; currentId: string; onSelect: (id: string) => void }) {
  return (
    <Card className="hidden rounded-lg xl:flex xl:h-[calc(100vh-11rem)] xl:flex-col">
      <CardHeader className="shrink-0 pb-3">
        <h2 className="font-semibold">Доступные карты</h2>
      </CardHeader>
      {/* Карт может быть много — список скроллится внутри себя, а не тянет страницу. */}
      <CardContent className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
        {maps.map((map) => (
          <button
            key={map.id}
            type="button"
            onClick={() => onSelect(map.id)}
            className={cn(
              "w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent/50",
              map.id === currentId && "border-primary bg-primary/5",
            )}
          >
            <span className="block truncate font-medium" title={map.name}>
              {map.name}
            </span>
            <span
              className={cn(
                "mt-0.5 block truncate text-xs",
                zoneStatusCount(map, "problem") > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
              )}
            >
              {mapSummaryLine(map)}
            </span>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

/** Компактный селектор площадок — замена сайдбару там, где три колонки не помещаются. */
function MapsPicker({ maps, currentId, onSelect }: { maps: SiteMap[]; currentId: string; onSelect: (id: string) => void }) {
  return (
    <Select value={currentId} onValueChange={onSelect}>
      <SelectTrigger className="w-full xl:hidden">
        <SelectValue placeholder="Выберите площадку" />
      </SelectTrigger>
      <SelectContent>
        {maps.map((map) => (
          <SelectItem key={map.id} value={map.id}>
            {map.name} · {mapSummaryLine(map)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Правая панель: статусы всех зон видны сразу, без раскрытия каждой. Ниже — карточка
 * выбранной зоны с ответственным. Полные детали (фото, комментарии, история) по-прежнему
 * открываются в панели зоны по клику.
 */
function ZonesPanel({
  zones,
  selectedZoneId,
  users,
  canManage,
  pending,
  onSelect,
  onOpenDetails,
  onUnassign,
}: {
  zones: MapZone[];
  selectedZoneId: string | null;
  users: ZoneUser[];
  canManage: boolean;
  pending?: boolean;
  onSelect: (zone: MapZone) => void;
  onOpenDetails: (zone: MapZone) => void;
  onUnassign: (zone: MapZone) => void;
}) {
  const ordered = useMemo(() => sortZonesForPanel(zones), [zones]);
  const selected = zones.find((zone) => zone.id === selectedZoneId) || null;
  const assignee = selected?.assigneeId ? users.find((user) => user.id === selected.assigneeId) : null;
  const assigneeName = selected ? assigneeLabel(users, selected.assigneeId) : "";

  return (
    <div className="flex flex-col gap-3 xl:h-[calc(100vh-11rem)]">
      <Card className="flex min-h-0 flex-1 flex-col rounded-lg">
        <CardHeader className="shrink-0 pb-3">
          <h2 className="font-semibold">Зоны карты</h2>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {ordered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Зон пока нет. Нарисуйте первую — статусы появятся здесь.
            </p>
          ) : (
            ordered.map((zone) => {
              const meta = MAP_STATUS_META[zone.status];
              const isProblem = zone.status === "problem";
              return (
                <button
                  key={zone.id}
                  type="button"
                  onClick={() => onSelect(zone)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg border p-2.5 text-left transition-colors hover:bg-accent/50",
                    isProblem && "border-red-500/40 bg-red-500/5",
                    zone.id === selectedZoneId && "border-primary bg-primary/5",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", meta.className)} />
                    <span className="truncate text-sm font-medium" title={zone.name}>
                      {zone.name}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-xs",
                      isProblem ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground",
                    )}
                  >
                    {meta.label}
                  </span>
                </button>
              );
            })
          )}
        </CardContent>
      </Card>

      {selected && (
        <Card className="shrink-0 rounded-lg">
          <CardHeader className="pb-2">
            <h3 className="truncate text-lg font-bold" title={selected.name}>
              {selected.name}
            </h3>
            <div>
              <Badge
                variant="outline"
                className={cn(
                  "rounded-md",
                  selected.status === "problem" && "border-red-500/50 bg-red-500/10 font-medium text-red-600 dark:text-red-400",
                )}
              >
                {MAP_STATUS_META[selected.status].label}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <p className="text-xs text-muted-foreground">Ответственный</p>
            {selected.assigneeId ? (
              <div
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border p-2.5",
                  selected.status === "problem" && "border-red-500/40 bg-red-500/5",
                )}
              >
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback className="text-xs font-medium">{assigneeInitials(assigneeName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={assigneeName}>
                    {assigneeName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{assignee?.role || "Сотрудник"}</p>
                </div>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed p-2.5 text-sm text-muted-foreground">Не назначен</p>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenDetails(selected)}>
                {canManage ? "Изменить" : "Подробнее"}
              </Button>
              {canManage && selected.assigneeId && (
                <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => onUnassign(selected)}>
                  Снять
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MapDetailPage({ mapId }: { mapId: string }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const currentUser = getCurrentUser();
  const canManage = canEditMaps(currentUser);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  // Полные детали зоны (статус, ответственный, фото, комментарии, история) — в выезжающей панели.
  // Клик по зоне только выделяет её; панель открывается явно — правым кликом → «Подробнее»
  // либо кнопкой в правой панели.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [planEditMode, setPlanEditMode] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const canvasRef = useRef<MapCanvasHandle>(null);
  const planInputRef = useRef<HTMLInputElement>(null);
  // Нарисованный полигон ждёт имени в диалоге, затем создаётся зона.
  const [pendingPoints, setPendingPoints] = useState<ZonePoint[] | null>(null);
  const [newZoneName, setNewZoneName] = useState("");

  // Список площадок для левого сайдбара — тот же кэш, что и на странице списка.
  const { data: allMaps = [] } = useQuery<SiteMap[]>({
    queryKey: ["/api/maps"],
    queryFn: listMaps,
  });

  // Пользователи для выпадающего «Ответственный» (только менеджерам).
  const { data: users = [] } = useQuery<ZoneUser[]>({
    queryKey: ["/api/users"],
    enabled: canManage,
  });

  const { data: map, isLoading, isError, error, refetch } = useQuery<MapWithZones>({
    queryKey: ["/api/maps", mapId],
    queryFn: () => getMap(mapId),
    enabled: Boolean(mapId),
    // Realtime без перезагрузки страницы: опрос сервера каждые 4с. WS-хаба в backend ещё нет
    // (VM-06/VM-13), поэтому статус, ответственный, комментарии и фото подтягиваются поллингом.
    // Мутации не оптимистичны, черновик рисования и выделение зоны — локальны, поэтому рефетч
    // ничего не затирает.
    refetchInterval: 4000,
    refetchIntervalInBackground: true,
  });

  const selectedZone = (map?.zones || []).find((zone) => zone.id === selectedZoneId) || null;

  /**
   * Имена ответственных. `/api/users` доступен только менеджерам, поэтому для остальных
   * ролей берём имена из сводки списка карт — иначе в панели вместо имени виден UUID.
   */
  const zoneUsers = useMemo<ZoneUser[]>(() => {
    if (canManage && users.length > 0) return users;
    const summary = allMaps.find((candidate) => candidate.id === mapId);
    return (summary?.assignees || []).map((assignee) => ({ id: assignee.id, name: assignee.name || undefined }));
  }, [canManage, users, allMaps, mapId]);

  const invalidateMap = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/maps"] });
    queryClient.invalidateQueries({ queryKey: ["/api/maps", mapId] });
  };

  const uploadPlanMutation = useMutation({
    mutationFn: (file: File) => uploadMapPlan(mapId, file),
    onSuccess: () => {
      invalidateMap();
      toast({ title: "План загружен" });
    },
    onError: (e: any) => {
      toast({ title: "Ошибка", description: e?.message || "Не удалось загрузить план", variant: "destructive" });
    },
  });

  const removePlanMutation = useMutation({
    mutationFn: () => removeMapPlan(mapId),
    onSuccess: () => {
      invalidateMap();
      setPlanEditMode(false);
      toast({ title: "План удалён" });
    },
    onError: (e: any) => {
      toast({ title: "Ошибка", description: e?.message || "Не удалось удалить план", variant: "destructive" });
    },
  });

  const resizePlanMutation = useMutation({
    // Срабатывает на каждое завершение перетаскивания/ресайза — без тоста, чтобы не спамить.
    mutationFn: (rect: PlanRect) => saveMapPlanRect(mapId, rect),
    onSuccess: () => invalidateMap(),
    onError: (e: any) => {
      invalidateMap();
      toast({ title: "Ошибка", description: e?.message || "Не удалось сохранить размер плана", variant: "destructive" });
    },
  });

  const createZoneMutation = useMutation({
    mutationFn: ({ name, points }: { name: string; points: ZonePoint[] }) => createZone(mapId, { name, points }),
    onSuccess: (zone) => {
      invalidateMap();
      setSelectedZoneId(zone.id);
      setPendingPoints(null);
      setNewZoneName("");
      toast({ title: "Зона создана" });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message || "Не удалось создать зону", variant: "destructive" }),
  });

  const assignMutation = useMutation({
    mutationFn: ({ zone, assigneeId }: { zone: MapZone; assigneeId: string | null }) => assignZone(mapId, zone.id, assigneeId),
    onSuccess: (zone) => {
      invalidateMap();
      setSelectedZoneId(zone.id);
      toast({ title: "Ответственный обновлён" });
    },
    onError: (e: any) => {
      invalidateMap();
      toast({ title: "Ошибка", description: e?.message || "Не удалось назначить ответственного", variant: "destructive" });
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: ({ zone, text }: { zone: MapZone; text: string }) => addZoneComment(mapId, zone.id, text),
    onSuccess: (zone) => {
      invalidateMap();
      setSelectedZoneId(zone.id);
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message || "Не удалось добавить комментарий", variant: "destructive" }),
  });

  const deleteCommentMutation = useMutation({
    mutationFn: ({ zone, commentId }: { zone: MapZone; commentId: string }) => deleteZoneComment(mapId, zone.id, commentId),
    onSuccess: (zone) => {
      invalidateMap();
      setSelectedZoneId(zone.id);
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message || "Не удалось удалить комментарий", variant: "destructive" }),
  });

  const addPhotosMutation = useMutation({
    mutationFn: async ({ zone, files }: { zone: MapZone; files: File[] }) => {
      let latest = zone;
      for (const file of files) {
        const url = await uploadZonePhotoFile(file);
        latest = await addZonePhoto(mapId, zone.id, url);
      }
      return latest;
    },
    onSuccess: (zone) => {
      invalidateMap();
      setSelectedZoneId(zone.id);
      toast({ title: "Фото добавлено" });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message || "Не удалось загрузить фото", variant: "destructive" }),
  });

  const deletePhotoMutation = useMutation({
    mutationFn: ({ zone, url }: { zone: MapZone; url: string }) => deleteZonePhoto(mapId, zone.id, url),
    onSuccess: (zone) => {
      invalidateMap();
      setSelectedZoneId(zone.id);
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message || "Не удалось удалить фото", variant: "destructive" }),
  });

  const updateZoneMutation = useMutation({
    mutationFn: ({ zone, name, points }: { zone: MapZone; name?: string; points?: ZonePoint[] }) =>
      updateZone(mapId, zone.id, { name, points, version: zone.version }),
    onSuccess: (zone) => {
      invalidateMap();
      setSelectedZoneId(zone.id);
      toast({ title: "Зона обновлена" });
    },
    onError: (e: any) => {
      invalidateMap();
      toast({ title: "Ошибка", description: e?.message || "Не удалось обновить зону", variant: "destructive" });
    },
  });

  const deleteZoneMutation = useMutation({
    mutationFn: (zone: MapZone) => deleteZone(mapId, zone.id),
    onSuccess: () => {
      invalidateMap();
      setSelectedZoneId(null);
      toast({ title: "Зона удалена" });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message || "Не удалось удалить зону", variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ zone, status }: { zone: MapZone; status: ZoneStatus }) => changeZoneStatus(mapId, zone.id, status, zone.version),
    onSuccess: (zone) => {
      invalidateMap();
      setSelectedZoneId(zone.id);
      toast({ title: "Статус обновлён" });
    },
    onError: (e: any) => {
      invalidateMap();
      toast({ title: "Ошибка", description: e?.message || "Не удалось сменить статус", variant: "destructive" });
    },
  });

  const pending = uploadPlanMutation.isPending || createZoneMutation.isPending || updateZoneMutation.isPending || deleteZoneMutation.isPending || statusMutation.isPending || assignMutation.isPending;

  const openNameDialog = (points: ZonePoint[]) => {
    setPendingPoints(points);
    setNewZoneName(`Зона ${(map?.zones?.length || 0) + 1}`);
  };

  const confirmCreateZone = () => {
    const name = newZoneName.trim();
    if (!pendingPoints || pendingPoints.length < 3 || !name) return;
    createZoneMutation.mutate({ name, points: pendingPoints });
  };

  if (isLoading) {
    return (
      <div className="space-y-3 p-1 sm:p-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-[520px] w-full rounded-lg" />
      </div>
    );
  }

  if (isError || !map) {
    return (
      <div className="space-y-3 p-1 sm:p-2">
        <Button type="button" variant="ghost" className="gap-1.5" onClick={() => setLocation("/maps")}>
          <ArrowLeft className="h-4 w-4" />
          Назад к площадкам
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Площадка не открылась</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{(error as any)?.message || "Площадка не найдена или недоступна."}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
              Повторить
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const zones = map.zones || [];
  const problems = countZonesByStatus(zones, "problem");
  const inProgress = countZonesByStatus(zones, "in_progress");

  return (
    <div className="space-y-3 p-1 sm:p-2">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-1">
          <Button type="button" variant="ghost" size="sm" className="gap-1.5 px-0" onClick={() => setLocation("/maps")}>
            <ArrowLeft className="h-4 w-4" />
            Назад к площадкам
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold sm:text-2xl">{map.name}</h1>
            {problems > 0 && (
              <Badge variant="outline" className="rounded-md border-red-500/50 bg-red-500/10 font-medium text-red-600 dark:text-red-400">
                {problems} {plural(problems, "проблема", "проблемы", "проблем")}
              </Badge>
            )}
            {inProgress > 0 && (
              <Badge variant="outline" className="rounded-md border-amber-500/50 bg-amber-500/10 font-medium text-amber-600 dark:text-amber-400">
                {inProgress} в работе
              </Badge>
            )}
          </div>
        </div>

        {canManage && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {/* Скрытый input: загрузка плана — пункт меню, а не поле, торчащее в шапке. */}
            <input
              ref={planInputRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) uploadPlanMutation.mutate(file);
                // Сбрасываем значение, иначе повторный выбор того же файла не даст события.
                if (planInputRef.current) planInputRef.current.value = "";
              }}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" className="gap-1.5">
                  {uploadPlanMutation.isPending || removePlanMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  План
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => planInputRef.current?.click()} className="gap-2">
                  <Upload className="h-4 w-4" />
                  {map.imageUrl ? "Заменить план" : "Загрузить план"}
                </DropdownMenuItem>
                {map.imageUrl && (
                  <DropdownMenuItem
                    onSelect={() => removePlanMutation.mutate()}
                    className="gap-2 text-destructive focus:text-destructive"
                  >
                    <X className="h-4 w-4" />
                    Удалить план
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              className="gap-1.5"
              disabled={drawing || pending}
              onClick={() => canvasRef.current?.startCreate()}
            >
              <Plus className="h-4 w-4" />
              {drawing ? "Рисование…" : "Нарисовать зону"}
            </Button>
          </div>
        )}
      </div>

      <MapsPicker maps={allMaps} currentId={mapId} onSelect={(id) => setLocation(`/maps/${id}`)} />

      <div className="grid gap-3 xl:grid-cols-[16rem_minmax(0,1fr)_20rem]">
        <MapsSidebar maps={allMaps} currentId={mapId} onSelect={(id) => setLocation(`/maps/${id}`)} />

        <div className="min-w-0 space-y-2">
          <MapCanvas
            ref={canvasRef}
            map={map}
            selectedZoneId={selectedZoneId}
            canEditZones={canManage}
            isMutating={pending}
            onZoneSelect={(zone) => setSelectedZoneId(zone?.id || null)}
            onZoneDrawn={openNameDialog}
            onUpdateZonePoints={(zone, points) => updateZoneMutation.mutate({ zone, points })}
            onZoneDelete={(zone) => deleteZoneMutation.mutate(zone)}
            onZoneDetails={(zone) => {
              setSelectedZoneId(zone.id);
              setDetailsOpen(true);
            }}
            onDrawModeChange={setDrawing}
            planEditMode={planEditMode}
            onPlanEditModeChange={setPlanEditMode}
            onResizePlan={(rect) => resizePlanMutation.mutate(rect)}
          />
          <MapLegend map={map} />
        </div>

        <ZonesPanel
          zones={zones}
          selectedZoneId={selectedZoneId}
          users={zoneUsers}
          canManage={canManage}
          pending={pending}
          onSelect={(zone) => setSelectedZoneId(zone.id)}
          onOpenDetails={(zone) => {
            setSelectedZoneId(zone.id);
            setDetailsOpen(true);
          }}
          onUnassign={(zone) => assignMutation.mutate({ zone, assigneeId: null })}
        />
      </div>

      <ZonePanel
        map={map}
        zone={selectedZone}
        open={detailsOpen && Boolean(selectedZone)}
        canManage={canManage}
        users={zoneUsers}
        currentUserId={currentUser?.id}
        pending={pending}
        commentPending={addCommentMutation.isPending || deleteCommentMutation.isPending}
        photoPending={addPhotosMutation.isPending || deletePhotoMutation.isPending}
        onOpenChange={(open) => !open && setDetailsOpen(false)}
        onRename={(zone, name) => updateZoneMutation.mutate({ zone, name })}
        onDelete={(zone) => deleteZoneMutation.mutate(zone)}
        onStatusChange={(zone, status) => statusMutation.mutate({ zone, status })}
        onAssign={(zone, assigneeId) => assignMutation.mutate({ zone, assigneeId })}
        onAddComment={(zone, text) => addCommentMutation.mutate({ zone, text })}
        onDeleteComment={(zone, commentId) => deleteCommentMutation.mutate({ zone, commentId })}
        onAddPhotos={(zone, files) => addPhotosMutation.mutate({ zone, files })}
        onDeletePhoto={(zone, url) => deletePhotoMutation.mutate({ zone, url })}
      />

      <Dialog open={Boolean(pendingPoints)} onOpenChange={(open) => !open && setPendingPoints(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Название зоны</DialogTitle>
            <DialogDescription>Область выделена на плане. Цвет зоны задаётся её статусом.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="new-zone-name">Название</Label>
            <Input
              id="new-zone-name"
              value={newZoneName}
              onChange={(event) => setNewZoneName(event.target.value)}
              placeholder="Например: Сцена"
              onKeyDown={(event) => {
                if (event.key === "Enter") confirmCreateZone();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingPoints(null)}>
              Отмена
            </Button>
            <Button type="button" onClick={confirmCreateZone} disabled={!newZoneName.trim() || createZoneMutation.isPending}>
              {createZoneMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Создать зону
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function MapsPage({ mapId }: { mapId?: string }) {
  if (mapId) return <MapDetailPage mapId={mapId} />;
  return <MapsListPage />;
}
