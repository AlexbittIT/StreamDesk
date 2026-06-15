import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Film, User, Tag, Plus, Pencil, Trash2, Download, Loader2, Calendar, PlusCircle, FileText } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { EventForm } from "@/components/forms/event-form";

type EventItem = { id: string; title: string; startTime?: string; endTime?: string; type?: string };
type ParticipantProfile = {
  id: string;
  eventId: string;
  name: string;
  role?: string;
  photo?: string;
  bio?: string;
  contacts?: Record<string, string>;
  extra?: Record<string, unknown> & { skills?: string; characteristics?: string };
  order?: number;
};
type ShowMarker = {
  id: string;
  eventId: string;
  timecode: string;
  type: string;
  value?: string;
  note?: string;
  editorId?: string;
  createdAt?: string;
};

export default function Production() {
  const { toast } = useToast();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [showDocOpen, setShowDocOpen] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ParticipantProfile | null>(null);
  const [markerDialogOpen, setMarkerDialogOpen] = useState(false);
  const [editingMarker, setEditingMarker] = useState<ShowMarker | null>(null);

  const { data: events = [], isLoading: eventsLoading } = useQuery<EventItem[]>({
    queryKey: ["/api/events"],
  });

  const { data: profiles = [], refetch: refetchProfiles } = useQuery<ParticipantProfile[]>({
    queryKey: ["/api/events", selectedEventId, "participant-profiles"],
    enabled: !!selectedEventId,
  });

  const { data: markers = [], refetch: refetchMarkers } = useQuery<ShowMarker[]>({
    queryKey: ["/api/events", selectedEventId, "markers"],
    enabled: !!selectedEventId,
  });

  const createProfile = useMutation({
    mutationFn: async (body: { name: string; role?: string; photo?: string; bio?: string; contacts?: object; extra?: object; order?: number }) => {
      const res = await apiRequest("POST", `/api/events/${selectedEventId}/participant-profiles`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", selectedEventId, "participant-profiles"] });
      setProfileDialogOpen(false);
      setEditingProfile(null);
      toast({ title: "Участник добавлен" });
    },
  });

  const updateProfile = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ParticipantProfile> }) => {
      const res = await apiRequest("PUT", `/api/participant-profiles/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", selectedEventId, "participant-profiles"] });
      setProfileDialogOpen(false);
      setEditingProfile(null);
      toast({ title: "Изменения сохранены" });
    },
  });

  const deleteProfile = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/participant-profiles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", selectedEventId, "participant-profiles"] });
      toast({ title: "Участник удалён", variant: "destructive" });
    },
  });

  const createMarker = useMutation({
    mutationFn: async (body: { timecode: string; type: string; value?: string; note?: string }) => {
      const res = await apiRequest("POST", `/api/events/${selectedEventId}/markers`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", selectedEventId, "markers"] });
      setMarkerDialogOpen(false);
      setEditingMarker(null);
      toast({ title: "Маркер добавлен" });
    },
  });

  const updateMarker = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ShowMarker> }) => {
      const res = await apiRequest("PUT", `/api/markers/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", selectedEventId, "markers"] });
      setMarkerDialogOpen(false);
      setEditingMarker(null);
      toast({ title: "Маркер обновлён" });
    },
  });

  const deleteMarker = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/markers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", selectedEventId, "markers"] });
      toast({ title: "Маркер удалён", variant: "destructive" });
    },
  });

  const handlePrintParticipant = (p: ParticipantProfile) => {
    const win = window.open("", "_blank");
    if (!win) return;
    const skills = (p.extra as { skills?: string })?.skills ?? "";
    const characteristics = (p.extra as { characteristics?: string })?.characteristics ?? "";
    win.document.write(`
      <!DOCTYPE html><html><head><meta charset="utf-8"><title>Личное дело — ${p.name}</title>
      <style>
        @page { size: A4; margin: 20mm; }
        body { font-family: 'Georgia', 'Times New Roman', serif; padding: 24px; max-width: 210mm; margin: 0 auto; background: #fff; color: #1a1a1a; font-size: 14px; line-height: 1.5; }
        .sheet { border: 1px solid #ddd; box-shadow: 0 2px 8px rgba(0,0,0,0.06); min-height: 277mm; padding: 20mm; position: relative; }
        .photo-wrap { position: absolute; top: 20mm; right: 20mm; width: 100px; height: 120px; border: 1px solid #ccc; overflow: hidden; }
        .photo-wrap img { width: 100%; height: 100%; object-fit: cover; }
        .photo-placeholder { width: 100%; height: 100%; background: #f0f0f0; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #888; }
        .main { margin-right: 120px; }
        h1 { font-size: 18px; font-weight: 700; margin: 0 0 8px; border-bottom: 1px solid #333; padding-bottom: 4px; }
        .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; margin-top: 14px; margin-bottom: 2px; }
        .value { margin: 0 0 4px; }
        .bio, .skills, .chars { white-space: pre-wrap; }
      </style></head><body>
        <div class="sheet">
          <div class="photo-wrap">${p.photo ? `<img src="${p.photo}" alt="" />` : `<div class="photo-placeholder">Фото</div>`}</div>
          <div class="main">
            <h1>${p.name}</h1>
            ${p.role ? `<div class="label">Должность / роль</div><div class="value">${p.role}</div>` : ""}
            ${skills ? `<div class="label">Навыки</div><div class="value skills">${skills}</div>` : ""}
            ${characteristics ? `<div class="label">Характеристики</div><div class="value chars">${characteristics}</div>` : ""}
            ${p.bio ? `<div class="label">О себе</div><div class="value bio">${p.bio}</div>` : ""}
            ${p.contacts && Object.keys(p.contacts).length ? `<div class="label">Контакты</div><div class="value">${Object.entries(p.contacts).map(([k, v]) => `${k}: ${v}`).join(" · ")}</div>` : ""}
          </div>
        </div>
      </body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 300);
  };

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  return (
    <div className="space-y-4 sm:space-y-6 w-full min-w-0 max-w-full">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Продакшн / Шоу</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Шоу
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {eventsLoading ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {events.map((ev) => (
                  <Button
                    key={ev.id}
                    variant={selectedEventId === ev.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setSelectedEventId(ev.id);
                      setShowDocOpen(true);
                    }}
                    className="gap-1.5"
                  >
                    <FileText className="h-4 w-4 shrink-0" />
                    {ev.title}
                    {ev.startTime && (
                      <span className="ml-1 text-xs opacity-80">
                        {format(new Date(ev.startTime), "d MMM", { locale: ru })}
                      </span>
                    )}
                  </Button>
                ))}
                <CreateShowButton
                  onCreated={(id) => {
                    setSelectedEventId(id);
                    queryClient.invalidateQueries({ queryKey: ["/api/events"] });
                  }}
                />
              </div>
              {events.length === 0 && !eventsLoading && (
                <p className="text-muted-foreground">Нет шоу. Нажмите «Создать шоу».</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {!selectedEventId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Выберите шоу.
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="participants">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="participants" className="gap-2">
              <User className="h-4 w-4" />
              Участники
            </TabsTrigger>
            <TabsTrigger value="markers" className="gap-2">
              <Tag className="h-4 w-4" />
              Маркеры
            </TabsTrigger>
          </TabsList>

          <TabsContent value="participants" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-2" onClick={() => setEditingProfile(null)}>
                    <Plus className="h-4 w-4" />
                    Добавить участника
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <ParticipantForm
                    key={editingProfile?.id ?? "new"}
                    eventId={selectedEventId!}
                    editing={editingProfile}
                    onSave={(data) => {
                      if (editingProfile) updateProfile.mutate({ id: editingProfile.id, data });
                      else createProfile.mutate(data);
                    }}
                    onCancel={() => { setProfileDialogOpen(false); setEditingProfile(null); }}
                    isLoading={createProfile.isPending || updateProfile.isPending}
                  />
                </DialogContent>
              </Dialog>
            </div>
            <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2">
              {profiles.map((p) => (
                <ParticipantA4Card
                  key={p.id}
                  profile={p}
                  onEdit={() => { setEditingProfile(p); setProfileDialogOpen(true); }}
                  onPrint={() => handlePrintParticipant(p)}
                  onDelete={() => deleteProfile.mutate(p.id)}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="markers" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={markerDialogOpen} onOpenChange={setMarkerDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-2" onClick={() => setEditingMarker(null)}>
                    <Plus className="h-4 w-4" />
                    Добавить маркер
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <MarkerForm
                    key={editingMarker?.id ?? "new"}
                    editing={editingMarker}
                    onSave={(data) => {
                      if (editingMarker) updateMarker.mutate({ id: editingMarker.id, data });
                      else createMarker.mutate(data);
                    }}
                    onCancel={() => { setMarkerDialogOpen(false); setEditingMarker(null); }}
                    isLoading={createMarker.isPending || updateMarker.isPending}
                  />
                </DialogContent>
              </Dialog>
            </div>
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-left font-medium">Таймкод</th>
                    <th className="p-3 text-left font-medium">Тип</th>
                    <th className="p-3 text-left font-medium">Значение</th>
                    <th className="p-3 text-left font-medium">Заметка</th>
                    <th className="p-3 w-20" />
                  </tr>
                </thead>
                <tbody>
                  {markers.map((m) => (
                    <tr key={m.id} className="border-b last:border-0">
                      <td className="p-3 font-mono">{m.timecode}</td>
                      <td className="p-3">
                        <Badge variant="secondary">{m.type}</Badge>
                      </td>
                      <td className="p-3">{m.value ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">{m.note ?? "—"}</td>
                      <td className="p-3 flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { setEditingMarker(m); setMarkerDialogOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteMarker.mutate(m.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {markers.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">Нет маркеров.</div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      )}

      {/* Документ шоу: при нажатии на шоу открывается редактируемая форма */}
      <EventForm
        key={selectedEventId ?? "none"}
        isOpen={showDocOpen}
        onClose={() => setShowDocOpen(false)}
        event={selectedEvent ?? undefined}
      />
    </div>
  );
}

function ParticipantA4Card({
  profile: p,
  onEdit,
  onPrint,
  onDelete,
}: {
  profile: ParticipantProfile;
  onEdit: () => void;
  onPrint: () => void;
  onDelete: () => void;
}) {
  const skills = (p.extra as { skills?: string })?.skills ?? "";
  const characteristics = (p.extra as { characteristics?: string })?.characteristics ?? "";
  const contactsStr = p.contacts && Object.keys(p.contacts).length
    ? Object.entries(p.contacts).map(([k, v]) => `${k}: ${v}`).join(" · ")
    : "";

  const DocRow = ({ label, value }: { label: string; value: string | undefined }) => (
    <div className="mt-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm text-foreground min-h-[1.25rem]">{value || "—"}</p>
    </div>
  );

  return (
    <div
      className="relative bg-[#fefefe] dark:bg-zinc-900 rounded-lg overflow-hidden shadow-md border border-slate-200 dark:border-zinc-700"
      style={{ maxWidth: "210mm", minHeight: "277mm", boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.02)" }}
    >
      {/* Внешняя рамка «листа» */}
      <div className="absolute inset-2 sm:inset-3 border border-slate-200/80 dark:border-zinc-600/50 rounded pointer-events-none" aria-hidden />

      {/* Шапка документа — одинаково у всех */}
      <div className="px-5 pt-4 pb-2 border-b border-slate-200 dark:border-zinc-600">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Личное дело участника</p>
      </div>

      {/* Фото справа вверху — фиксированное место как в бланке */}
      <div className="absolute top-14 right-4 w-24 h-[7.5rem] sm:w-28 sm:h-32 rounded-sm border-2 border-slate-200 dark:border-zinc-600 overflow-hidden bg-slate-100 dark:bg-zinc-800 shrink-0">
        {p.photo ? (
          <img src={p.photo} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl text-muted-foreground font-serif">
            {p.name.charAt(0)}
          </div>
        )}
      </div>

      {/* Блок ФИО по центру слева — как в документе */}
      <div className="p-5 pr-32 sm:pr-36">
        <h2 className="text-lg font-semibold border-b-2 border-slate-800 dark:border-zinc-400 pb-1.5 font-serif text-slate-900 dark:text-white">
          {p.name}
        </h2>

        <DocRow label="Должность / роль" value={p.role} />
        <DocRow label="Навыки" value={skills || undefined} />
        <DocRow label="Характеристики" value={characteristics || undefined} />
        <DocRow label="О себе" value={p.bio || undefined} />
        <DocRow label="Контакты" value={contactsStr || undefined} />
      </div>

      {/* Кнопки действий внизу справа */}
      <div className="absolute bottom-3 right-3 flex gap-1">
        <Button variant="secondary" size="icon" className="h-8 w-8" onClick={onEdit} title="Редактировать">
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="icon" className="h-8 w-8" onClick={onPrint} title="Печать / PDF">
          <Download className="h-4 w-4" />
        </Button>
        <Button variant="destructive" size="icon" className="h-8 w-8" onClick={onDelete} title="Удалить">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function CreateShowButton({ onCreated }: { onCreated: (eventId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleCreate = async () => {
    if (!title.trim()) {
      toast({ title: "Ошибка", description: "Введите название шоу", variant: "destructive" });
      return;
    }
    const userStr = typeof window !== "undefined" ? localStorage.getItem("streamstudio_user") : null;
    const user = userStr ? JSON.parse(userStr) : null;
    if (!user?.id) {
      toast({ title: "Ошибка", description: "Войдите в систему для создания шоу", variant: "destructive" });
      return;
    }
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + 24 * 60 * 60 * 1000);
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/events", {
        title: title.trim(),
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        location: "Эфир",
        organizerId: user.id,
        type: "stream",
        status: "scheduled",
      });
      const event = await res.json();
      toast({ title: "Шоу создано" });
      setOpen(false);
      setTitle("");
      onCreated(event.id);
    } catch (e: any) {
      toast({ title: "Ошибка", description: e?.message || "Не удалось создать шоу", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <PlusCircle className="h-4 w-4" />
          Создать шоу
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новое шоу</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Название</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название шоу" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
          <Button disabled={loading || !title.trim()} onClick={handleCreate}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Создать"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ParticipantForm({
  eventId,
  editing,
  onSave,
  onCancel,
  isLoading,
}: {
  eventId: string;
  editing: ParticipantProfile | null;
  onSave: (data: Partial<ParticipantProfile> & { name: string }) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [role, setRole] = useState(editing?.role ?? "");
  const [photo, setPhoto] = useState(editing?.photo ?? "");
  const [bio, setBio] = useState(editing?.bio ?? "");
  const [skills, setSkills] = useState((editing?.extra as { skills?: string })?.skills ?? "");
  const [characteristics, setCharacteristics] = useState((editing?.extra as { characteristics?: string })?.characteristics ?? "");
  const [photoUploading, setPhotoUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setPhotoUploading(true);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      const res = await fetch("/api/production/upload-photo", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Ошибка загрузки");
      const data = await res.json();
      if (data.url) setPhoto(data.url);
    } catch {
      // ignore
    } finally {
      setPhotoUploading(false);
      e.target.value = "";
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? "Редактировать участника" : "Новый участник"}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label>Имя</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ФИО" />
        </div>
        <div className="grid gap-2">
          <Label>Роль</Label>
          <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Ведущий, гость, эксперт..." />
        </div>
        <div className="grid gap-2">
          <Label>Фото</Label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoUpload}
          />
          <div className="flex items-center gap-2">
            {photo && (
              <img src={photo} alt="" className="h-16 w-16 rounded-lg object-cover border" />
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={photoUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {photoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Загрузить фото"}
            </Button>
          </div>
          <Input value={photo} onChange={(e) => setPhoto(e.target.value)} placeholder="или вставьте URL" className="mt-1" />
        </div>
        <div className="grid gap-2">
          <Label>Навыки</Label>
          <textarea
            className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
            placeholder="Навыки, компетенции (каждый с новой строки или через запятую)"
          />
        </div>
        <div className="grid gap-2">
          <Label>Характеристики</Label>
          <textarea
            className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={characteristics}
            onChange={(e) => setCharacteristics(e.target.value)}
            placeholder="Характеристики, особенности для эфира"
          />
        </div>
        <div className="grid gap-2">
          <Label>О себе</Label>
          <textarea
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Краткая биография"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Отмена</Button>
        <Button disabled={!name.trim() || isLoading} onClick={() => onSave({
          name: name.trim(),
          role: role.trim() || undefined,
          photo: photo.trim() || undefined,
          bio: bio.trim() || undefined,
          extra: { ...(editing?.extra as object || {}), skills: skills.trim() || undefined, characteristics: characteristics.trim() || undefined },
        })}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить"}
        </Button>
      </DialogFooter>
    </>
  );
}

function MarkerForm({
  editing,
  onSave,
  onCancel,
  isLoading,
}: {
  editing: ShowMarker | null;
  onSave: (data: { timecode: string; type: string; value?: string; note?: string }) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [timecode, setTimecode] = useState(editing?.timecode ?? "00:00:00");
  const [type, setType] = useState(editing?.type ?? "note");
  const [value, setValue] = useState(editing?.value ?? "");
  const [note, setNote] = useState(editing?.note ?? "");

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? "Редактировать маркер" : "Новый маркер"}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label>Таймкод</Label>
          <Input value={timecode} onChange={(e) => setTimecode(e.target.value)} placeholder="00:12:34 или 00:12:34.50" />
        </div>
        <div className="grid gap-2">
          <Label>Тип</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="emotion">Эмоция</SelectItem>
              <SelectItem value="interest">Интерес</SelectItem>
              <SelectItem value="event">Событие</SelectItem>
              <SelectItem value="note">Заметка</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Значение (например уровень 1–5)</Label>
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Опционально" />
        </div>
        <div className="grid gap-2">
          <Label>Заметка</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Что произошло" />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Отмена</Button>
        <Button disabled={!timecode.trim() || !type || isLoading} onClick={() => onSave({ timecode: timecode.trim(), type, value: value.trim() || undefined, note: note.trim() || undefined })}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить"}
        </Button>
      </DialogFooter>
    </>
  );
}
