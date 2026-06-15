import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Plus, HardDrive, Calendar,
  User, Edit, Trash2, Film, Clock, CheckCircle2,
  Columns, GripVertical, X, Settings2, MessageSquare, Link2, Github, ExternalLink, Save,
  ArrowUp, ArrowDown, ListTodo, BarChart3, FileSpreadsheet as FileExcelIcon
} from "lucide-react";
import { Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";

const projectSchema = z.object({
  name: z.string().min(1, "Название обязательно"),
  client: z.string().optional(),
  description: z.string().optional(),
  status: z.string().default("planning"),
  category: z.string().optional(),
  deadline: z.string().optional(),
  assignedTo: z.string().optional(),
  participants: z.array(z.string()).optional(),
  showInTaskManager: z.boolean().default(false),
  createYougileBoard: z.boolean().default(false),
  devices: z.array(z.string()).optional(),
  storageLocation: z.string().optional(),
  estimatedSize: z.string().optional(),
  notes: z.string().optional(),
});

type ProjectFormData = z.infer<typeof projectSchema>;

const statusConfig = {
  planning: { label: "Планирование", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", progress: 10 },
  filming: { label: "Съёмка", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400", progress: 30 },
  editing: { label: "Монтаж", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400", progress: 50 },
  review: { label: "На проверке", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400", progress: 80 },
  completed: { label: "Завершён", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", progress: 100 },
  archived: { label: "В архиве", color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400", progress: 100 },
};

const categoryOptions = [
  { value: "commercial", label: "Рекламный ролик" },
  { value: "music_video", label: "Музыкальный клип" },
  { value: "documentary", label: "Документальный" },
  { value: "corporate", label: "Корпоративный" },
  { value: "event", label: "Мероприятие" },
  { value: "youtube", label: "YouTube контент" },
  { value: "stream_highlight", label: "Хайлайты стрима" },
  { value: "other", label: "Другое" },
];

interface ProjectColumn {
  id: string;
  projectId: string;
  name: string;
  order: number;
  color?: string | null;
}

// Колонки для менеджера задач (сохраняются в localStorage, используются на странице «Задачи»)
const TASK_MANAGER_COLUMNS_KEY = "streamdesk_task_columns";
const DEFAULT_TASK_COLUMNS = [
  { id: "not_ready", name: "Бэклог", order: 0 },
  { id: "todo", name: "К выполнению", order: 1 },
  { id: "in_progress", name: "В работе", order: 2 },
  { id: "done", name: "Готово", order: 3 },
];

function AddColumnForm({
  boardId,
  onSuccess,
  onCancel,
  isLoading,
  onSubmit,
}: {
  boardId: string;
  onSuccess: () => void;
  onCancel: () => void;
  isLoading: boolean;
  onSubmit: (title: string) => void;
}) {
  const [title, setTitle] = useState("");
  const { toast } = useToast();
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) {
      toast({ title: "Ошибка", description: "Введите название колонки", variant: "destructive" });
      return;
    }
    onSubmit(t);
  };
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium mb-1.5 block">Название колонки</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Например: В работе"
          className="bg-background"
        />
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          Отмена
        </Button>
        <Button type="submit" disabled={isLoading} className="flex-1">
          {isLoading ? "Создание…" : "Создать"}
        </Button>
      </div>
    </form>
  );
}

type TaskStats = {
  total: number;
  done: number;
  byStatus: Record<string, number>;
  statusNames?: Record<string, string>;
  byUser?: Record<string, number>;
  byRepository?: Record<string, number>;
  byCategory?: Record<string, number>;
  userNames?: Record<string, string>;
  categoryLabels?: Record<string, string>;
};

function ProjectTaskStats({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { data: stats, isLoading } = useQuery<TaskStats>({
    queryKey: ["/api/projects", projectId, "task-stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${projectId}/task-stats`);
      return res.json();
    },
    enabled: !!projectId,
  });

  if (isLoading || !stats) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const { total, done, byStatus, statusNames: apiStatusNames = {}, byUser = {}, byRepository = {}, byCategory = {}, userNames = {}, categoryLabels: apiCategoryLabels = {} } = stats;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const statusLabels: Record<string, string> = {
    todo: "К выполнению",
    in_progress: "В работе",
    done: "Готово",
    not_ready: "Бэклог",
    review: "На проверке",
  };
  const getStatusLabel = (statusId: string) => apiStatusNames[statusId] ?? statusLabels[statusId] ?? statusId;
  const r = 44;
  const circ = 2 * Math.PI * r;
  const doneOffset = total > 0 ? circ - (done / total) * circ : circ;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Всего задач</p>
          <p className="text-3xl font-bold mt-1">{total}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Выполнено</p>
          <p className="text-3xl font-bold mt-1 text-green-600 dark:text-green-400">{done}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-6 rounded-xl border border-border bg-muted/20 p-4">
        <div className="relative w-32 h-32 shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="10" className="text-muted/30" />
            <circle
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke="currentColor"
              strokeWidth="10"
              strokeDasharray={circ}
              strokeDashoffset={doneOffset}
              strokeLinecap="round"
              className="text-green-500 dark:text-green-400 transition-[stroke-dashoffset] duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-bold">{percent}%</span>
          </div>
        </div>
        <div className="flex-1 w-full">
          <p className="text-sm font-medium mb-2">Прогресс</p>
          <Progress value={percent} className="h-3 rounded-full" />
          <p className="text-xs text-muted-foreground mt-1.5">{done} из {total} задач выполнено</p>
        </div>
      </div>

      {Object.keys(byStatus).length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold mb-3">По колонкам / статусам</p>
          <div className="space-y-3">
            {Object.entries(byStatus)
              .sort((a, b) => b[1] - a[1])
              .map(([status, count]) => {
                const pct = total > 0 ? (count / total) * 100 : 0;
                return (
                  <div key={status} className="flex items-center gap-3">
                    <div className="w-24 text-sm text-muted-foreground shrink-0">
                      {getStatusLabel(status)}
                    </div>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          status === "done" ? "bg-green-500" : "bg-primary/70"
                        )}
                        style={{ width: `${pct}%`, minWidth: count > 0 ? 4 : 0 }}
                      />
                    </div>
                    <span className="text-sm font-medium w-8 text-right">{count}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {Object.keys(byUser).length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold mb-3">По исполнителям</p>
          <div className="space-y-2">
            {Object.entries(byUser)
              .sort((a, b) => b[1] - a[1])
              .map(([userId, count]) => {
                const pct = total > 0 ? (count / total) * 100 : 0;
                const name = userNames[userId] ?? userId;
                return (
                  <div key={userId} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm truncate block">{name}</span>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-0.5">
                        <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%`, minWidth: count > 0 ? 4 : 0 }} />
                      </div>
                    </div>
                    <span className="text-sm font-medium w-8 text-right shrink-0">{count}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {Object.keys(byRepository).length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold mb-3">По репозиториям</p>
          <ul className="space-y-1.5 text-sm">
            {Object.entries(byRepository)
              .sort((a, b) => b[1] - a[1])
              .map(([repo, count]) => (
                <li key={repo} className="flex justify-between items-center gap-2">
                  <span className="truncate text-muted-foreground" title={repo}>{repo}</span>
                  <span className="font-medium shrink-0">{count}</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {Object.keys(byCategory).length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold mb-3">По категориям</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(byCategory)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, count]) => (
                <Badge key={cat} variant="secondary" className="text-xs">
                  {apiCategoryLabels[cat] ?? cat}: {count}
                </Badge>
              ))}
          </div>
        </div>
      )}

      {total === 0 && (
        <p className="text-sm text-muted-foreground py-2 rounded-lg bg-muted/30 px-3">
          Нет задач по этому проекту. Добавьте проект в таск-менеджер и создавайте задачи на доске.
        </p>
      )}
      <Button variant="outline" size="sm" onClick={onClose} className="w-full rounded-xl">
        Закрыть
      </Button>
    </div>
  );
}

function EditProjectForm({
  project,
  users = [],
  onSuccess,
  onCancel,
}: {
  project: any;
  users?: any[];
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const safeUsers = Array.isArray(users) ? users : [];
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [assignedTo, setAssignedTo] = useState(project?.assignedTo ?? "");
  const [participants, setParticipants] = useState<string[]>(normalizeParticipantIds(project?.participants));
  const [showInTaskManager, setShowInTaskManager] = useState(Boolean(project?.showInTaskManager));
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!project) return;
    setName(project.name ?? "");
    setDescription(project.description ?? "");
    setAssignedTo(project.assignedTo ?? "");
    setParticipants(normalizeParticipantIds(project.participants));
    setShowInTaskManager(Boolean(project.showInTaskManager));
  }, [project?.id, project?.name, project?.description, project?.assignedTo, project?.participants, project?.showInTaskManager]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project?.id) return;
    if (!name.trim()) {
      toast({ title: "Ошибка", description: "Введите название", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await apiRequest("PUT", `/api/projects/${project.id}`, {
        name: name.trim(),
        description: description.trim() || undefined,
        assignedTo: assignedTo || undefined,
        participants,
        showInTaskManager,
      });
      onSuccess();
    } catch (error: any) {
      toast({ title: "Ошибка", description: error?.message || "Не удалось сохранить", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium mb-1.5 block">Название *</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название проекта" />
      </div>
      <div>
        <label className="text-sm font-medium mb-1.5 block">Описание</label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Описание проекта" rows={3} />
      </div>
      <div>
        <label className="text-sm font-medium mb-1.5 block">Участник</label>
        <Select value={assignedTo || "_none"} onValueChange={(v) => setAssignedTo(v === "_none" ? "" : v)}>
          <SelectTrigger className="bg-background text-foreground">
            <SelectValue placeholder="Выберите участника" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">Не назначен</SelectItem>
            {safeUsers.map((u: any) => (
              <SelectItem key={u.id} value={u.id}>{u.name ?? u.username ?? u.id}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium block">Участники проекта</label>
        <div className="max-h-44 overflow-y-auto rounded-lg border bg-background p-2 space-y-2">
          {safeUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Пользователей пока нет</p>
          ) : (
            safeUsers.map((u: any) => (
              <label key={u.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60">
                <Checkbox
                  checked={participants.includes(u.id)}
                  onCheckedChange={() => setParticipants((prev) => toggleId(prev, u.id))}
                />
                <span className="min-w-0">
                  <span className="block truncate">{u.name ?? u.username ?? u.id}</span>
                  {u.email && <span className="block truncate text-xs text-muted-foreground">{u.email}</span>}
                </span>
              </label>
            ))
          )}
        </div>
      </div>
      <label className="flex items-start gap-2 rounded-lg border bg-muted/20 p-3 text-sm">
        <Checkbox checked={showInTaskManager} onCheckedChange={(checked) => setShowInTaskManager(Boolean(checked))} />
        <span>
          <span className="block font-medium">Показывать в таск-менеджере</span>
          <span className="text-muted-foreground">Локальная доска StreamDesk, без обязательной доски YouGile.</span>
        </span>
      </label>
      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Отмена</Button>
        <Button type="submit" disabled={saving}>{saving ? "Сохранение..." : "Сохранить"}</Button>
      </div>
    </form>
  );
}

function loadTaskManagerColumns(): { id: string; name: string; order: number }[] {
  if (typeof window === "undefined") return DEFAULT_TASK_COLUMNS;
  try {
    const raw = localStorage.getItem(TASK_MANAGER_COLUMNS_KEY);
    if (!raw) return DEFAULT_TASK_COLUMNS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_TASK_COLUMNS;
    return parsed.map((c: any, i: number) => ({
      id: String(c?.id ?? `col_${i}`),
      name: String(c?.name ?? "Столбец"),
      order: Number(c?.order) ?? i,
    }));
  } catch {
    return DEFAULT_TASK_COLUMNS;
  }
}

function saveTaskManagerColumns(cols: { id: string; name: string; order: number }[]) {
  try {
    localStorage.setItem(TASK_MANAGER_COLUMNS_KEY, JSON.stringify(cols));
  } catch (e) {
    console.warn("saveTaskManagerColumns", e);
  }
}

function normalizeParticipantIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean)));
}

function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

export default function Projects() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [assignedFilter, setAssignedFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const { toast } = useToast();

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["/api/projects"],
  });

  const { data: users = [] } = useQuery({
    queryKey: ["/api/users"],
  });

  const { data: equipmentOnProjects = [] } = useQuery<Array<{ projectId: string; equipmentId: string }>>({
    queryKey: ["/api/equipment-on-projects"],
  });

  const { data: yougileProjects = [] } = useQuery<Array<{ id: string; title?: string }>>({
    queryKey: ["/api/yougile/projects"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/yougile/projects");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const syncYougileMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/yougile/sync-projects", {});
      return res.json();
    },
    onSuccess: (data: { synced?: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      if (data?.synced) toast({ title: "Синхронизация", description: `Добавлено проектов из YouGile: ${data.synced}` });
    },
  });

  useEffect(() => {
    if (yougileProjects.length === 0) return;
    apiRequest("POST", "/api/yougile/sync-projects", {})
      .then((r) => r.ok && r.json())
      .then((data: { synced?: number } | undefined) => {
        if (data?.synced) queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      })
      .catch(() => {});
  }, [yougileProjects.length]);

  const form = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: "",
      client: "",
      description: "",
      status: "planning",
      category: "",
      deadline: "",
      assignedTo: "",
      participants: [],
      showInTaskManager: false,
      createYougileBoard: false,
      devices: [],
      storageLocation: "",
      estimatedSize: "",
      notes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: ProjectFormData) => {
      const response = await apiRequest("POST", "/api/projects", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Успешно", description: "Проект создан" });
      setIsFormOpen(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Ошибка", description: "Не удалось создать проект", variant: "destructive" });
    },
  });

  const importYougileProjectMutation = useMutation({
    mutationFn: async (project: { id: string; title?: string }) => {
      const name = (project.title || "Проект YouGile").trim() || "Проект YouGile";
      const boardsRes = await apiRequest("GET", `/api/yougile/boards?projectId=${encodeURIComponent(project.id)}`);
      const boards = boardsRes.ok ? await boardsRes.json() : [];
      const firstBoard = boards[0];
      const existing = (queryClient.getQueryData(["/api/projects"]) as any[]) || [];
      if (firstBoard?.id && existing.some((p: any) => p.yougileBoardId === firstBoard.id)) {
        throw new Error("Этот проект уже в видеопроектах");
      }
      const payload: { name: string; status: string; yougileBoardId?: string; showInTaskManager?: boolean } = {
        name,
        status: "planning",
        showInTaskManager: true,
      };
      if (firstBoard?.id) payload.yougileBoardId = firstBoard.id;
      const res = await apiRequest("POST", "/api/projects", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/yougile/projects"] });
      toast({ title: "Готово", description: "Проект из YouGile добавлен в видеопроекты" });
    },
    onError: (e: any) => {
      toast({ title: "Ошибка", description: e?.message || "Не удалось добавить проект", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ProjectFormData> }) => {
      const response = await apiRequest("PUT", `/api/projects/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Успешно", description: "Проект обновлён" });
      setSelectedProject(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Успешно", description: "Проект удалён" });
    },
  });

  const [projectForStats, setProjectForStats] = useState<any>(null);
  const [projectForAddColumn, setProjectForAddColumn] = useState<any>(null);

  const linkBoardMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/link-yougile-board`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Готово", description: "Доска YouGile создана и привязана" });
    },
    onError: (e: any) => {
      toast({ title: "Ошибка", description: e?.message || "Не удалось создать доску", variant: "destructive" });
    },
  });

  const addColumnMutation = useMutation({
    mutationFn: async ({ boardId, title }: { boardId: string; title: string }) => {
      const res = await apiRequest("POST", "/api/yougile/columns", { boardId, title });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message || "Ошибка создания колонки");
      }
      return res.json();
    },
    onSuccess: () => {
      setProjectForAddColumn(null);
      queryClient.invalidateQueries({ queryKey: ["/api/yougile/columns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/yougile/boards-all"] });
      toast({ title: "Готово", description: "Колонка добавлена на доску" });
    },
    onError: (e: any) => {
      toast({ title: "Ошибка", description: e?.message || "Не удалось добавить колонку", variant: "destructive" });
    },
  });

  const filteredProjects = (projects as any[]).filter((item) => {
    const participantIds = normalizeParticipantIds(item.participants);
    const matchesSearch = item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.client?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;
    const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
    const matchesAssigned = assignedFilter === "all" || item.assignedTo === assignedFilter || participantIds.includes(assignedFilter);
    return matchesSearch && matchesStatus && matchesCategory && matchesAssigned;
  });

  const equipmentCountByProject = equipmentOnProjects.reduce<Record<string, number>>((acc, item) => {
    const key = String(item.projectId || "").trim();
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const exportProjectsToExcel = () => {
    const BOM = "\uFEFF";
    const statusLabels: Record<string, string> = {
      planning: "Планирование",
      filming: "Съёмка",
      editing: "Монтаж",
      review: "На проверке",
      completed: "Завершён",
      archived: "В архиве",
    };
    const headers = ["Название", "Описание", "Статус", "Категория", "Ответственный", "Дедлайн"];
    const rows = filteredProjects.map((p: any) => [
      p.name ?? "",
      p.description ?? "",
      statusLabels[p.status] ?? p.status ?? "",
      p.category ?? "",
      getUserName(p.assignedTo),
      p.deadline ? format(new Date(p.deadline), "dd.MM.yyyy", { locale: ru }) : "",
    ]);
    const csv = [headers.join(";"), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))].join("\r\n");
    const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `видеопроекты_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Выгружено", description: `Экспорт ${filteredProjects.length} проектов. Откройте в Excel.` });
  };

  const onSubmit = (data: ProjectFormData) => {
    createMutation.mutate(data);
  };

  const getUserName = (userId: string) => {
    const user = (users as any[]).find(u => u.id === userId);
    return user?.name || "Не назначен";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground mt-1">Управление файлами и устройствами для монтажа</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportProjectsToExcel} disabled={filteredProjects.length === 0} title="Выгрузить текущий список в Excel">
            <FileExcelIcon className="w-4 h-4 mr-1.5" />
            В Excel
          </Button>
          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button className="dark:neon-glow-purple" data-testid="button-add-project">
              <Plus className="w-4 h-4 mr-2" />
              Новый проект
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto hide-scrollbar">
            <DialogHeader>
              <DialogTitle>Создать проект</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Название проекта *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Название проекта" data-testid="input-project-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Описание</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Описание проекта (при необходимости)" rows={3} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="assignedTo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Участник</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                        value={field.value || "__none__"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Выберите участника" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">Не назначен</SelectItem>
                          {(users as any[]).map((user: any) => (
                            <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="participants"
                  render={({ field }) => {
                    const selected = normalizeParticipantIds(field.value);
                    return (
                      <FormItem>
                        <FormLabel>Участники проекта</FormLabel>
                        <FormControl>
                          <div className="max-h-48 overflow-y-auto rounded-lg border bg-background p-2 space-y-2">
                            {(users as any[]).length === 0 ? (
                              <p className="text-sm text-muted-foreground px-2 py-1">Пользователей пока нет</p>
                            ) : (
                              (users as any[]).map((user: any) => (
                                <label key={user.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60">
                                  <Checkbox
                                    checked={selected.includes(user.id)}
                                    onCheckedChange={() => field.onChange(toggleId(selected, user.id))}
                                  />
                                  <span className="min-w-0">
                                    <span className="block truncate">{user.name || user.username || user.id}</span>
                                    {user.email && <span className="block truncate text-xs text-muted-foreground">{user.email}</span>}
                                  </span>
                                </label>
                              ))
                            )}
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
                <FormField
                  control={form.control}
                  name="showInTaskManager"
                  render={({ field }) => (
                    <FormItem>
                      <label className="flex items-start gap-2 rounded-lg border bg-muted/20 p-3 text-sm">
                        <Checkbox checked={Boolean(field.value)} onCheckedChange={(checked) => field.onChange(Boolean(checked))} />
                        <span>
                          <span className="block font-medium">Показывать в таск-менеджере</span>
                          <span className="text-muted-foreground">Создать локальную доску StreamDesk без обязательного YouGile.</span>
                        </span>
                      </label>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="createYougileBoard"
                  render={({ field }) => (
                    <FormItem>
                      <label className="flex items-start gap-2 rounded-lg border bg-muted/20 p-3 text-sm">
                        <Checkbox checked={Boolean(field.value)} onCheckedChange={(checked) => field.onChange(Boolean(checked))} />
                        <span>
                          <span className="block font-medium">Создать доску в YouGile</span>
                          <span className="text-muted-foreground">Опционально. Оставьте выключенным для сотрудников без YouGile.</span>
                        </span>
                      </label>
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Создание..." : "Создать проект"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Фильтры и статистика */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] bg-background">
            <SelectValue placeholder="Статус" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            {Object.entries(statusConfig).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px] bg-background">
            <SelectValue placeholder="Категория" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все категории</SelectItem>
            {categoryOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={assignedFilter} onValueChange={setAssignedFilter}>
          <SelectTrigger className="w-[180px] bg-background">
            <SelectValue placeholder="Сотрудник" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все сотрудники</SelectItem>
            {(users as any[]).map((u: any) => (
              <SelectItem key={u.id} value={u.id}>{u.name || u.username || u.id}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">Найдено: {filteredProjects.length}</span>
      </div>

      {/* Проекты из YouGile — добавляются именно проекты; новые проекты из YouGile подтягиваются синхронизацией */}
      {yougileProjects.length > 0 && (
        <Card className="border-dashed border-primary/40 bg-muted/20">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-primary" />
                  Проекты из YouGile
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Проекты, созданные в YouGile. Добавьте в видеопроекты — привяжется первая доска. Новые проекты/доски из YouGile появятся после синхронизации.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={syncYougileMutation.isPending}
                onClick={() => syncYougileMutation.mutate()}
              >
                {syncYougileMutation.isPending ? "Синхронизация…" : "Синхронизировать"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {yougileProjects.map((project) => (
                <div
                  key={project.id}
                  className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm"
                >
                  <span className="font-medium truncate max-w-[180px]" title={project.title || project.id}>
                    {project.title || "Без названия"}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={importYougileProjectMutation.isPending}
                    onClick={() => importYougileProjectMutation.mutate(project)}
                  >
                    {importYougileProjectMutation.isPending ? "…" : "В видеопроекты"}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredProjects.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <Film className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Проекты не найдены</p>
            <p className="text-sm text-muted-foreground mt-1">Создайте первый видеопроект</p>
          </div>
        ) : (
          filteredProjects.map((project: any) => (
              <Card 
                key={project.id} 
                className="dark:border-border/50 dark:hover:border-primary/50 transition-all hover:shadow-lg"
                data-testid={`project-card-${project.id}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center shrink-0">
                      <Film className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-lg line-clamp-1">{project.name}</CardTitle>
                      {equipmentCountByProject[project.id] > 0 && (
                        <div className="mt-2">
                          <Badge variant="secondary" className="inline-flex items-center gap-1">
                            <HardDrive className="h-3.5 w-3.5" />
                            {equipmentCountByProject[project.id]} на проекте
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {project.description && (
                    <p className="text-sm text-muted-foreground line-clamp-3">{project.description}</p>
                  )}
                  {project.assignedTo && (
                    <div className="flex items-center gap-2 text-sm">
                      <User className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span>{getUserName(project.assignedTo)}</span>
                    </div>
                  )}
                  {normalizeParticipantIds(project.participants).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {normalizeParticipantIds(project.participants).slice(0, 4).map((userId) => (
                        <Badge key={userId} variant="secondary" className="text-[11px]">
                          {getUserName(userId)}
                        </Badge>
                      ))}
                      {normalizeParticipantIds(project.participants).length > 4 && (
                        <Badge variant="outline" className="text-[11px]">
                          +{normalizeParticipantIds(project.participants).length - 4}
                        </Badge>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="shrink-0 min-w-[7rem]"
                      onClick={() => setSelectedProject(project)}
                    >
                      <Edit className="w-4 h-4 mr-1 shrink-0" />
                      Изменить
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="shrink-0 min-w-[7rem]"
                      title="Статистика по задачам"
                      onClick={() => setProjectForStats(project)}
                    >
                      <BarChart3 className="w-4 h-4 mr-1 shrink-0" />
                      Статистика
                    </Button>
                    {project.showInTaskManager ? (
                      <Link href="/tasks">
                        <Button variant="outline" size="sm" className="shrink-0 min-w-[5rem]" title="Открыть локальную доску проекта в таск-менеджере">
                          <ListTodo className="w-4 h-4 mr-1 shrink-0" />
                          Таск
                        </Button>
                      </Link>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 min-w-[7rem]"
                        title="Показывать проект как локальную доску StreamDesk"
                        disabled={updateMutation.isPending}
                        onClick={() => updateMutation.mutate({ id: project.id, data: { showInTaskManager: true } })}
                      >
                        <ListTodo className="w-4 h-4 mr-1 shrink-0" />
                        В таск
                      </Button>
                    )}
                    {project.yougileBoardId ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 min-w-[7rem]"
                          title="Добавить колонку на доску YouGile"
                          disabled={addColumnMutation.isPending}
                          onClick={() => setProjectForAddColumn(project)}
                        >
                          <Columns className="w-4 h-4 mr-1 shrink-0" />
                          Колонка
                        </Button>
                        <Badge variant="outline" className="h-8 px-2 inline-flex items-center gap-1">
                          <Link2 className="w-3.5 h-3.5" />
                          YouGile
                        </Badge>
                      </>
                    ) : (
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="shrink-0 min-w-[7rem]"
                        title="Создать и привязать доску YouGile"
                        disabled={linkBoardMutation.isPending}
                        onClick={() => linkBoardMutation.mutate(project.id)}
                      >
                        {linkBoardMutation.isPending ? (
                          <span className="inline-flex items-center gap-1"><span className="animate-pulse">…</span>YouGile</span>
                        ) : (
                          <><Link2 className="w-4 h-4 mr-1 shrink-0" />YouGile</>
                        )}
                      </Button>
                    )}
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="shrink-0 min-w-[2.5rem] text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        if (confirm(`Точно удалить проект "${project.name || "без названия"}"?`)) {
                          deleteMutation.mutate(project.id);
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
        )}
      </div>

      {/* Редактирование проекта: название, описание, участник */}
      <Dialog open={!!selectedProject} onOpenChange={(open) => !open && setSelectedProject(null)}>
        <DialogContent className="max-w-md bg-background text-foreground">
          <DialogHeader>
            <DialogTitle>Изменить проект</DialogTitle>
          </DialogHeader>
          {selectedProject && (
            <EditProjectForm
              project={selectedProject}
              users={Array.isArray(users) ? users : []}
              onSuccess={() => {
                setSelectedProject(null);
                queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
                toast({ title: "Проект обновлён" });
              }}
              onCancel={() => setSelectedProject(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Статистика по задачам проекта */}
      <Dialog open={!!projectForStats} onOpenChange={(open) => !open && setProjectForStats(null)}>
        <DialogContent className="max-w-lg bg-background text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Статистика
              {projectForStats && <span className="font-normal text-muted-foreground">— {projectForStats.name}</span>}
            </DialogTitle>
          </DialogHeader>
          {projectForStats && (
            <ProjectTaskStats projectId={projectForStats.id} onClose={() => setProjectForStats(null)} />
          )}
        </DialogContent>
      </Dialog>

      {/* Добавить колонку на доску YouGile */}
      <Dialog open={!!projectForAddColumn} onOpenChange={(open) => !open && setProjectForAddColumn(null)}>
        <DialogContent className="max-w-sm bg-background text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Columns className="w-5 h-5" />
              Новая колонка
              {projectForAddColumn && <span className="font-normal text-muted-foreground">— {projectForAddColumn.name}</span>}
            </DialogTitle>
          </DialogHeader>
          {projectForAddColumn?.yougileBoardId && (
            <AddColumnForm
              boardId={projectForAddColumn.yougileBoardId}
              onSuccess={() => setProjectForAddColumn(null)}
              onCancel={() => setProjectForAddColumn(null)}
              isLoading={addColumnMutation.isPending}
              onSubmit={(title) => addColumnMutation.mutate({ boardId: projectForAddColumn.yougileBoardId, title })}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
