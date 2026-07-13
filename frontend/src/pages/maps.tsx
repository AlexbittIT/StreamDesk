import { useEffect, useMemo, useRef, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  addZoneComment,
  addZonePhoto,
  assignZone,
  canEditMaps,
  changeZoneStatus,
  createMap,
  createZone,
  deleteMap,
  deleteZone,
  deleteZoneComment,
  deleteZonePhoto,
  filterMapsByName,
  getAllowedNextStatuses,
  getMap,
  listMaps,
  MAP_STATUS_META,
  mapImageUrl,
  removeMapPlan,
  saveMapPlanRect,
  updateMap,
  updateZone,
  uploadMapPlan,
  uploadZonePhotoFile,
  type MapWithZones,
  type MapZone,
  type PlanRect,
  type SiteMap,
  type ZoneComment,
  type ZonePoint,
  type ZoneStatus,
} from "@/lib/maps-api";

/** Пользователь для выпадающего списка «Ответственный» (ответ /api/users). */
type ZoneUser = { id: string; name?: string; username?: string; role?: string };
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Edit,
  Loader2,
  ImagePlus,
  Map,
  MessageSquare,
  Plus,
  Scaling,
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

function MapDetailPage({ mapId }: { mapId: string }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const currentUser = getCurrentUser();
  const canManage = canEditMaps(currentUser);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [planFile, setPlanFile] = useState<File | null>(null);
  const [planEditMode, setPlanEditMode] = useState(false);
  // Нарисованный полигон ждёт имени в диалоге, затем создаётся зона.
  const [pendingPoints, setPendingPoints] = useState<ZonePoint[] | null>(null);
  const [newZoneName, setNewZoneName] = useState("");

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
          <div className="flex flex-col gap-2">
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
            {map.imageUrl && (
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 text-destructive hover:text-destructive"
                  disabled={removePlanMutation.isPending}
                  onClick={() => removePlanMutation.mutate()}
                  title="Удалить план"
                >
                  {removePlanMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                </Button>
                <Button
                  type="button"
                  variant={planEditMode ? "default" : "outline"}
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setPlanEditMode((value) => !value)}
                  title={planEditMode ? "Завершить редактирование плана" : "Редактировать план: двигать и тянуть за углы"}
                >
                  <Scaling className="h-4 w-4" />
                  {planEditMode ? "Готово" : "Редактировать"}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <MapCanvas
        map={map}
        selectedZoneId={selectedZoneId}
        canEditZones={canManage}
        isMutating={pending}
        onZoneSelect={(zone) => setSelectedZoneId(zone?.id || null)}
        onZoneDrawn={openNameDialog}
        onUpdateZonePoints={(zone, points) => updateZoneMutation.mutate({ zone, points })}
        onZoneDelete={(zone) => deleteZoneMutation.mutate(zone)}
        planEditMode={planEditMode}
        onResizePlan={(rect) => resizePlanMutation.mutate(rect)}
      />

      <ZonePanel
        map={map}
        zone={selectedZone}
        open={Boolean(selectedZone)}
        canManage={canManage}
        users={users}
        currentUserId={currentUser?.id}
        pending={pending}
        commentPending={addCommentMutation.isPending || deleteCommentMutation.isPending}
        photoPending={addPhotosMutation.isPending || deletePhotoMutation.isPending}
        onOpenChange={(open) => !open && setSelectedZoneId(null)}
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
