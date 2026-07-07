import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapCanvas } from "@/components/maps/map-canvas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  canEditMaps,
  changeZoneStatus,
  createMap,
  createZone,
  deleteMap,
  deleteZone,
  filterMapsByName,
  getAllowedNextStatuses,
  getMap,
  listMaps,
  MAP_STATUS_META,
  mapImageUrl,
  updateMap,
  updateZone,
  uploadMapPlan,
  type MapWithZones,
  type MapZone,
  type SiteMap,
  type ZonePoint,
  type ZoneStatus,
} from "@/lib/maps-api";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Edit,
  Loader2,
  Map,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";

function getCurrentUser() {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem("streamstudio_user") || "{}");
  } catch {
    return null;
  }
}

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
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

function MapsListPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const currentUser = getCurrentUser();
  const canManage = canEditMaps(currentUser);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [renameMap, setRenameMap] = useState<SiteMap | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SiteMap | null>(null);

  const { data: maps = [], isLoading, isError, error, refetch } = useQuery<SiteMap[]>({
    queryKey: ["/api/maps"],
    queryFn: listMaps,
  });

  const visibleMaps = useMemo(() => filterMapsByName(maps, search), [maps, search]);

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

      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по названию" className="pl-9" />
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
              <p className="font-medium">{search ? "Ничего не найдено" : "Площадок пока нет"}</p>
              <p className="text-sm text-muted-foreground">
                {search ? "Измените поисковый запрос." : "Создайте первую площадку и загрузите план."}
              </p>
            </div>
            {!search && canManage && (
              <Button type="button" onClick={() => setCreateOpen(true)} className="gap-1.5">
                <Plus className="h-4 w-4" />
                Создать площадку
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleMaps.map((map) => (
            <Card key={map.id} className="rounded-lg transition-shadow hover:shadow-md">
              <CardHeader className="space-y-2 pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="min-w-0 truncate text-base">{map.name}</CardTitle>
                  {canManage && (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setRenameMap(map)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(map)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="rounded-md">{map.zonesCount || 0} зон</Badge>
                  {map.imageUrl ? <Badge className="rounded-md">План загружен</Badge> : <Badge variant="outline" className="rounded-md">Без плана</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Link href={`/maps/${map.id}`}>
                  <div className="flex h-32 cursor-pointer items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground">
                    {map.imageUrl ? (
                      <img src={mapImageUrl(map.imageUrl)} alt={map.name} className="h-full w-full rounded-lg object-cover" draggable={false} />
                    ) : (
                      <Map className="h-10 w-10" />
                    )}
                  </div>
                </Link>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDate(map.updatedAt || map.createdAt) || "Без даты"}
                  </span>
                  <Button type="button" size="sm" onClick={() => setLocation(`/maps/${map.id}`)}>
                    Открыть
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
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
      {(Object.keys(MAP_STATUS_META) as ZoneStatus[]).map((status) => (
        <Badge key={status} variant="outline" className="gap-1.5 rounded-md bg-background">
          <span className={cn("h-2.5 w-2.5 rounded-full", MAP_STATUS_META[status].className)} />
          {MAP_STATUS_META[status].label}
          <span className="text-muted-foreground">{counts[status] || 0}</span>
        </Badge>
      ))}
    </div>
  );
}

function ZonePanel({
  map,
  zone,
  open,
  canManage,
  onOpenChange,
  onRename,
  onDelete,
  onStatusChange,
  pending,
}: {
  map: MapWithZones;
  zone: MapZone | null;
  open: boolean;
  canManage: boolean;
  onOpenChange: (open: boolean) => void;
  onRename: (zone: MapZone, name: string) => void;
  onDelete: (zone: MapZone) => void;
  onStatusChange: (zone: MapZone, status: ZoneStatus) => void;
  pending?: boolean;
}) {
  const [name, setName] = useState(zone?.name || "");
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
              <div className="flex items-center gap-2">
                <span className={cn("h-3 w-3 rounded-full", MAP_STATUS_META[zone.status].className)} />
                <span className="font-medium">{MAP_STATUS_META[zone.status].label}</span>
                <Badge variant="outline" className="rounded-md">v{zone.version}</Badge>
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

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground">Ответственный</p>
                <p className="truncate font-medium">{zone.assigneeId || "Не назначен"}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground">Материалы</p>
                <p className="font-medium">{zone.commentsCount || 0} комм. · {zone.photosCount || 0} фото</p>
              </div>
            </div>

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

function MapDetailPage({ mapId }: { mapId: string }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const currentUser = getCurrentUser();
  const canManage = canEditMaps(currentUser);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [planFile, setPlanFile] = useState<File | null>(null);

  const { data: map, isLoading, isError, error, refetch } = useQuery<MapWithZones>({
    queryKey: ["/api/maps", mapId],
    queryFn: () => getMap(mapId),
    enabled: Boolean(mapId),
  });

  const selectedZone = (map?.zones || []).find((zone) => zone.id === selectedZoneId) || null;

  const invalidateMap = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/maps"] });
    queryClient.invalidateQueries({ queryKey: ["/api/maps", mapId] });
  };

  const uploadPlanMutation = useMutation({
    mutationFn: (file: File) => uploadMapPlan(mapId, file),
    onSuccess: () => {
      invalidateMap();
      setPlanFile(null);
      toast({ title: "План загружен" });
    },
    onError: (e: any) => {
      toast({ title: "Ошибка", description: e?.message || "Не удалось загрузить план", variant: "destructive" });
    },
  });

  const createZoneMutation = useMutation({
    mutationFn: ({ name, points }: { name: string; points: ZonePoint[] }) => createZone(mapId, { name, points }),
    onSuccess: (zone) => {
      invalidateMap();
      setSelectedZoneId(zone.id);
      toast({ title: "Зона создана" });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e?.message || "Не удалось создать зону", variant: "destructive" }),
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

  const pending = uploadPlanMutation.isPending || createZoneMutation.isPending || updateZoneMutation.isPending || deleteZoneMutation.isPending || statusMutation.isPending;

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

  return (
    <div className="space-y-3 p-1 sm:p-2">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <Button type="button" variant="ghost" size="sm" className="gap-1.5 px-0" onClick={() => setLocation("/maps")}>
            <ArrowLeft className="h-4 w-4" />
            Назад к площадкам
          </Button>
          <h1 className="truncate text-xl font-bold sm:text-2xl">{map.name}</h1>
          <MapLegend map={map} />
        </div>
        {canManage && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(event) => setPlanFile(event.target.files?.[0] || null)}
              className="max-w-xs"
            />
            <Button type="button" variant="outline" disabled={!planFile || uploadPlanMutation.isPending} onClick={() => planFile && uploadPlanMutation.mutate(planFile)} className="gap-1.5">
              {uploadPlanMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Загрузить план
            </Button>
          </div>
        )}
      </div>

      <MapCanvas
        map={map}
        selectedZoneId={selectedZoneId}
        canEditZones={canManage}
        isMutating={pending}
        onZoneSelect={(zone) => setSelectedZoneId(zone?.id || null)}
        onCreateZone={(name, points) => createZoneMutation.mutate({ name, points })}
        onUpdateZonePoints={(zone, points) => updateZoneMutation.mutate({ zone, points })}
      />

      <ZonePanel
        map={map}
        zone={selectedZone}
        open={Boolean(selectedZone)}
        canManage={canManage}
        pending={pending}
        onOpenChange={(open) => !open && setSelectedZoneId(null)}
        onRename={(zone, name) => updateZoneMutation.mutate({ zone, name })}
        onDelete={(zone) => deleteZoneMutation.mutate(zone)}
        onStatusChange={(zone, status) => statusMutation.mutate({ zone, status })}
      />
    </div>
  );
}

export default function MapsPage({ mapId }: { mapId?: string }) {
  if (mapId) return <MapDetailPage mapId={mapId} />;
  return <MapsListPage />;
}
