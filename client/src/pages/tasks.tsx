import { useState, useMemo, useCallback, memo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus, CheckCircle2, Circle,
  Trash2, Edit2, Calendar as CalendarIcon, X, Columns, GripVertical, Check, Filter,
  Paperclip, Link2, Clock, History, FileText, UserPlus, Github, FolderKanban, Tag, Hourglass,
  MessageSquare, ArrowUpDown, ArrowUp, ArrowDown, MoreVertical, Eye, BarChart3, ListTodo
} from "lucide-react";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest, encodeUserHeader, apiUrl, safeJson } from "@/lib/queryClient";
import { type Task, type User as UserType } from "@shared/schema";
import { format, isPast, differenceInDays, differenceInHours } from "date-fns";
import { ru } from "date-fns/locale";
import { Link } from "wouter";

/** Ссылка на задачи YouGile. Синхронизация только автоматическая (раз в минуту), кнопка не показывается. */
function YouGileTasksLink() {
  const { data: status } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/yougile/status"],
    retry: false,
  });
  const { data: config } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/yougile/config"],
    retry: false,
  });
  const enabled = status?.configured || config?.enabled;
  if (!enabled) return null;

  return (
    <Link href="/tasks/yougile">
      <Button size="sm" variant="ghost" className="rounded-xl h-9 sm:h-10 px-3 shrink-0" title="Задачи YouGile">
        YouGile
      </Button>
    </Link>
  );
}

/** Поле быстрого добавления задачи: своё состояние внутри, чтобы при ре-рендере родителя (синхронизация и т.д.) не терялся фокус и ввод. */
function QuickAddTaskInput({
  columnId,
  onAdd,
  disabled,
  placeholder = "Добавить задачу",
  className,
}: {
  columnId: string;
  onAdd: (columnId: string, title: string) => boolean | void | Promise<boolean | void>;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [value, setValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const handleSubmit = async () => {
    const title = value.trim();
    if (!title || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const result = await onAdd(columnId, title);
      if (result !== false) setValue("");
    } catch {
      // Keep the typed title in place; mutation toast already explains the error.
    } finally {
      setIsSubmitting(false);
    }
  };
  return (
    <div className="flex items-center gap-1.5 pt-1">
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSubmit(); } }}
        className={cn(
          className,
          "border-slate-700 bg-slate-950 text-slate-50 placeholder:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50 dark:placeholder:text-slate-500",
          "focus-visible:ring-primary focus-visible:ring-offset-0",
        )}
        disabled={disabled || isSubmitting}
      />
      <Button size="icon" variant="ghost" className="h-8 w-8 sm:h-9 sm:w-9 shrink-0" onClick={handleSubmit} disabled={!value.trim() || disabled || isSubmitting}>
        <Plus className="w-4 h-4" />
      </Button>
    </div>
  );
}

function QuickAddSubtaskInput({ onAdd, className }: { taskId?: string; onAdd: (title: string) => void; className?: string }) {
  const [value, setValue] = useState("");
  const handleSubmit = () => {
    const title = value.trim();
    if (!title) return;
    onAdd(title);
    setValue("");
  };
  return (
    <div className="flex items-center gap-1.5">
      <Input
        placeholder="Добавить подзадачу"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSubmit(); } }}
        className={className}
      />
      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={handleSubmit} disabled={!value.trim()}>
        <Plus className="w-4 h-4" />
      </Button>
    </div>
  );
}

interface Section {
  id: string;
  name: string;
  columns: Column[];
  userId?: string;
  localProjectId?: string;
  yougileBoardId?: string;
  yougileProjectId?: string;
}

interface Column {
  id: string;
  name: string;
  order: number;
}

const DEFAULT_COLUMNS: Column[] = [
  { id: "not_ready", name: "Бэклог", order: 0 },
  { id: "todo", name: "К выполнению", order: 1 },
  { id: "in_progress", name: "В работе", order: 2 },
  { id: "done", name: "Готово", order: 3 },
];

const STORAGE_KEY_COLUMNS = "streamdesk_task_columns";

function getDefaultColumns(): Column[] {
  if (typeof window === "undefined") return DEFAULT_COLUMNS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_COLUMNS);
    if (!raw) return DEFAULT_COLUMNS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_COLUMNS;
    return parsed.map((c: any, i: number) => ({
      id: String(c?.id ?? `col_${i}`),
      name: String(c?.name ?? "Столбец"),
      order: Number(c?.order) ?? i,
    }));
  } catch {
    return DEFAULT_COLUMNS;
  }
}

/** Человекочитаемое название статуса: по колонкам или запасные для todo/in_progress/done/not_ready */
function getStatusLabel(statusId: string | null | undefined, columns: Column[]): string {
  if (!statusId) return "—";
  const fromCol = columns.find(c => c.id === statusId)?.name;
  if (fromCol) return fromCol;
  const fallback: Record<string, string> = {
    not_ready: "Бэклог",
    todo: "К выполнению",
    in_progress: "В работе",
    done: "Готово",
  };
  return fallback[statusId] ?? statusId;
}

const KANBAN_CARD_BG = "bg-card/85 dark:bg-card/90";
const BORDER_BORDER_OPACITY = "border-border/70";
const BG_BACKGROUND_OPACITY = "bg-background/80";

/** Элемент списка стикеров (с доски YouGile или встроенный) */
type StickerPresetItem = { id: string; name: string; color: string; icon?: "archive" | "clock" };

/** Стикер доски YouGile с типом и опциями: list — выбор из списка, string — ввод текста, user — исполнитель */
type BoardStickerItem = { id: string; title: string; type: "list" | "string" | "user"; options?: Array<{ id: string; title?: string }> };

/** Тег задачи с опциональным значением (выбранный вариант или введённый текст) */
type TaskTagWithValue = { id: string; name: string; color?: string; icon?: string; value?: string };

/** Заготовленные стикеры (как в YouGile) — можно добавлять к задаче и отмечать */
const STICKER_PRESETS: StickerPresetItem[] = [
  { id: "archive", name: "Архив", color: "slate", icon: "archive" },
  { id: "urgent", name: "Срочно", color: "red", icon: "clock" },
  { id: "in-work", name: "В работе", color: "blue" },
  { id: "review", name: "На проверке", color: "amber" },
  { id: "lecture", name: "Лекция", color: "violet" },
  { id: "lab", name: "Лаба", color: "green", icon: "clock" },
];

function getStickerClass(color: string | undefined): string {
  const map: Record<string, string> = {
    slate: "bg-slate-500/90 text-white dark:bg-slate-600",
    red: "bg-red-500/90 text-white dark:bg-red-600",
    green: "bg-emerald-500/90 text-white dark:bg-emerald-600",
    blue: "bg-blue-500/90 text-white dark:bg-blue-600",
    amber: "bg-amber-500/90 text-amber-950 dark:bg-amber-500 dark:text-amber-950",
    violet: "bg-violet-500/90 text-white dark:bg-violet-600",
  };
  return map[color ?? "slate"] ?? map.slate;
}

function getCurrentUser() {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem('streamstudio_user') || 'null');
  } catch {
    return null;
  }
}

const MULTI_ASSIGNEE_TAG_ID = "streamdesk-assignee";
const KANBAN_ORDER_TAG_ID = "streamdesk-kanban-order";

function getTaskAssigneeIds(task: Task | null | undefined): string[] {
  if (!task) return [];
  const ids = new Set<string>();
  if (task.assigneeId) ids.add(String(task.assigneeId));
  const tags = Array.isArray((task as any).tags) ? (task as any).tags : [];
  for (const tag of tags) {
    if (tag?.id === MULTI_ASSIGNEE_TAG_ID && tag?.value) ids.add(String(tag.value));
  }
  return Array.from(ids);
}

function buildAssigneeTags(task: Task, assigneeIds: string[], users: UserType[]) {
  const existing = (Array.isArray((task as any).tags) ? (task as any).tags : []).filter((tag: any) => tag?.id !== MULTI_ASSIGNEE_TAG_ID);
  const nextAssigneeTags = assigneeIds.map((id) => ({
    id: MULTI_ASSIGNEE_TAG_ID,
    name: "Исполнитель",
    value: id,
    color: "blue",
    icon: "user",
    label: users.find((user) => user.id === id)?.name || id,
  }));
  return [...existing, ...nextAssigneeTags];
}

function getTaskOrder(task: Task | null | undefined, boardKey: string): number | null {
  const tags = Array.isArray((task as any)?.tags) ? (task as any).tags : [];
  const tag = tags.find((item: any) => item?.id === KANBAN_ORDER_TAG_ID && String(item?.value || "") === boardKey);
  const order = Number(tag?.order);
  return Number.isFinite(order) ? order : null;
}

function withTaskOrderTag(task: Task, boardKey: string, columnId: string, order: number) {
  const tags = Array.isArray((task as any).tags) ? (task as any).tags : [];
  const clean = tags.filter((tag: any) => !(tag?.id === KANBAN_ORDER_TAG_ID && String(tag?.value || "") === boardKey));
  return [
    ...clean,
    {
      id: KANBAN_ORDER_TAG_ID,
      name: "Kanban order",
      value: boardKey,
      columnId,
      order,
    },
  ];
}

function makeLocalAttachment(file: File) {
  return {
    id: `file-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: file.name,
    size: file.size,
    type: file.type,
    url: URL.createObjectURL(file),
  };
}

/** Разделы только «Мои задачи» (локально). Доски — только из YouGile, подгружаются по API. */
function loadSections(_users: UserType[] = [], currentUser: any = null): Section[] {
  if (typeof window === 'undefined') return [];
  const cols = getDefaultColumns();
  return [{ id: 'my-tasks', name: 'Мои задачи', columns: cols, userId: currentUser?.id }];
}

function saveSections(sections: Section[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('streamdesk_task_sections', JSON.stringify(sections));
  } catch (error) {
    console.error("[Tasks] Error saving sections:", error);
  }
}

const priorities = [
  { id: "low", label: "Низкий", color: "bg-gray-500" },
  { id: "medium", label: "Средний", color: "bg-blue-500" },
  { id: "high", label: "Высокий", color: "bg-orange-500" },
  { id: "urgent", label: "Срочный", color: "bg-red-500" },
];

// Генерация месяцев и чисел
const months = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
];

const getDaysInMonth = (month: number, year: number) => {
  return new Date(year, month + 1, 0).getDate();
};

const timeOptions = ["00", "15", "30", "45"];

// Функция для получения цвета дедлайна (принимает ISO-строку или Date из API/схемы)
function getDeadlineColor(dueDate: string | Date | null | undefined): string {
  if (dueDate == null) return "bg-gray-500";
  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  const now = new Date();
  const daysLeft = differenceInDays(due, now);
  const hoursLeft = differenceInHours(due, now);
  const isOverdue = isPast(due);

  if (isOverdue) {
    return "bg-red-500";
  } else if (hoursLeft < 24) {
    return "bg-red-400";
  } else if (daysLeft < 3) {
    return "bg-orange-500";
  } else if (daysLeft < 7) {
    return "bg-yellow-500";
  } else if (daysLeft < 30) {
    return "bg-blue-500";
  } else {
    return "bg-green-500";
  }
}

export default function Tasks() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSectionFormOpen, setIsSectionFormOpen] = useState(false);
  const [isColumnFormOpen, setIsColumnFormOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [newColumnName, setNewColumnName] = useState("");
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingColumnName, setEditingColumnName] = useState("");
  const [newBoardMemberIds, setNewBoardMemberIds] = useState<string[]>([]);
  const [isCreatingBoard, setIsCreatingBoard] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState<string>("my-tasks");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const boardNameInputRef = useRef<HTMLInputElement>(null);
  const columnNameInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskStatus, setNewTaskStatus] = useState("todo");
  const [newTaskPriority, setNewTaskPriority] = useState("medium");
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState<string>("");
  // Состояния для выбора дедлайна
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDate());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedHour, setSelectedHour] = useState<string>("00");
  const [selectedMinute, setSelectedMinute] = useState<string>("00");
  const [newTaskDueDate, setNewTaskDueDate] = useState<string>("");

  // Состояния для подзадач и файлов
  const [subtasks, setSubtasks] = useState<Array<{ id: string; title: string; completed: boolean }>>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<Array<{ id: string; name: string; url: string }>>([]);
  const [newTaskTags, setNewTaskTags] = useState<TaskTagWithValue[]>([]);
  /** Значения стикеров доски при создании: id стикера → выбранное/введённое значение */
  const [newTaskStickerValues, setNewTaskStickerValues] = useState<Record<string, string>>({});
  /** В просмотре задачи: значение стикера доски перед добавлением (id → значение) */
  const [editingStickerValues, setEditingStickerValues] = useState<Record<string, string>>({});
  const [selectedTaskForView, setSelectedTaskForView] = useState<Task | null>(null);
  const [taskDetailTab, setTaskDetailTab] = useState<"info" | "comments" | "history">("info");

  // Дополнительные поля для задачи
  const [newTaskRepository, setNewTaskRepository] = useState<string>("");
  const [newTaskProject, setNewTaskProject] = useState<string>("");
  const [newTaskCategory, setNewTaskCategory] = useState<string>("");
  const [newTaskEstimatedHours, setNewTaskEstimatedHours] = useState<string>("");
  const [newTaskLinks, setNewTaskLinks] = useState<Array<{ title: string; url: string }>>([]);
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");

  // Фильтры и сортировка
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"priority" | "dueDate" | "createdAt" | "title">("priority");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isBoardDragging, setIsBoardDragging] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const boardScrollRef = useRef<HTMLDivElement | null>(null);
  const boardScrollLeftRef = useRef(0);
  const [deadlinePopoverOpen, setDeadlinePopoverOpen] = useState(false);
  const [priorityPopoverOpen, setPriorityPopoverOpen] = useState(false);

  // Комментарии и история
  const [taskComments, setTaskComments] = useState<Record<string, any[]>>({});
  const [taskHistory, setTaskHistory] = useState<Record<string, any[]>>({});
  const [newComment, setNewComment] = useState<Record<string, string>>({});
  const [isLoadingComments, setIsLoadingComments] = useState<Record<string, boolean>>({});
  const [isLoadingHistory, setIsLoadingHistory] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (selectedTaskForView?.id) setTaskDetailTab("info");
  }, [selectedTaskForView?.id]);

  // Загрузка комментариев и истории при открытии задачи
  // Load comments/history lazily so opening the task detail panel does not shake the board.
  useEffect(() => {
    if (!selectedTaskForView?.id) return;
    const taskId = selectedTaskForView.id;

    if (taskDetailTab === "comments" && !taskComments[taskId] && !isLoadingComments[taskId]) {
      setIsLoadingComments(prev => ({ ...prev, [taskId]: true }));
      fetch(apiUrl(`/api/tasks/${taskId}/comments`), { credentials: "include" })
        .then(res => safeJson(res, []))
        .then(data => {
          setTaskComments(prev => ({ ...prev, [taskId]: Array.isArray(data) ? data : [] }));
          setIsLoadingComments(prev => ({ ...prev, [taskId]: false }));
        })
        .catch(() => {
          setTaskComments(prev => ({ ...prev, [taskId]: [] }));
          setIsLoadingComments(prev => ({ ...prev, [taskId]: false }));
        });
    }

    if (taskDetailTab === "history" && !taskHistory[taskId] && !isLoadingHistory[taskId]) {
      setIsLoadingHistory(prev => ({ ...prev, [taskId]: true }));
      fetch(apiUrl(`/api/tasks/${taskId}/history`), { credentials: "include" })
        .then(res => safeJson(res, []))
        .then(data => {
          setTaskHistory(prev => ({ ...prev, [taskId]: Array.isArray(data) ? data : [] }));
          setIsLoadingHistory(prev => ({ ...prev, [taskId]: false }));
        })
        .catch(() => {
          setTaskHistory(prev => ({ ...prev, [taskId]: [] }));
          setIsLoadingHistory(prev => ({ ...prev, [taskId]: false }));
        });
    }
  }, [selectedTaskForView?.id, taskDetailTab, taskComments, taskHistory, isLoadingComments, isLoadingHistory]);

  // Добавление комментария
  const handleAddComment = async (taskId: string) => {
    const commentText = newComment[taskId]?.trim();
    if (!commentText || !currentUser?.id) return;

    try {
      const response = await fetch(apiUrl(`/api/tasks/${taskId}/comments`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: commentText,
          userId: currentUser.id,
        }),
      });

      if (response.ok) {
        const comment = await safeJson(response, null);
        if (!comment) return;
        setTaskComments(prev => ({
          ...prev,
          [taskId]: [...(prev[taskId] || []), comment],
        }));
        setNewComment(prev => ({ ...prev, [taskId]: "" }));
        toast({ title: "Успешно", description: "Комментарий добавлен" });
        if (taskDetailTab === "history" || taskHistory[taskId]) {
          fetch(apiUrl(`/api/tasks/${taskId}/history`), { credentials: "include" })
            .then(res => safeJson(res, []))
            .then(data => {
              setTaskHistory(prev => ({ ...prev, [taskId]: Array.isArray(data) ? data : [] }));
            })
            .catch(() => {});
        }
      }
    } catch (error) {
      toast({ title: "Ошибка", description: "Не удалось добавить комментарий", variant: "destructive" });
    }
  };

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currentUser = getCurrentUser();

  useEffect(() => {
    if (currentUser?.id && newBoardMemberIds.length === 0) {
      setNewBoardMemberIds([String(currentUser.id)]);
    }
  }, [currentUser?.id, newBoardMemberIds.length]);

  // Загрузка пользователей (нужно для создания разделов)
  const { data: users = [] } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
    retry: 1,
  });

  // Загрузка репозиториев
  const { data: repositories = [] } = useQuery<any[]>({
    queryKey: ["/api/repositories"],
    retry: 1,
  });

  // Загрузка проектов (видеопроекты — для создания задач и т.д.)
  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ["/api/projects"],
    retry: 1,
  });

  // Проекты YouGile (первая строка: Мои задачи + названия проектов YouGile). При ошибке не перезаписываем — сохраняем предыдущие данные.
  const { data: yougileProjects = [] } = useQuery<Array<{ id: string; title?: string }>>({
    queryKey: ["/api/yougile/projects"],
    retry: 1,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/yougile/projects"), { credentials: "include" });
      if (!res.ok) throw new Error(res.status === 500 ? "YouGile недоступен" : String(res.status));
      const data = await safeJson(res, [] as any[]);
      return Array.isArray(data) ? data : [];
    },
  });

  const [sections, setSections] = useState<Section[]>(() => loadSections([], currentUser));
  // Выбранная доска (вторая строка): при клике на доску показываем её колонки
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);

  // Первая строка: «Мои задачи» + проекты YouGile (по названиям из YouGile)
  const displaySections = useMemo((): Section[] => {
    const myTasks = sections.find(s => s.id === "my-tasks") ?? {
      id: "my-tasks",
      name: "Мои задачи",
      columns: getDefaultColumns(),
      userId: currentUser?.id,
    };
    const localBoards = (projects || [])
      .filter((project: any) => project?.showInTaskManager || (Array.isArray(project?.columns) && project.columns.length > 0))
      .filter((project: any) => {
        const participants = Array.isArray(project?.participants) ? project.participants.map(String) : [];
        const uid = currentUser?.id ? String(currentUser.id) : "";
        if (currentUser?.role === "admin") return true;
        if (uid && (String(project?.ownerId || "") === uid || String(project?.assignedTo || "") === uid)) return true;
        return participants.length === 0 || (!!uid && participants.includes(uid));
      })
      .map((project: any) => ({
        id: `project-${project.id}`,
        name: project.name || "Доска",
        columns: Array.isArray(project.columns) && project.columns.length > 0
          ? project.columns.map((column: any, index: number) => ({
              id: String(column.id ?? column.name ?? `column-${index}`),
              name: String(column.name ?? column.title ?? "Столбец"),
              order: Number(column.order ?? index),
            }))
          : getDefaultColumns(),
        localProjectId: project.id,
      }));
    const ygProjects = (yougileProjects || []).map((p: any) => ({
      id: "yg-project-" + p.id,
      name: p.title || "Проект",
      columns: [] as Column[],
      yougileProjectId: p.id,
    }));
    return [myTasks, ...localBoards, ...ygProjects];
  }, [sections, projects, yougileProjects, currentUser?.id, currentUser?.role]);

  const selectedYougileProjectId = selectedSectionId?.startsWith("yg-project-") ? selectedSectionId.slice("yg-project-".length) : null;
  const { data: yougileBoardsOfProject = [] } = useQuery<Array<{ id: string; title?: string; projectId?: string }>>({
    queryKey: ["/api/yougile/boards", selectedYougileProjectId],
    queryFn: async () => {
      if (!selectedYougileProjectId) return [];
      try {
        const res = await fetch(apiUrl(`/api/yougile/boards?projectId=${encodeURIComponent(selectedYougileProjectId)}`), { credentials: "include" });
        const data = await safeJson(res, [] as any[]);
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    },
    enabled: !!selectedYougileProjectId,
  });

  // Задачи: для «Мои задачи» — локальные; для выбранной доски YouGile — по yougileBoardId
  const yougileBoardIdForQuery = selectedYougileProjectId && selectedBoardId ? selectedBoardId : null;
  const selectedSectionForQuery = displaySections.find(s => s.id === selectedSectionId) || displaySections[0];

  const { data: tasks = [], isLoading: tasksLoading, isFetching: tasksFetching } = useQuery<Task[]>({
    queryKey: ["/api/tasks", currentUser?.id, yougileBoardIdForQuery ?? "all"],
    retry: 1,
    placeholderData: keepPreviousData,
    refetchInterval: isBoardDragging || isFormOpen || isSectionFormOpen || isColumnFormOpen || selectedTaskForView ? false : 15000,
    refetchIntervalInBackground: true,
    queryFn: async () => {
      try {
        const user = getCurrentUser();
        const headers: HeadersInit = {};
        if (user?.id) headers["x-user"] = encodeUserHeader(user);
        const path = yougileBoardIdForQuery
          ? `/api/tasks?yougileBoardId=${encodeURIComponent(yougileBoardIdForQuery)}`
          : "/api/tasks";
        const response = await fetch(apiUrl(path), { credentials: "include", headers });
        const data = await safeJson(response, [] as any[]);
        return Array.isArray(data) ? data : [];
      } catch (error) {
        console.error("[Tasks] Error:", error);
        return [];
      }
    },
  });

  // Синхронизация с YouGile: при загрузке — все доски (чтобы задачи из YouGile попали в нужные проекты/доски), затем раз в минуту — выбранная доска
  const { data: yougileStatus } = useQuery<{ configured: boolean }>({ queryKey: ["/api/yougile/status"], retry: false });
  useEffect(() => {
    if (!yougileStatus?.configured || selectedTaskForView || isBoardDragging) return;
    const user = getCurrentUser();
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (user?.id) (headers as any)["x-user"] = encodeUserHeader(user);
    const runSync = (boardId?: string) => {
      fetch(apiUrl("/api/yougile/sync"), {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify(boardId ? { boardId } : {}),
      })
        .then((r) => r.ok ? safeJson(r, {}) : Promise.resolve(null))
        .then(() => queryClient.invalidateQueries({ queryKey: ["/api/tasks"] }))
        .catch(() => {});
    };
    runSync(); // сразу синхронизируем все задачи YouGile (без boardId = все доски), чтобы задачи появились в проекте/доске
    runSync(yougileBoardIdForQuery ?? undefined);
    const t = setInterval(() => runSync(yougileBoardIdForQuery ?? undefined), 60 * 1000);
    return () => clearInterval(t);
  }, [yougileStatus?.configured, queryClient, yougileBoardIdForQuery, selectedTaskForView, isBoardDragging]);

  // При смене раздела сбрасываем выбранную доску
  useEffect(() => {
    if (!selectedSectionId?.startsWith("yg-project-")) setSelectedBoardId(null);
  }, [selectedSectionId]);

  // Резервируем место под скроллбар (всегда вызываем хук до любого условного return)
  useEffect(() => {
    document.body.classList.add("scrollbar-gutter-stable");
    return () => document.body.classList.remove("scrollbar-gutter-stable");
  }, []);

  // Текущий «раздел» для канбана: «Мои задачи» или выбранная доска YouGile (с yougileBoardId для колонок и задач)
  const currentSection = useMemo(() => {
    if (selectedSectionId === "my-tasks" || !selectedSectionId) {
      return displaySections.find(s => s.id === "my-tasks") || displaySections[0];
    }
    if (selectedYougileProjectId && selectedBoardId) {
      const board = yougileBoardsOfProject.find((b: any) => b.id === selectedBoardId);
      return {
        id: "board-" + selectedBoardId,
        name: board?.title || "Доска",
        columns: [] as Column[],
        yougileBoardId: selectedBoardId,
      };
    }
    return displaySections.find(s => s.id === selectedSectionId) || displaySections[0];
  }, [selectedSectionId, selectedYougileProjectId, selectedBoardId, displaySections, yougileBoardsOfProject]);

  const isYouGileBoard = !!currentSection?.yougileBoardId;
  const { data: yougileColumnsRaw = [] } = useQuery<Array<{ id: string; title?: string; order?: number }>>({
    queryKey: ["/api/yougile/columns", currentSection?.yougileBoardId],
    queryFn: async () => {
      if (!currentSection?.yougileBoardId) return [];
      try {
        const res = await apiRequest("GET", `/api/yougile/columns?boardId=${encodeURIComponent(currentSection.yougileBoardId)}`);
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    },
    enabled: !!currentSection?.yougileBoardId,
  });

  const { data: projectColumnsRaw = [] } = useQuery<Array<{ id: string; name?: string; order?: number }>>({
    queryKey: ["/api/projects", currentSection?.localProjectId, "columns"],
    queryFn: async () => {
      if (!currentSection?.localProjectId) return [];
      try {
        const res = await apiRequest("GET", `/api/projects/${encodeURIComponent(currentSection.localProjectId)}/columns`);
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    },
    enabled: !!currentSection?.localProjectId,
    refetchInterval: isBoardDragging || isColumnFormOpen || editingColumnId || selectedTaskForView ? false : 5000,
    refetchIntervalInBackground: true,
  });

  // Стикеры доски YouGile с типом и опциями (list = выпадающий список, string = ввод, user = исполнитель)
  const { data: boardStickersRaw = [] } = useQuery<BoardStickerItem[]>({
    queryKey: ["/api/yougile/stickers", currentSection?.yougileBoardId],
    queryFn: async () => {
      if (!currentSection?.yougileBoardId) return [];
      try {
        const res = await fetch(apiUrl(`/api/yougile/stickers?boardId=${encodeURIComponent(currentSection.yougileBoardId)}`), { credentials: "include" });
        const data = await safeJson(res, [] as any[]);
        const list = Array.isArray(data) ? data : [];
        return list.map((s: any) => ({
          id: s.id,
          title: s.title ?? s.id,
          type: (s.type === "user" || s.type === "list" || s.type === "string" ? s.type : "string") as "list" | "string" | "user",
          options: Array.isArray(s.options) ? s.options : undefined,
        }));
      } catch {
        return [];
      }
    },
    enabled: !!currentSection?.yougileBoardId,
  });

  // Объединённый список плашек для отображения на карточках: доска YouGile + встроенные пресеты
  const effectiveStickerPresets = useMemo((): StickerPresetItem[] => {
    const fromBoard: StickerPresetItem[] = (boardStickersRaw || []).map((s) => ({
      id: s.id,
      name: s.title || s.id,
      color: "slate",
      icon: undefined,
    }));
    const seen = new Set<string>(fromBoard.map((p) => p.id.toLowerCase()));
    const presets: StickerPresetItem[] = fromBoard.slice();
    for (const p of STICKER_PRESETS) {
      const key = (p.id || p.name).toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        presets.push({ id: p.id, name: p.name, color: p.color, icon: p.icon });
      }
    }
    return presets;
  }, [boardStickersRaw]);

  const effectiveColumns = useMemo(() => {
    if (!currentSection) return [];
    if (isYouGileBoard && Array.isArray(yougileColumnsRaw) && yougileColumnsRaw.length > 0) {
      return yougileColumnsRaw
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((c, i) => ({ id: c.id, name: c.title || "Столбец", order: c.order ?? i }));
    }
    if (currentSection.localProjectId && Array.isArray(projectColumnsRaw) && projectColumnsRaw.length > 0) {
      return projectColumnsRaw
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((c, i) => ({ id: c.id, name: c.name || "Столбец", order: c.order ?? i }));
    }
    return Array.isArray(currentSection.columns) ? currentSection.columns : [];
  }, [currentSection, isYouGileBoard, yougileColumnsRaw, projectColumnsRaw]);

  const allColumnIds = useMemo(() => effectiveColumns.map((col) => col.id), [effectiveColumns]);
  const boardOrderKey = useMemo(() => {
    if (currentSection?.localProjectId) return `project:${currentSection.localProjectId}`;
    if (currentSection?.yougileBoardId) return `yougile:${currentSection.yougileBoardId}`;
    return "my-tasks";
  }, [currentSection?.localProjectId, currentSection?.yougileBoardId]);

  // Фильтрация и сортировка задач
  const filteredTasks = useMemo(() => {
    let filtered = tasks.filter(task => {
      if (!task) return false;
      // Доска YouGile: задачи уже пришли по yougileBoardId с API
      if (currentSection?.yougileBoardId) {
        if ((task as any).yougileBoardId !== currentSection.yougileBoardId) return false;
        if (!allColumnIds.includes(task.status || "")) return false;
      } else {
        // «Мои задачи»: по пользователю и по столбцу
        if (currentSection?.id === "my-tasks" && currentSection?.userId) {
          if (task.assigneeId !== currentSection.userId && task.creatorId !== currentSection.userId) return false;
        }
        if (currentSection?.localProjectId && task.projectId !== currentSection.localProjectId) return false;
        if (!allColumnIds.includes(currentSection?.localProjectId ? String((task as any).projectColumnId || task.status || "") : String(task.status || ""))) return false;
      }
      const matchesSearch = !searchTerm ||
        task.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.description?.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;
      if (filterPriority !== "all" && task.priority !== filterPriority) return false;
      if (filterCategory !== "all" && task.category !== filterCategory) return false;
      if (filterAssignee !== "all") {
        if (filterAssignee === "unassigned" && task.assigneeId) return false;
        if (filterAssignee !== "unassigned" && task.assigneeId !== filterAssignee) return false;
      }
      return true;
    });

    // Сортировка
    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "priority":
          const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
          comparison = (priorityOrder[b.priority as keyof typeof priorityOrder] || 0) -
                      (priorityOrder[a.priority as keyof typeof priorityOrder] || 0);
          break;
        case "dueDate":
          const aDate = a.dueDate ? new Date(a.dueDate).getTime() : 0;
          const bDate = b.dueDate ? new Date(b.dueDate).getTime() : 0;
          comparison = aDate - bDate;
          break;
        case "createdAt":
          const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          comparison = bCreated - aCreated;
          break;
        case "title":
          comparison = (a.title || "").localeCompare(b.title || "", "ru");
          break;
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

    return filtered;
  }, [tasks, allColumnIds, searchTerm, currentSection, filterPriority, filterCategory, filterAssignee, sortBy, sortOrder]);

  // Для раздела «Мои задачи»: только задачи, назначенные мне или созданные мной (по API)
  const myTasksActive = useMemo(() => {
    if (!currentUser?.id) return [];
    return tasks.filter(
      (t) => (t.assigneeId === currentUser.id || t.creatorId === currentUser.id) && t.status !== "done"
    );
  }, [tasks, currentUser?.id]);
  const myTasksCompleted = useMemo(() => {
    if (!currentUser?.id) return [];
    return tasks
      .filter((t) => (t.assigneeId === currentUser.id || t.creatorId === currentUser.id) && t.status === "done")
      .sort((a, b) => (b.completedAt ? new Date(b.completedAt).getTime() : 0) - (a.completedAt ? new Date(a.completedAt).getTime() : 0));
  }, [tasks, currentUser?.id]);

  // Группировка задач по столбцам (статус = id колонки; для YouGile доски — id колонки YouGile)
  const tasksByColumn = useMemo(() => {
    const result: Record<string, Task[]> = {};
    effectiveColumns.forEach(col => {
      result[col.id] = filteredTasks.filter(t => {
        const taskColumnId = currentSection?.localProjectId
          ? String((t as any)?.projectColumnId || t?.status || "")
          : String(t?.status || "");
        return taskColumnId === col.id;
      }).sort((a, b) => {
        const orderA = getTaskOrder(a, boardOrderKey);
        const orderB = getTaskOrder(b, boardOrderKey);
        if (orderA != null || orderB != null) {
          return (orderA ?? Number.MAX_SAFE_INTEGER) - (orderB ?? Number.MAX_SAFE_INTEGER);
        }
        return 0;
      });
    });
    return result;
  }, [boardOrderKey, currentSection?.localProjectId, effectiveColumns, filteredTasks]);

  // Мемоизированные функции для производительности
  const memoizedGetUserName = useCallback((userId: string | null) => {
    if (!userId) return null;
    const user = users.find(u => u.id === userId);
    return user?.name || null;
  }, [users]);

  const memoizedGetUserAvatar = useCallback((userId: string | null) => {
    if (!userId) return null;
    const user = users.find(u => u.id === userId);
    return user?.avatar || null;
  }, [users]);

  const memoizedGetUserInitials = useCallback((userId: string | null) => {
    if (!userId) return null;
    const user = users.find(u => u.id === userId);
    if (!user?.name) return null;
    const parts = user.name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return user.name.substring(0, 2).toUpperCase();
  }, [users]);

  // Создание раздела
  const handleCreateSection = async () => {
    const sectionName = (boardNameInputRef.current?.value ?? newSectionName).trim();
    if (!sectionName) {
      toast({
        title: "Ошибка",
        description: "Введите название раздела",
        variant: "destructive"
      });
      return;
    }
    if (isCreatingBoard) return;

    try {
      setIsCreatingBoard(true);
      const participants = newBoardMemberIds.length
        ? newBoardMemberIds
        : (currentUser?.id ? [String(currentUser.id)] : []);
      const response = await apiRequest("POST", "/api/projects", {
        name: sectionName,
        status: "planning",
        showInTaskManager: true,
        ownerId: currentUser?.id ?? null,
        participants,
        columns: getDefaultColumns(),
      });
      const project = await response.json();
      const projectForBoard = {
        ...project,
        showInTaskManager: true,
        participants,
        columns: getDefaultColumns(),
      };
      queryClient.setQueryData<any[]>(["/api/projects"], (prev) => {
        const list = Array.isArray(prev) ? prev : [];
        return [projectForBoard, ...list.filter((item) => item?.id !== project.id)];
      });
      await Promise.all(getDefaultColumns().map((column) =>
        apiRequest("POST", `/api/projects/${encodeURIComponent(project.id)}/columns`, { name: column.name }).catch(() => undefined)
      ));
      setSelectedSectionId(`project-${project.id}`);
      setNewSectionName("");
      if (boardNameInputRef.current) boardNameInputRef.current.value = "";
      setNewBoardMemberIds(currentUser?.id ? [String(currentUser.id)] : []);
      setIsSectionFormOpen(false);
      toast({ title: "Готово", description: "Доска создана" });
      window.setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "columns"] });
      }, 300);
      return;
    } catch (error: any) {
      toast({ title: "Ошибка", description: error?.message || "Не удалось создать доску", variant: "destructive" });
      return;
    } finally {
      setIsCreatingBoard(false);
    }

    const newSection: Section = {
      id: `section-${Date.now()}`,
      name: sectionName,
      columns: [...getDefaultColumns()],
    };

    const updatedSections = [...sections, newSection];
    setSections(updatedSections);
    saveSections(updatedSections);
    setSelectedSectionId(newSection.id);
    setNewSectionName("");
    const boardNameInput = boardNameInputRef.current;
    if (boardNameInput) boardNameInput.value = "";
    setIsSectionFormOpen(false);
    toast({ title: "Успешно", description: "Раздел создан" });
  };

  useEffect(() => {
    if (currentUser && !sections.find(s => s.id === 'my-tasks')) {
      const myTasksSection = {
        id: 'my-tasks',
        name: 'Мои задачи',
        columns: getDefaultColumns(),
        userId: currentUser.id,
      };
      setSections([myTasksSection]);
      saveSections([myTasksSection]);
      setSelectedSectionId('my-tasks');
    }
  }, [currentUser]);

  // Создание столбца
  const handleCreateColumn = () => {
    const columnName = (columnNameInputRef.current?.value ?? newColumnName).trim();
    if (!columnName) {
      toast({
        title: "Ошибка",
        description: "Введите название столбца",
        variant: "destructive"
      });
      return;
    }

    if (currentSection?.localProjectId) {
      apiRequest("POST", `/api/projects/${encodeURIComponent(currentSection.localProjectId)}/columns`, { name: columnName })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/projects", currentSection.localProjectId, "columns"] });
          setNewColumnName("");
          if (columnNameInputRef.current) columnNameInputRef.current.value = "";
          setIsColumnFormOpen(false);
          toast({ title: "Успешно", description: "Столбец создан" });
        })
        .catch((error: any) => {
          toast({ title: "Ошибка", description: error?.message || "Не удалось создать столбец", variant: "destructive" });
        });
      return;
    }

    const sectionIndex = sections.findIndex(s => s.id === selectedSectionId);
    if (sectionIndex === -1) return;

    const newColumn: Column = {
      id: `column-${Date.now()}`,
      name: columnName,
      order: sections[sectionIndex].columns.length,
    };

    const updatedSections = [...sections];
    updatedSections[sectionIndex] = {
      ...updatedSections[sectionIndex],
      columns: [...updatedSections[sectionIndex].columns, newColumn],
    };

    setSections(updatedSections);
    saveSections(updatedSections);
    setNewColumnName("");
    if (columnNameInputRef.current) columnNameInputRef.current.value = "";
    setIsColumnFormOpen(false);
    toast({ title: "Успешно", description: "Столбец создан" });
  };

  // Удаление раздела
  const handleRenameColumn = (columnId: string) => {
    const columnName = editingColumnName.trim();
    if (!columnName) {
      toast({ title: "Ошибка", description: "Введите название столбца", variant: "destructive" });
      return;
    }

    if (currentSection?.localProjectId) {
      const projectId = currentSection.localProjectId;
      queryClient.setQueryData<any[]>(["/api/projects", projectId, "columns"], (prev) =>
        Array.isArray(prev) ? prev.map((column) => column.id === columnId ? { ...column, name: columnName } : column) : prev
      );
      apiRequest("PUT", `/api/projects/${encodeURIComponent(projectId)}/columns/${encodeURIComponent(columnId)}`, { name: columnName })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "columns"] });
          setEditingColumnId(null);
          setEditingColumnName("");
        })
        .catch((error: any) => {
          queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "columns"] });
          toast({ title: "Ошибка", description: error?.message || "Не удалось переименовать столбец", variant: "destructive" });
        });
      return;
    }

    const sectionIndex = sections.findIndex((section) => section.id === selectedSectionId);
    if (sectionIndex === -1) return;
    const updatedSections = [...sections];
    updatedSections[sectionIndex] = {
      ...updatedSections[sectionIndex],
      columns: updatedSections[sectionIndex].columns.map((column) =>
        column.id === columnId ? { ...column, name: columnName } : column
      ),
    };
    setSections(updatedSections);
    saveSections(updatedSections);
    setEditingColumnId(null);
    setEditingColumnName("");
  };

  const handleDeleteSection = (sectionId: string) => {
    if (sectionId === "my-tasks" || sectionId.startsWith("user-")) {
      toast({ title: "Ошибка", description: "Системную доску удалить нельзя", variant: "destructive" });
      return;
    }

    const localProjectId = sectionId.startsWith("project-") ? sectionId.slice("project-".length) : null;
    if (localProjectId) {
      const boardName = displaySections.find((section) => section.id === sectionId)?.name || "эту доску";
      if (!confirm(`Точно удалить доску "${boardName}"?`)) return;
      apiRequest("DELETE", `/api/projects/${encodeURIComponent(localProjectId)}`)
        .then(() => {
          queryClient.setQueryData<any[]>(["/api/projects"], (prev) =>
            Array.isArray(prev) ? prev.filter((project) => project?.id !== localProjectId) : prev
          );
          queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
          queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
          setSelectedSectionId("my-tasks");
          toast({ title: "Готово", description: "Доска удалена" });
        })
        .catch((error: any) => {
          toast({ title: "Ошибка", description: error?.message || "Не удалось удалить доску", variant: "destructive" });
        });
      return;
    }

    if (confirm("Точно удалить раздел? Задачи останутся, но будут без раздела.")) {
      const updatedSections = sections.filter((section) => section.id !== sectionId);
      setSections(updatedSections);
      saveSections(updatedSections);
      if (selectedSectionId === sectionId) setSelectedSectionId("my-tasks");
      toast({ title: "Готово", description: "Раздел удалён" });
    }
  };

  const handleDeleteColumn = (columnId: string) => {
    if (!currentSection?.localProjectId && getDefaultColumns().some((column) => column.id === columnId)) {
      toast({ title: "Ошибка", description: "Стандартный столбец удалить нельзя", variant: "destructive" });
      return;
    }

    if (currentSection?.localProjectId) {
      const column = effectiveColumns.find((item) => item.id === columnId);
      const fallbackColumnId = effectiveColumns.find((item) => item.id !== columnId)?.id || "todo";
      if (!confirm(`Точно удалить столбец "${column?.name || "столбец"}"? Задачи из него будут перенесены в первый доступный столбец.`)) return;
      const tasksToUpdate = tasks.filter((task) => task?.status === columnId);
      Promise.all(tasksToUpdate.map((task) =>
        apiRequest("PUT", `/api/tasks/${task.id}`, { status: fallbackColumnId, userId: currentUser?.id }).catch(() => undefined)
      ))
        .then(() => apiRequest("DELETE", `/api/projects/${encodeURIComponent(currentSection.localProjectId!)}/columns/${encodeURIComponent(columnId)}`))
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/projects", currentSection.localProjectId, "columns"] });
          queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
          toast({ title: "Готово", description: "Столбец удалён" });
        })
        .catch((error: any) => {
          toast({ title: "Ошибка", description: error?.message || "Не удалось удалить столбец", variant: "destructive" });
        });
      return;
    }

    if (confirm("Точно удалить столбец? Задачи из него будут перенесены в 'К выполнению'.")) {
      const sectionIndex = sections.findIndex((section) => section.id === selectedSectionId);
      if (sectionIndex === -1) return;
      tasks.filter((task) => task?.status === columnId).forEach((task) => {
        updateMutation.mutate({ id: task.id, data: { status: "todo" } });
      });
      const updatedSections = [...sections];
      updatedSections[sectionIndex] = {
        ...updatedSections[sectionIndex],
        columns: updatedSections[sectionIndex].columns.filter((column) => column.id !== columnId),
      };
      setSections(updatedSections);
      saveSections(updatedSections);
      toast({ title: "Готово", description: "Столбец удалён" });
    }
  };

  const createMutation = useMutation({
    mutationFn: async (taskData: any) => {
      const { __quickAdd, ...payload } = taskData || {};
      const body = { ...payload, creatorId: currentUser?.id };
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (currentUser?.id) headers["x-user"] = encodeUserHeader(currentUser);
      const response = await fetch(apiUrl("/api/tasks"), {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("Не удалось создать задачу");
      const data = await safeJson(response, null);
      if (data == null) throw new Error("Сервер вернул неверный ответ. Проверьте подключение к API.");
      return data;
    },
    onSuccess: (createdTask: Task, variables: any) => {
      if (!variables?.__quickAdd) {
        setNewTaskTitle("");
        if (titleInputRef.current) titleInputRef.current.value = "";
        setNewTaskDescription("");
        setNewTaskStatus("todo");
        setNewTaskPriority("medium");
        setNewTaskAssigneeId("");
        setNewTaskDueDate("");
        setSelectedMonth(new Date().getMonth());
        setSelectedDay(new Date().getDate());
        setSelectedYear(new Date().getFullYear());
        setSelectedHour("00");
        setSelectedMinute("00");
        setNewTaskRepository("");
        setNewTaskProject("");
        setNewTaskCategory("");
        setNewTaskEstimatedHours("");
        setSubtasks([]);
        setNewSubtaskTitle("");
        setNewTaskTags([]);
        setNewTaskStickerValues({});
        setAttachedFiles([]);
        setNewTaskLinks([]);
        setNewLinkTitle("");
        setNewLinkUrl("");
        setIsFormOpen(false);
      }
      toast({ title: "Успешно", description: "Задача создана" });
      const queryKey = ["/api/tasks", currentUser?.id, yougileBoardIdForQuery ?? "all"] as const;
      queryClient.setQueryData<Task[]>(queryKey, (prev) => (prev ? [...prev, createdTask] : [createdTask]));
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось создать задачу",
        variant: "destructive"
      });
    },
  });

  // Обновление задачи. Оптимистичное обновление и при перетаскивании: карточка сразу переезжает в новую колонку, запрос к серверу и YouGile уходит в фоне (при лимите API — в очередь).
  const updateMutation = useMutation({
    mutationFn: async ({ id, data, fromDrag }: { id: string; data: Partial<Task>; fromDrag?: boolean }) => {
      const body = { ...data, userId: currentUser?.id };
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (currentUser?.id) headers["x-user"] = encodeUserHeader(currentUser);
      const response = await fetch(apiUrl(`/api/tasks/${id}`), {
        method: "PUT",
        credentials: "include",
        headers,
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("Не удалось обновить задачу");
      const parsed = await safeJson(response, null);
      if (parsed == null) throw new Error("Сервер вернул неверный ответ. Проверьте подключение к API.");
      return parsed;
    },
    onMutate: async (variables) => {
      const queryKey = ["/api/tasks", currentUser?.id, yougileBoardIdForQuery ?? "all"] as const;
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<Task[]>(queryKey);
      const hasOptimistic = variables.data && (
        variables.data.status !== undefined ||
        variables.data.projectColumnId !== undefined ||
        variables.data.dueDate !== undefined ||
        variables.data.completedAt !== undefined ||
        variables.data.assigneeId !== undefined ||
        variables.data.attachments !== undefined ||
        variables.data.priority !== undefined ||
        variables.data.tags !== undefined ||
        variables.data.subtasks !== undefined
      );
      if (prev && hasOptimistic) {
        queryClient.setQueryData<Task[]>(queryKey, prev.map(t =>
          t.id === variables.id
            ? ({
                ...t,
                ...(variables.data!.status !== undefined && { status: variables.data!.status }),
                ...(variables.data!.projectColumnId !== undefined && { projectColumnId: variables.data!.projectColumnId }),
                ...(variables.data!.dueDate !== undefined && { dueDate: variables.data!.dueDate }),
                ...(variables.data!.completedAt !== undefined && { completedAt: variables.data!.completedAt }),
                ...(variables.data!.assigneeId !== undefined && { assigneeId: variables.data!.assigneeId }),
                ...(variables.data!.attachments !== undefined && { attachments: variables.data!.attachments }),
                ...(variables.data!.priority !== undefined && { priority: variables.data!.priority }),
                ...(variables.data!.tags !== undefined && { tags: variables.data!.tags }),
                ...(variables.data!.subtasks !== undefined && { subtasks: variables.data!.subtasks }),
                updatedAt: new Date().toISOString(),
              } as unknown as Task)
            : t
        ));
      }
      return { previousTasks: prev };
    },
    onSuccess: (updatedTask: Task, variables) => {
      const queryKey = ["/api/tasks", currentUser?.id, yougileBoardIdForQuery ?? "all"] as const;
      const prev = queryClient.getQueryData<Task[]>(queryKey);
      if (prev && updatedTask) {
        queryClient.setQueryData<Task[]>(queryKey, prev.map(t => t.id === updatedTask.id ? { ...t, ...updatedTask } : t));
      }
      if (!variables.fromDrag) {
        setSelectedTaskForView(prev => prev && prev.id === updatedTask.id ? { ...prev, ...updatedTask } : prev);
      }
    },
    onError: (error: any, _variables, context: { previousTasks?: Task[] } | undefined) => {
      const queryKey = ["/api/tasks", currentUser?.id, yougileBoardIdForQuery ?? "all"] as const;
      if (context?.previousTasks != null) {
        queryClient.setQueryData(queryKey, context.previousTasks);
      }
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось обновить задачу",
        variant: "destructive",
      });
    },
  });

  const handleStatusChange = useCallback((taskId: string, newStatus: string, options?: { fromDrag?: boolean; isDone?: boolean }) => {
    const markAsDone = options?.isDone === true;
    const unmarkDone = options?.isDone === false;
    const sortedCols = [...(effectiveColumns || [])].sort((a, b) => a.order - b.order);
    const firstColId = sortedCols[0]?.id ?? "todo";
      const lastColId = sortedCols[sortedCols.length - 1]?.id ?? "done";
      const data: Partial<Task> =
      markAsDone ? { status: lastColId, completedAt: new Date().toISOString() as any }
      : unmarkDone ? { status: firstColId, completedAt: null as any }
      : { status: newStatus };
    if (currentSection?.localProjectId) {
      (data as any).projectColumnId = data.status;
    }
    updateMutation.mutate({ id: taskId, data, fromDrag: options?.fromDrag });
  }, [currentSection?.localProjectId, effectiveColumns, updateMutation]);

  const getInsertOrder = useCallback((taskId: string, columnId: string, insertIndex?: number) => {
    const targetTasks = (tasksByColumn[columnId] || []).filter((task) => task.id !== taskId);
    const safeIndex = Math.max(0, Math.min(insertIndex ?? targetTasks.length, targetTasks.length));
    const before = targetTasks[safeIndex - 1];
    const after = targetTasks[safeIndex];
    const beforeOrder = getTaskOrder(before, boardOrderKey);
    const afterOrder = getTaskOrder(after, boardOrderKey);
    if (beforeOrder != null && afterOrder != null) return (beforeOrder + afterOrder) / 2;
    if (beforeOrder != null) return beforeOrder + 1000;
    if (afterOrder != null) return afterOrder - 1000;
    return (safeIndex + 1) * 1000;
  }, [boardOrderKey, tasksByColumn]);

  const moveTaskToColumn = useCallback((taskId: string, columnId: string, insertIndex?: number) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || !columnId) return;
    const currentColumnId = currentSection?.localProjectId
      ? String((task as any).projectColumnId || task.status || "")
      : String(task.status || "");
    const order = getInsertOrder(taskId, columnId, insertIndex);
    const data: Partial<Task> = {
      status: columnId,
      tags: withTaskOrderTag(task, boardOrderKey, columnId, order) as any,
    };
    if (currentSection?.localProjectId) {
      (data as any).projectColumnId = columnId;
    }
    if (currentColumnId === columnId && getTaskOrder(task, boardOrderKey) === order) return;
    updateMutation.mutate({ id: taskId, data, fromDrag: true });
  }, [boardOrderKey, currentSection?.localProjectId, getInsertOrder, tasks, updateMutation]);

  const handleNativeDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, taskId: string) => {
    setIsBoardDragging(true);
    setDraggingTaskId(taskId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", taskId);

    const source = event.currentTarget;
    const dragImage = source.cloneNode(true) as HTMLElement;
    const rect = source.getBoundingClientRect();
    dragImage.style.position = "fixed";
    dragImage.style.left = "-10000px";
    dragImage.style.top = "-10000px";
    dragImage.style.width = `${rect.width}px`;
    dragImage.style.opacity = "1";
    dragImage.style.filter = "none";
    dragImage.style.transform = "none";
    dragImage.style.pointerEvents = "none";
    document.body.appendChild(dragImage);
    event.dataTransfer.setDragImage(dragImage, Math.min(32, rect.width / 2), Math.min(32, rect.height / 2));
    window.setTimeout(() => dragImage.remove(), 0);
  }, []);

  const handleNativeDragEnd = useCallback(() => {
    setIsBoardDragging(false);
    setDraggingTaskId(null);
  }, []);

  const getDroppedTaskId = useCallback((event: React.DragEvent<HTMLElement>) => {
    return event.dataTransfer.getData("text/plain") || draggingTaskId || "";
  }, [draggingTaskId]);

  // Удаление задачи
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(apiUrl(`/api/tasks/${id}`), {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Не удалось удалить задачу");
      const data = await safeJson(response, null);
      return data ?? { id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.refetchQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Успешно", description: "Задача удалена" });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось удалить задачу",
        variant: "destructive"
      });
    },
  });

  const handleCreateTask = () => {
    const title = titleInputRef.current?.value?.trim() ?? newTaskTitle.trim();
    if (!title) {
      toast({
        title: "Ошибка",
        description: "Введите название задачи",
        variant: "destructive"
      });
      return;
    }
    if (!currentUser?.id) {
      toast({ title: "Ошибка", description: "Войдите в систему для создания задачи", variant: "destructive" });
      return;
    }

    // Если назначен ответственный, задача должна попасть в столбец "todo" (к выполнению)
    const taskStatus = currentSection?.localProjectId
      ? (allColumnIds.includes(newTaskStatus) ? newTaskStatus : (allColumnIds[0] || "todo"))
      : (newTaskAssigneeId ? "todo" : newTaskStatus);

    const taskData: any = {
      title,
      description: newTaskDescription,
      status: taskStatus,
      priority: newTaskPriority,
      assigneeId: newTaskAssigneeId || null,
      dueDate: newTaskDueDate || null,
      repository: newTaskRepository || null,
      projectId: newTaskProject || currentSection?.localProjectId || null,
      category: newTaskCategory || null,
      estimatedHours: newTaskEstimatedHours ? parseInt(newTaskEstimatedHours) : null,
      links: newTaskLinks.length > 0 ? newTaskLinks : null,
      subtasks: subtasks.length > 0 ? subtasks : undefined,
      tags: (() => {
        const fromChips = newTaskTags;
        const fromStickers = (boardStickersRaw || []).filter((s) => newTaskStickerValues[s.id]?.trim()).map((s) => ({
          id: s.id,
          name: s.title,
          value: newTaskStickerValues[s.id]?.trim(),
        }));
        const combined = [...fromChips, ...fromStickers];
        return combined.length > 0 ? combined : undefined;
      })(),
    };
    if (currentSection?.yougileBoardId) {
      taskData.yougileBoardId = currentSection.yougileBoardId;
      taskData.status = allColumnIds.includes(newTaskStatus) ? newTaskStatus : (allColumnIds[0] || "todo");
    }
    if (currentSection?.localProjectId) {
      taskData.status = taskStatus;
      taskData.projectColumnId = taskStatus;
    }

    // Добавляем attachments только если есть файлы
    if (attachedFiles.length > 0) {
      taskData.attachments = attachedFiles;
    }

    createMutation.mutate(taskData);
  };

  const resetCreateForm = useCallback(() => {
    setNewTaskTitle("");
    if (titleInputRef.current) titleInputRef.current.value = "";
    setNewTaskDescription("");
    setNewTaskStatus("todo");
    setNewTaskPriority("medium");
    setNewTaskAssigneeId("");
    setNewTaskDueDate("");
    setSelectedMonth(new Date().getMonth());
    setSelectedDay(new Date().getDate());
    setSelectedYear(new Date().getFullYear());
    setSelectedHour("00");
    setSelectedMinute("00");
    setNewTaskRepository("");
    setNewTaskProject("");
    setNewTaskCategory("");
    setNewTaskEstimatedHours("");
    setSubtasks([]);
    setNewSubtaskTitle("");
    setNewTaskTags([]);
    setNewTaskStickerValues({});
    setAttachedFiles([]);
    setNewTaskLinks([]);
    setNewLinkTitle("");
    setNewLinkUrl("");
  }, []);

  const handleCreateSheetOpenChange = useCallback((open: boolean) => {
    if (!open) resetCreateForm();
    setIsFormOpen(open);
  }, [resetCreateForm]);

  const handleAddSubtask = () => {
    if (!newSubtaskTitle.trim()) return;
    setSubtasks([...subtasks, { id: `subtask-${Date.now()}`, title: newSubtaskTitle, completed: false }]);
    setNewSubtaskTitle("");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      // В реальном приложении здесь будет загрузка на сервер
      const fileUrl = URL.createObjectURL(file);
      setAttachedFiles([...attachedFiles, {
        id: `file-${Date.now()}-${Math.random()}`,
        name: file.name,
        url: fileUrl
      }]);
    });
  };

  // Обработка выбора дедлайна
  const handleDeadlineSelect = () => {
    const date = new Date(selectedYear, selectedMonth, selectedDay, parseInt(selectedHour), parseInt(selectedMinute));
    setNewTaskDueDate(date.toISOString());
  };

  // Используем мемоизированные версии
  const getUserName = memoizedGetUserName;
  const getUserAvatar = memoizedGetUserAvatar;
  const getUserInitials = memoizedGetUserInitials;

  const getPriorityColor = (priority: string) => {
    return priorities.find(p => p.id === priority)?.color || "bg-gray-500";
  };

  const getPriorityLabel = (priority: string) => {
    const priorityMap: Record<string, string> = {
      low: "низкий",
      medium: "средний",
      high: "высокий",
      urgent: "срочный",
    };
    return priorityMap[priority] || "средний";
  };

  // Получение тега для задачи (приоритет как тег)
  const getTaskTag = useCallback((task: Task) => {
    if (task.priority === "urgent" || task.priority === "high") {
      return { label: getPriorityLabel(task.priority || "medium"), color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" };
    }
    return null;
  }, []);

  // Получение цвета проекта
  const getProjectColor = useCallback((projectId: string | null | undefined) => {
    if (!projectId) return null;
    const colors = [
      { bg: "bg-orange-500", text: "text-orange-700", darkBg: "dark:bg-orange-900", darkText: "dark:text-orange-300" },
      { bg: "bg-purple-500", text: "text-purple-700", darkBg: "dark:bg-purple-900", darkText: "dark:text-purple-300" },
      { bg: "bg-blue-500", text: "text-blue-700", darkBg: "dark:bg-blue-900", darkText: "dark:text-blue-300" },
      { bg: "bg-green-500", text: "text-green-700", darkBg: "dark:bg-green-900", darkText: "dark:text-green-300" },
      { bg: "bg-pink-500", text: "text-pink-700", darkBg: "dark:bg-pink-900", darkText: "dark:text-pink-300" },
    ];
    const index = projectId.charCodeAt(0) % colors.length;
    return colors[index];
  }, []);

  // Разноцветные акценты карточек (левая граница) по статусу или id
  const getCardAccentColor = useCallback((task: Task) => {
    const statusColors: Record<string, string> = {
      done: "border-l-emerald-500",
      in_progress: "border-l-violet-500",
      todo: "border-l-blue-500",
      not_ready: "border-l-slate-400",
    };
    if (task.status && statusColors[task.status]) return statusColors[task.status];
    const hash = (task.id || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const accents = ["border-l-blue-500", "border-l-violet-500", "border-l-amber-500", "border-l-emerald-500", "border-l-rose-500", "border-l-cyan-500", "border-l-indigo-500"];
    return accents[hash % accents.length];
  }, []);

// Мемоизированный компонент карточки задачи — уменьшает перераендеры
interface TaskCardProps {
  task: Task;
  index: number;
  provided: any;
  snapshot: any;
  users: UserType[];
  taskComments: Record<string, any[]>;
  updateMutation: any;
  getUserAvatar: (id: string | null) => string | null;
  getUserInitials: (id: string | null) => string | null;
  handleStatusChange: (taskId: string, newStatus: string, options?: { fromDrag?: boolean; isDone?: boolean }) => void;
  setSelectedTaskForView: (task: Task) => void;
  getTaskTag: (task: Task) => any;
  getProjectColor: (id: string | null | undefined) => any;
  getDeadlineColor: (date: string | null | undefined) => string;
  getCardAccentColor: (task: Task) => string;
  effectiveColumns: Column[];
  effectiveStickerPresets: StickerPresetItem[];
}

function TasksLayout({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-1.5 sm:p-2 md:p-3 xl:p-4", className)}>
      <div className="w-full max-w-none space-y-0">
        {children}
      </div>
    </div>
  );
}

const TaskCard = memo(function TaskCard({ task, provided, snapshot, users, taskComments, updateMutation, getUserAvatar, getUserInitials, handleStatusChange, setSelectedTaskForView, getTaskTag, getProjectColor, getDeadlineColor, getCardAccentColor, effectiveColumns, effectiveStickerPresets }: TaskCardProps) {
  const taskTag = getTaskTag(task);
  const isDragging = !!snapshot?.isDragging;

  const deadlineStripColor = getDeadlineColor(
    task.dueDate != null ? (typeof task.dueDate === "string" ? task.dueDate : (task.dueDate as Date).toISOString()) : null
  );
  const cardAccent = getCardAccentColor(task);
  const sortedCols = [...(effectiveColumns || [])].sort((a, b) => a.order - b.order);
  const isDone = !!task.completedAt || task.status === "done";
  const assigneeIds = getTaskAssigneeIds(task);

  return (
    <Card
      {...(provided?.dragHandleProps ?? {})}
      onClick={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("button,input,textarea,select,a,[role='checkbox'],[role='button'],[data-radix-collection-item]")) return;
        if (!isDragging) setSelectedTaskForView(task);
      }}
      className={cn(
        "task-drag-card flex rounded-xl border border-border select-none overflow-hidden cursor-pointer",
        "bg-card/90 dark:bg-card/95 backdrop-blur-sm border-l-4",
        !isDragging && "transition-shadow duration-150",
        cardAccent || "border-l-slate-300 dark:border-l-slate-600",
        isDone && "opacity-70",
        isDragging
          ? "shadow-xl z-50 ring-2 ring-primary/30"
          : "hover:border-primary/30 hover:shadow-md"
      )}
    >
      <div className={cn("w-1.5 shrink-0 rounded-l-md", deadlineStripColor)} aria-hidden />
      <div className="p-3 sm:p-3 flex-1 min-w-0 rounded-r-xl min-h-[88px] sm:min-h-0">
        {/* Первая строка: зона перетаскивания (ручка + название + аватар), чекбокс, меню — перетаскивать за всю зону, без смещения карточки */}
        <div className="flex items-start gap-2.5 sm:gap-2">
          {(provided?.dragHandleProps) && (
            <div
              className="cursor-grab active:cursor-grabbing touch-manipulation flex items-start gap-2 min-w-0 flex-1 rounded py-2 -my-2 px-1 -mx-1 min-h-[44px] sm:min-h-0 sm:py-0.5 sm:-my-0.5"
              title="Перетащить"
            >
              <GripVertical className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-muted-foreground shrink-0 self-center" />
              <h3
                className={cn(
                  "font-semibold text-sm flex-1 leading-snug text-foreground cursor-pointer hover:text-primary transition-colors line-clamp-2 min-w-0",
                  isDone && "line-through opacity-75"
                )}
                onClick={(e) => { e.stopPropagation(); setSelectedTaskForView(task); }}
                title={task.title}
              >
                {task.title}
              </h3>
              {assigneeIds.length > 0 && (
                <div className="flex -space-x-2 shrink-0">
                  {assigneeIds.slice(0, 3).map((id) => (
                    <Avatar key={id} className="w-7 h-7 sm:w-6 sm:h-6 ring-2 ring-background">
                      <AvatarImage src={getUserAvatar(id) || undefined} />
                      <AvatarFallback className="text-[10px] sm:text-[9px] font-semibold bg-primary/20 text-primary">
                        {getUserInitials(id) || "?"}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </div>
              )}
            </div>
          )}
          {!(provided?.dragHandleProps) && (
            <h3
              className={cn(
                "font-semibold text-sm flex-1 leading-snug text-foreground cursor-pointer hover:text-primary transition-colors line-clamp-2 min-w-0",
                isDone && "line-through opacity-75"
              )}
              onClick={(e) => { e.stopPropagation(); setSelectedTaskForView(task); }}
              title={task.title}
            >
              {task.title}
            </h3>
          )}
          <Checkbox
            checked={isDone}
            onCheckedChange={(checked) => { handleStatusChange(task.id, task.status, { isDone: !!checked }); }}
            onClick={(e) => e.stopPropagation()}
            className="h-5 w-5 sm:h-4 sm:w-4 mt-0.5 rounded border-2 data-[state=checked]:bg-primary data-[state=checked]:border-primary shrink-0 touch-manipulation"
          />
          <div className="flex items-center gap-1 shrink-0">
            {!(provided?.dragHandleProps) && assigneeIds.length > 0 && (
              <div className="flex -space-x-2">
                {assigneeIds.slice(0, 3).map((id) => (
                  <Avatar key={id} className="w-7 h-7 sm:w-6 sm:h-6 ring-2 ring-background">
                    <AvatarImage src={getUserAvatar(id) || undefined} />
                    <AvatarFallback className="text-[10px] sm:text-[9px] font-semibold bg-primary/20 text-primary">
                      {getUserInitials(id) || "?"}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-7 sm:w-7 touch-manipulation" onClick={(e) => e.stopPropagation()}>
                  <MoreVertical className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={() => setSelectedTaskForView(task)}>
                  <Eye className="w-4 h-4 mr-2" /> Открыть
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Стикеры и приоритет: как на карточке YouGile — цветные плашки с заготовленным выбором */}
        <div className="flex flex-wrap items-center gap-1.5 mt-2 sm:mt-2 min-w-0">
          {taskTag && (
            <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] sm:text-[10px] font-medium", taskTag.color)}>
              {taskTag.label}
            </span>
          )}
          {Array.isArray((task as any)?.tags) && (task as any).tags.length > 0 && (task as any).tags.filter((tag: any) => tag?.id !== MULTI_ASSIGNEE_TAG_ID && tag?.id !== KANBAN_ORDER_TAG_ID).map((tag: any) => {
            const name = typeof tag === "object" && tag !== null && "name" in tag ? tag.name : String(tag?.id ?? tag);
            const value = typeof tag === "object" && tag !== null && "value" in tag ? (tag as any).value : undefined;
            const displayValue = value && users?.length ? (users.find((u) => u.id === value)?.name ?? value) : value;
            const label = displayValue ? `${name}: ${displayValue}` : name;
            const color = typeof tag === "object" && tag !== null && "color" in tag ? (tag as any).color : undefined;
            const preset = (effectiveStickerPresets || STICKER_PRESETS).find(p => p.id === (tag?.id ?? tag) || p.name === name);
            const icon = preset?.icon ?? (typeof tag === "object" && (tag as any).icon);
            return (
              <span
                key={tag?.id ?? tag?.name ?? String(tag)}
                className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] sm:text-[11px] font-medium text-white truncate max-w-[140px]", getStickerClass(color ?? preset?.color))}
                title={label}
              >
                {icon === "archive" && <Filter className="w-3 h-3 shrink-0 opacity-90" />}
                {icon === "clock" && <Clock className="w-3 h-3 shrink-0 opacity-90" />}
                <span className="truncate">{label}</span>
              </span>
            );
          })}
          {task.projectId && getProjectColor(task.projectId) && (
            <span className={cn("inline-block w-2 h-2 rounded-full shrink-0", getProjectColor(task.projectId)?.bg)} title="Проект" />
          )}
        </div>

        {/* Подзадачи (чеклист) на карточке */}
        {Array.isArray((task as any).subtasks) && (task as any).subtasks.length > 0 && (
          <div className="mt-2 space-y-1">
            {(task as any).subtasks.slice(0, 4).map((st: { id: string; title: string; completed?: boolean }) => (
              <div key={st.id} className="flex items-center gap-1.5 text-xs">
                <Checkbox
                  checked={!!st.completed}
                  onCheckedChange={(checked) => {
                    const list = [...((task as any).subtasks || [])];
                    const idx = list.findIndex((s: any) => s.id === st.id);
                    if (idx >= 0) {
                      list[idx] = { ...list[idx], completed: !!checked };
                      updateMutation.mutate({ id: task.id, data: { subtasks: list } });
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="h-3 w-3"
                />
                <span className={cn("truncate", st.completed && "line-through text-muted-foreground")}>{st.title}</span>
              </div>
            ))}
            {(task as any).subtasks.length > 4 && (
              <span className="text-[10px] text-muted-foreground">+{(task as any).subtasks.length - 4}</span>
            )}
          </div>
        )}

        {/* Дата и мета — на телефоне крупнее зоны нажатия */}
        <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
          <div className="flex items-center gap-2 sm:gap-1.5 flex-wrap min-w-0 flex-1">
            {task.assigneeId ? (
              <Select
                value={task.assigneeId}
                onValueChange={(value) => {
                  const newAssigneeId = value === "none" ? null : value;
                  const newStatus = newAssigneeId ? "todo" : task.status;
                  updateMutation.mutate({
                    id: task.id,
                    data: { assigneeId: newAssigneeId, status: newStatus },
                  });
                }}
              >
                <SelectTrigger className="h-8 sm:h-7 w-auto border-none bg-transparent px-0 py-0 hover:bg-transparent focus:ring-0 focus:ring-offset-0">
                  <div className="flex items-center gap-1.5 group cursor-pointer touch-manipulation min-h-[28px] sm:min-h-0">
                    <Avatar className="w-7 h-7 sm:w-7 sm:h-7 ring-2 ring-slate-200 dark:ring-slate-700 group-hover:ring-primary/50 transition-all flex-shrink-0">
                      <AvatarImage src={getUserAvatar(task.assigneeId) || undefined} />
                      <AvatarFallback className="text-[9px] sm:text-[10px] font-semibold bg-gradient-to-br from-primary/20 to-primary/10 text-primary border border-primary/20">
                        {getUserInitials(task.assigneeId) || "?"}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                </SelectTrigger>
                <SelectContent onClick={(e) => e.stopPropagation()}>
                  <SelectItem value="none">Не назначен</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Select
                value=""
                onValueChange={(value) => {
                  if (value) {
                    updateMutation.mutate({
                      id: task.id,
                      data: { assigneeId: value },
                    });
                  }
                }}
              >
                <SelectTrigger className="h-8 sm:h-7 w-auto border-none bg-transparent px-0 py-0 hover:bg-transparent focus:ring-0 focus:ring-offset-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 sm:h-7 px-2.5 sm:px-2 text-xs sm:text-xs text-muted-foreground hover:text-primary border border-dashed border-slate-300 dark:border-slate-600 hover:border-primary/50 rounded-full touch-manipulation"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Plus className="w-3 h-3 sm:w-3 sm:h-3 mr-1 sm:mr-1" />
                    <span>Назначить</span>
                  </Button>
                </SelectTrigger>
                <SelectContent onClick={(e) => e.stopPropagation()}>
                  <SelectItem value="none">Не назначен</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {task.dueDate && (
              <span className="flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-700/50 px-2 py-1 rounded-md whitespace-nowrap">
                <CalendarIcon className="w-3 h-3 sm:w-3 sm:h-3" />
                {format(new Date(task.dueDate), "d MMM", { locale: ru })}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
            {taskComments[task.id]?.length > 0 && (
              <div className="flex items-center gap-0.5 sm:gap-1 text-[10px] sm:text-xs text-muted-foreground">
                <MessageSquare className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                <span>{taskComments[task.id].length}</span>
              </div>
            )}
            {Boolean(task.attachments && Array.isArray(task.attachments) && (task.attachments as any[]).length > 0) && (
              <div className="flex items-center gap-0.5 sm:gap-1 text-[10px] sm:text-xs text-muted-foreground">
                <Paperclip className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                <span>{(task.attachments as any[]).length}</span>
              </div>
            )}
            {Boolean(task.links && Array.isArray(task.links) && (task.links as any[]).length > 0) && (
              <div className="flex items-center gap-0.5 sm:gap-1 text-[10px] sm:text-xs text-muted-foreground">
                <Link2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                <span>{(task.links as any[]).length}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
});

  const daysInSelectedMonth = getDaysInMonth(selectedMonth, selectedYear);
  const daysArray = Array.from({ length: daysInSelectedMonth }, (_, i) => i + 1);
  const hoursArray = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));

  // Полноэкранный спиннер только при первой загрузке (нет данных). При смене доски показываем предыдущие задачи и тонкий индикатор
  if (tasksLoading && tasks.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Загрузка задач...</p>
        </div>
      </div>
    );
  }

  return (
    <TasksLayout>
      <div className="relative space-y-0 rounded-xl border border-border/70 bg-background/70 shadow-sm backdrop-blur lg:min-h-[calc(100dvh-4rem)] xl:rounded-none xl:border-0">
        {/* Шапка в стиле MOII/CRM: тёмная полоса, заголовок по центру (мобильный) или слева, фильтр и меню справа */}
        <div className="rounded-t-2xl border-b border-border/70 bg-card/80 px-3 py-3 backdrop-blur sm:px-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ListTodo className="h-4 w-4" />
              </div>
              <h1 className="truncate text-base font-semibold text-foreground sm:text-lg">
                {currentSection?.name || "Задачи"}
              </h1>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {effectiveColumns.length} колонок · {filteredTasks.length} задач
            </p>
          </div>
          <div className="flex items-center justify-end gap-1.5 shrink-0">
            <Popover open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg">
                  <Filter className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[calc(100vw-2rem)] sm:w-80" align="end">
                <div className="space-y-4">
                  <Label>Приоритет</Label>
                  <Select value={filterPriority} onValueChange={setFilterPriority}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все</SelectItem>
                      <SelectItem value="urgent">Срочный</SelectItem>
                      <SelectItem value="high">Высокий</SelectItem>
                      <SelectItem value="medium">Средний</SelectItem>
                      <SelectItem value="low">Низкий</SelectItem>
                    </SelectContent>
                  </Select>
                  <Label>Категория</Label>
                  <Select value={filterCategory} onValueChange={setFilterCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все</SelectItem>
                      <SelectItem value="production">Производство</SelectItem>
                      <SelectItem value="equipment">Оборудование</SelectItem>
                      <SelectItem value="stream">Стрим</SelectItem>
                      <SelectItem value="admin">Администрирование</SelectItem>
                      <SelectItem value="other">Другое</SelectItem>
                    </SelectContent>
                  </Select>
                  <Label>Исполнитель</Label>
                  <Select value={filterAssignee} onValueChange={setFilterAssignee}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все</SelectItem>
                      <SelectItem value="unassigned">Не назначены</SelectItem>
                      {users.map(u => (<SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </PopoverContent>
            </Popover>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setIsSectionFormOpen(true)}>
                  <Columns className="w-4 h-4 mr-2" /> Новая доска
                </DropdownMenuItem>
                {currentSection?.localProjectId && (
                  <DropdownMenuItem onClick={() => setIsColumnFormOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" /> Новый столбец
                  </DropdownMenuItem>
                )}
                {currentSection?.localProjectId && (
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDeleteSection(`project-${currentSection.localProjectId}`)}>
                    <Trash2 className="w-4 h-4 mr-2" /> Удалить доску
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setIsFormOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" /> Новая задача
                </DropdownMenuItem>
                {/* Столбцы синхронизируются с YouGile; создание только через настройки маппинга колонок */}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          </div>
        </div>

        {/* Тонкая полоска загрузки при смене доски (без полноэкранного затемнения) */}
        {tasksFetching && tasks.length > 0 && (
          <div className="absolute left-0 right-0 top-0 z-10 h-0.5 bg-primary/20 overflow-hidden rounded-full">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/70" />
          </div>
        )}

        {/* Первая строка: Мои задачи и проекты YouGile (названия из YouGile) */}
        <div className="border-b border-border/70 bg-card/55 px-2 sm:px-3 pt-3 pb-2 backdrop-blur">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2 px-1">Проекты</p>
          <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
            {displaySections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => setSelectedSectionId(section.id)}
                className={cn(
                  "flex-shrink-0 rounded-lg border px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-all",
                  selectedSectionId === section.id
                    ? "border-primary/60 bg-primary/10 text-primary shadow-sm"
                    : "border-border/70 bg-background/70 text-muted-foreground hover:border-primary/40 hover:bg-background hover:text-foreground"
                )}
              >
                {section.id === "my-tasks" && <CheckCircle2 className="w-3.5 h-3.5 inline mr-1.5 align-middle opacity-70" />}
                {(section as any).yougileProjectId && <FolderKanban className="w-3.5 h-3.5 inline mr-1.5 align-middle opacity-70" />}
                {section.name}
              </button>
            ))}
          </div>
        </div>

        {/* Вторая строка: доски выбранного проекта YouGile (по клику — колонки этой доски) */}
        {selectedYougileProjectId && yougileBoardsOfProject.length > 0 && (
          <div className="border-x border-t border-border bg-card/70 dark:bg-card/80 backdrop-blur-sm px-2 sm:px-3 pt-2 pb-2 mt-0.5">
            <p className="text-xs text-muted-foreground mb-2 px-0.5">Доски</p>
            <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
              {yougileBoardsOfProject.map((board: any) => (
                <button
                  key={board.id}
                  type="button"
                  onClick={() => setSelectedBoardId(board.id)}
                  className={cn(
                    "flex-shrink-0 rounded-xl border-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-all",
                    selectedBoardId === board.id
                      ? "border-primary bg-primary/10 text-primary shadow-sm"
                      : "border-border bg-background/80 text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  )}
                >
                  <Columns className="w-3.5 h-3.5 inline mr-1.5 align-middle opacity-70" />
                  {board.title || "Доска"}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2 sm:space-y-3 md:space-y-4 px-0 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setIsFormOpen(true)} className="rounded-xl h-9 sm:h-10 px-4 shrink-0 touch-manipulation">
              <Plus className="w-4 h-4 mr-2" />
              Создать задачу
            </Button>
            <YouGileTasksLink />
          </div>

          {/* Диалоги раздел/столбец (открываются из меню) */}
          <Dialog
            open={isSectionFormOpen}
            onOpenChange={(open) => {
              if (!open && isCreatingBoard) return;
              setIsSectionFormOpen(open);
              if (open) {
                window.setTimeout(() => boardNameInputRef.current?.focus(), 0);
              } else {
                setNewSectionName("");
                if (boardNameInputRef.current) boardNameInputRef.current.value = "";
                setNewBoardMemberIds(currentUser?.id ? [String(currentUser.id)] : []);
              }
            }}
          >
            <DialogContent
              className="w-[calc(100vw-1.5rem)] max-w-lg rounded-xl p-4 sm:p-6"
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                window.setTimeout(() => boardNameInputRef.current?.focus(), 0);
              }}
              onPointerDownCapture={(event) => event.stopPropagation()}
              onMouseDownCapture={(event) => event.stopPropagation()}
            >
              <DialogHeader><DialogTitle>Создать доску</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Название доски</Label>
                  <Input
                    ref={boardNameInputRef}
                    defaultValue=""
                    placeholder="Например: Монтаж"
                    autoComplete="off"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateSection();
                      }
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Кто видит доску</Label>
                  <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-background/70 p-2 space-y-1">
                    {users.map((user) => {
                      const id = String(user.id);
                      const checked = newBoardMemberIds.includes(id);
                      return (
                        <label key={id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => {
                              setNewBoardMemberIds((prev) => {
                                if (value) return Array.from(new Set([...prev, id]));
                                return prev.filter((item) => item !== id);
                              });
                            }}
                          />
                          <span className="truncate">{user.name || user.username || user.email || id}</span>
                        </label>
                      );
                    })}
                    {users.length === 0 && (
                      <div className="px-2 py-3 text-sm text-muted-foreground">Сотрудники не загружены</div>
                    )}
                  </div>
                </div>
                <Button onClick={handleCreateSection} className="w-full" disabled={isCreatingBoard}>
                  {isCreatingBoard ? "Создаём..." : "Создать"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog
            open={isColumnFormOpen}
            onOpenChange={(open) => {
              setIsColumnFormOpen(open);
              if (!open) {
                setNewColumnName("");
                if (columnNameInputRef.current) columnNameInputRef.current.value = "";
              }
            }}
          >
            <DialogContent
              className="w-[calc(100vw-1.5rem)] max-w-md rounded-xl p-4 sm:p-6"
              onPointerDownCapture={(event) => event.stopPropagation()}
              onMouseDownCapture={(event) => event.stopPropagation()}
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                window.setTimeout(() => columnNameInputRef.current?.focus(), 0);
              }}
            >
              <DialogHeader>
                <DialogTitle>Новый столбец</DialogTitle>
                <DialogDescription>Добавьте колонку в текущую доску.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Название столбца</Label>
                  <Input
                    ref={columnNameInputRef}
                    defaultValue=""
                    placeholder="Например: На проверке"
                    autoComplete="off"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleCreateColumn();
                      }
                    }}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsColumnFormOpen(false)}>
                    Отмена
                  </Button>
                  <Button type="button" onClick={handleCreateColumn}>
                    Создать
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

            <Sheet open={isFormOpen} onOpenChange={handleCreateSheetOpenChange}>
              <SheetContent
                side="right"
                className="w-full sm:max-w-lg md:max-w-2xl overflow-y-auto overflow-x-hidden hide-scrollbar touch-scroll-smooth p-3 sm:p-6 max-h-[100dvh] md:max-h-none pb-24 md:pb-6 safe-area-bottom"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <SheetHeader className="mb-6">
                  <SheetTitle className="text-2xl font-bold">Создать задачу</SheetTitle>
                  <SheetDescription>
                    Заполните все необходимые поля для создания новой задачи
                  </SheetDescription>
                </SheetHeader>
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs sm:text-sm" htmlFor="task-title-input">Название *</Label>
                    <Input
                      ref={titleInputRef}
                      id="task-title-input"
                      defaultValue=""
                      placeholder="Название задачи"
                      className="h-9 sm:h-10 text-xs sm:text-sm scroll-mt-24"
                      autoComplete="off"
                      aria-label="Название задачи"
                      style={{ scrollMarginTop: "6rem" }}
                    />
                  </div>
                  <div>
                    <Label className="text-xs sm:text-sm">Описание</Label>
                    <Textarea
                      value={newTaskDescription}
                      onChange={(e) => setNewTaskDescription(e.target.value)}
                      placeholder="Описание задачи"
                      rows={3}
                      className="text-xs sm:text-sm resize-none"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <Label className="text-xs sm:text-sm">Столбец</Label>
                      <Select value={newTaskStatus} onValueChange={setNewTaskStatus}>
                        <SelectTrigger className="h-9 sm:h-10 text-xs sm:text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {effectiveColumns.map(column => (
                            <SelectItem key={column.id} value={column.id}>
                              {column.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs sm:text-sm">Приоритет</Label>
                      <Select value={newTaskPriority} onValueChange={setNewTaskPriority}>
                        <SelectTrigger className="h-9 sm:h-10 text-xs sm:text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {priorities.map(priority => (
                            <SelectItem key={priority.id} value={priority.id}>
                              {priority.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs sm:text-sm">Исполнитель</Label>
                    <Select value={newTaskAssigneeId || "none"} onValueChange={(value) => setNewTaskAssigneeId(value === "none" ? "" : value)}>
                      <SelectTrigger className="h-9 sm:h-10 text-xs sm:text-sm">
                        <SelectValue placeholder="Не назначен" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Не назначен</SelectItem>
                        {users.map(user => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Выбор дедлайна */}
                  <div>
                    <Label className="text-xs sm:text-sm">Дедлайн</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <Select
                        value={selectedMonth.toString()}
                        onValueChange={(value) => {
                          setSelectedMonth(parseInt(value));
                          handleDeadlineSelect();
                        }}
                      >
                        <SelectTrigger className="h-9 sm:h-10 text-xs sm:text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {months.map((month, index) => (
                            <SelectItem key={index} value={index.toString()}>
                              {month}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={selectedDay.toString()}
                        onValueChange={(value) => {
                          setSelectedDay(parseInt(value));
                          handleDeadlineSelect();
                        }}
                      >
                        <SelectTrigger className="h-9 sm:h-10 text-xs sm:text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {daysArray.map(day => (
                            <SelectItem key={day} value={day.toString()}>
                              {day}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={selectedHour}
                        onValueChange={(value) => {
                          setSelectedHour(value);
                          handleDeadlineSelect();
                        }}
                      >
                        <SelectTrigger className="h-9 sm:h-10 text-xs sm:text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {hoursArray.map(hour => (
                            <SelectItem key={hour} value={hour}>
                              {hour}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={selectedMinute}
                        onValueChange={(value) => {
                          setSelectedMinute(value);
                          handleDeadlineSelect();
                        }}
                      >
                        <SelectTrigger className="h-9 sm:h-10 text-xs sm:text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {timeOptions.map(minute => (
                            <SelectItem key={minute} value={minute}>
                              {minute}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {newTaskDueDate && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Выбрано: {format(new Date(newTaskDueDate), "dd.MM.yyyy HH:mm", { locale: ru })}
                      </p>
                    )}
                  </div>

                  {/* Стикеры доски YouGile: по типу — выпадающий список или поле ввода */}
                  {boardStickersRaw.length > 0 && (
                    <div className="space-y-3">
                      <Label className="text-xs sm:text-sm">Стикеры доски</Label>
                      {(boardStickersRaw as BoardStickerItem[]).map((sticker) => (
                        <div key={sticker.id} className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">{sticker.title}</Label>
                          {sticker.type === "user" ? (
                            <Select
                              value={newTaskStickerValues[sticker.id] || ""}
                              onValueChange={(v) => setNewTaskStickerValues((prev) => ({ ...prev, [sticker.id]: v }))}
                            >
                              <SelectTrigger className="h-9 text-xs sm:text-sm">
                                <SelectValue placeholder="Выберите исполнителя" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="">Не выбрано</SelectItem>
                                {users.map((u) => (
                                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : sticker.type === "list" && sticker.options && sticker.options.length > 0 ? (
                            <Select
                              value={newTaskStickerValues[sticker.id] || ""}
                              onValueChange={(v) => setNewTaskStickerValues((prev) => ({ ...prev, [sticker.id]: v }))}
                            >
                              <SelectTrigger className="h-9 text-xs sm:text-sm">
                                <SelectValue placeholder="Выберите из списка" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="">Не выбрано</SelectItem>
                                {sticker.options.map((opt) => (
                                  <SelectItem key={opt.id} value={opt.id}>{opt.title ?? opt.id}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              placeholder="Введите значение"
                              className="h-9 text-xs sm:text-sm"
                              value={newTaskStickerValues[sticker.id] ?? ""}
                              onChange={(e) => setNewTaskStickerValues((prev) => ({ ...prev, [sticker.id]: e.target.value }))}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Плашки-пресеты (если нет стикеров доски или дополнительно) */}
                  {effectiveStickerPresets.length > 0 && boardStickersRaw.length === 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs sm:text-sm">Стикеры</Label>
                      <div className="flex flex-wrap gap-2">
                        {effectiveStickerPresets.map((p) => {
                          const isSelected = newTaskTags.some((t) => t.id === p.id || t.name === p.name);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setNewTaskTags(newTaskTags.filter((t) => t.id !== p.id && t.name !== p.name));
                                } else {
                                  setNewTaskTags([...newTaskTags, { id: p.id, name: p.name, color: p.color }]);
                                }
                              }}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-opacity",
                                getStickerClass(p.color),
                                isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "opacity-80 hover:opacity-100"
                              )}
                            >
                              {p.icon === "archive" && <Filter className="w-3 h-3 shrink-0" />}
                              {p.icon === "clock" && <Clock className="w-3 h-3 shrink-0" />}
                              {p.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Подзадачи */}
                  <div className="space-y-2 sm:space-y-3">
                    <Label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                      <Circle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      Подзадачи ({subtasks.length})
                    </Label>
                    <div className="space-y-2">
                      {subtasks.map((subtask) => (
                        <div key={subtask.id} className="flex items-center gap-1.5 sm:gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                          <Checkbox
                            checked={subtask.completed}
                            onCheckedChange={(checked) => {
                              setSubtasks(subtasks.map(s => s.id === subtask.id ? { ...s, completed: !!checked } : s));
                            }}
                            className="h-3.5 w-3.5 sm:h-4 sm:w-4"
                          />
                          <span className={cn("flex-1 text-xs sm:text-sm break-words", subtask.completed && "line-through text-muted-foreground")}>
                            {subtask.title}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 sm:h-6 sm:w-6 rounded-full flex-shrink-0"
                            onClick={() => setSubtasks(subtasks.filter(s => s.id !== subtask.id))}
                          >
                            <X className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                          </Button>
                        </div>
                      ))}
                      <div className="flex gap-1.5 sm:gap-2">
                        <Input
                          placeholder="Добавить подзадачу"
                          value={newSubtaskTitle}
                          onChange={(e) => setNewSubtaskTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleAddSubtask();
                            }
                          }}
                          className="flex-1 rounded-lg text-xs sm:text-sm h-8 sm:h-9"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleAddSubtask}
                          className="rounded-lg h-8 sm:h-9 w-8 sm:w-9 p-0 flex-shrink-0"
                          disabled={!newSubtaskTitle.trim()}
                        >
                          <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Репозиторий */}
                  <div>
                    <Label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                      <Github className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      Репозиторий
                    </Label>
                    <Select value={newTaskRepository || "none"} onValueChange={(value) => setNewTaskRepository(value === "none" ? "" : value)}>
                      <SelectTrigger className="h-9 sm:h-10 text-xs sm:text-sm">
                        <SelectValue placeholder="Выберите репозиторий" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Не выбран</SelectItem>
                        {repositories.map(repo => (
                          <SelectItem key={repo.id} value={repo.url}>
                            {repo.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Проект */}
                  <div>
                    <Label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                      <FolderKanban className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      Проект
                    </Label>
                    <Select value={newTaskProject || "none"} onValueChange={(value) => setNewTaskProject(value === "none" ? "" : value)}>
                      <SelectTrigger className="h-9 sm:h-10 text-xs sm:text-sm">
                        <SelectValue placeholder="Выберите проект" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Не выбран</SelectItem>
                        {projects.map(project => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Категория */}
                  <div>
                    <Label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                      <Tag className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      Категория
                    </Label>
                    <Select value={newTaskCategory || "none"} onValueChange={(value) => setNewTaskCategory(value === "none" ? "" : value)}>
                      <SelectTrigger className="h-9 sm:h-10 text-xs sm:text-sm">
                        <SelectValue placeholder="Выберите категорию" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Не выбрана</SelectItem>
                        <SelectItem value="production">Производство</SelectItem>
                        <SelectItem value="equipment">Оборудование</SelectItem>
                        <SelectItem value="stream">Стрим</SelectItem>
                        <SelectItem value="admin">Администрирование</SelectItem>
                        <SelectItem value="other">Другое</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Оценка времени */}
                  <div>
                    <Label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                      <Hourglass className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      Оценка времени (часы)
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      value={newTaskEstimatedHours}
                      onChange={(e) => setNewTaskEstimatedHours(e.target.value)}
                      placeholder="Например: 8"
                      className="h-9 sm:h-10 text-xs sm:text-sm"
                    />
                  </div>

                  {/* Ссылки */}
                  <div className="space-y-2 sm:space-y-3">
                    <Label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                      <Link2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      Ссылки ({newTaskLinks.length})
                    </Label>
                    <div className="space-y-2">
                      {newTaskLinks.map((link, index) => (
                        <div key={index} className="flex items-center gap-1.5 sm:gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                          <Link2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs sm:text-sm font-medium truncate">{link.title}</div>
                            <div className="text-[10px] sm:text-xs text-muted-foreground truncate">{link.url}</div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 sm:h-6 sm:w-6 rounded-full flex-shrink-0"
                            onClick={() => setNewTaskLinks(newTaskLinks.filter((_, i) => i !== index))}
                          >
                            <X className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                          </Button>
                        </div>
                      ))}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Input
                          placeholder="Название ссылки"
                          value={newLinkTitle}
                          onChange={(e) => setNewLinkTitle(e.target.value)}
                          className="rounded-lg text-xs sm:text-sm h-9 sm:h-10"
                        />
                        <Input
                          placeholder="URL"
                          value={newLinkUrl}
                          onChange={(e) => setNewLinkUrl(e.target.value)}
                          className="rounded-lg text-xs sm:text-sm h-9 sm:h-10"
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (newLinkTitle.trim() && newLinkUrl.trim()) {
                            setNewTaskLinks([...newTaskLinks, { title: newLinkTitle, url: newLinkUrl }]);
                            setNewLinkTitle("");
                            setNewLinkUrl("");
                          }
                        }}
                        className="w-full rounded-lg h-9 sm:h-10 text-xs sm:text-sm"
                        disabled={!newLinkTitle.trim() || !newLinkUrl.trim()}
                      >
                        <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
                        Добавить ссылку
                      </Button>
                    </div>
                  </div>

                  {/* Файлы */}
                  <div className="space-y-2 sm:space-y-3">
                    <Label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                      <Paperclip className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      Файлы ({attachedFiles.length})
                    </Label>
                    <div className="space-y-2">
                      {attachedFiles.map((file) => (
                        <div key={file.id} className="flex items-center gap-1.5 sm:gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                          <Paperclip className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0" />
                          <span className="flex-1 text-xs sm:text-sm truncate">{file.name}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 sm:h-6 sm:w-6 rounded-full flex-shrink-0"
                            onClick={() => setAttachedFiles(attachedFiles.filter(f => f.id !== file.id))}
                          >
                            <X className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                          </Button>
                        </div>
                      ))}
                      <label>
                        <input
                          type="file"
                          multiple
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                        <Button
                          variant="outline"
                          type="button"
                          className="w-full rounded-lg h-9 sm:h-10 text-xs sm:text-sm"
                          asChild
                        >
                          <span className="flex items-center justify-center gap-2 cursor-pointer">
                            <Plus className="w-4 h-4" />
                            Прикрепить файлы
                          </span>
                        </Button>
                      </label>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-3 sm:pt-4 border-t">
                    <Button
                      onClick={handleCreateTask}
                      className="flex-1 rounded-full px-4 sm:px-6 py-2 sm:py-2.5 text-xs sm:text-sm font-medium shadow-lg hover:shadow-xl transition-all h-9 sm:h-10"
                      disabled={createMutation.isPending}
                    >
                      {createMutation.isPending ? "Создание..." : "Создать задачу"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setIsFormOpen(false)}
                      className="rounded-full px-4 sm:px-6 py-2 sm:py-2.5 text-xs sm:text-sm h-9 sm:h-10"
                    >
                      Отмена
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>

        {/* «Мои задачи»: плитки только моих задач (назначенных/созданных мной) + история выполненных */}
        {currentSection?.id === "my-tasks" ? (
          <div className="space-y-6 px-0 pt-2">
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3">Текущие задачи</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {myTasksActive.length === 0 ? (
                  <div className="col-span-full rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
                    Нет активных задач. Задачи, которые вам назначили, появятся здесь.
                  </div>
                ) : (
                  myTasksActive.map((task) => (
                    <Card
                      key={task.id}
                      className="rounded-xl border border-border bg-card/95 hover:shadow-md transition-all cursor-pointer group relative overflow-hidden"
                      onClick={() => setSelectedTaskForView(task)}
                    >
                      <div className={cn("absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl", getDeadlineColor(task.dueDate || null))} />
                      <CardContent className="p-4 pl-5 flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-sm leading-snug line-clamp-2 flex-1">{task.title}</h3>
                          <Checkbox
                            checked={!!task.completedAt}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                handleStatusChange(task.id, task.status, { isDone: true });
                              } else {
                                handleStatusChange(task.id, task.status, { isDone: false });
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="shrink-0"
                          />
                        </div>
                        {task.dueDate && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <CalendarIcon className="w-3.5 h-3.5" />
                            {format(new Date(task.dueDate), "d MMM", { locale: ru })}
                          </div>
                        )}
                        <Badge className={cn("w-fit text-[10px]", getPriorityColor(task.priority || "medium"))}>
                          {getPriorityLabel(task.priority || "medium")}
                        </Badge>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3">История выполненных</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {myTasksCompleted.length === 0 ? (
                  <p className="col-span-full text-sm text-muted-foreground">Пока нет выполненных задач</p>
                ) : (
                  myTasksCompleted.map((task) => (
                    <Card
                      key={task.id}
                      className="rounded-xl border border-border bg-muted/40 hover:bg-muted/60 transition-all cursor-pointer opacity-90 hover:opacity-100"
                      onClick={() => setSelectedTaskForView(task)}
                    >
                      <CardContent className="p-4">
                        <h3 className="font-medium text-sm line-clamp-2 text-muted-foreground">{task.title}</h3>
                        {task.completedAt && (
                          <p className="text-xs text-muted-foreground mt-1.5">
                            Выполнено {format(new Date(task.completedAt), "d MMM yyyy", { locale: ru })}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : selectedYougileProjectId && !selectedBoardId ? (
          <div className="w-full py-8 text-center text-sm text-muted-foreground">
            Выберите доску выше, чтобы увидеть колонки и задачи
          </div>
        ) : currentSection ? (() => {
          const columns = effectiveColumns.slice().sort((a, b) => a.order - b.order);
          if (columns.length === 0) {
            return <div className="w-full py-4 text-center text-sm text-muted-foreground">Нет столбцов для отображения</div>;
          }
          return (
          <div className="w-full min-w-0 rounded-xl bg-slate-950/70 pt-3 text-slate-100 dark:bg-slate-950/70 lg:min-h-[calc(100dvh-14.5rem)] xl:rounded-none">
            {currentSection?.yougileBoardId && (
              <p className="text-xs text-muted-foreground mb-2 px-0.5">Колонки доски: {currentSection.name}</p>
            )}
              <div
                ref={(node) => {
                  boardScrollRef.current = node;
                  if (node && boardScrollLeftRef.current > 0) {
                    requestAnimationFrame(() => {
                      node.scrollLeft = boardScrollLeftRef.current;
                    });
                  }
                }}
                onScroll={(event) => {
                  boardScrollLeftRef.current = event.currentTarget.scrollLeft;
                }}
                className={cn(
                  "dnd-board-root flex w-full min-w-0 gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain px-2 pb-5 sm:gap-3 sm:px-3 md:gap-4 lg:min-h-[calc(100dvh-17rem)] scrollbar-thin scrollbar-track-slate-950/40 scrollbar-thumb-slate-700"
                )}
              >
                {columns.map((column) => {
                  const columnTasks = tasksByColumn[column.id] ?? [];
                  return (
                    <div
                      key={column.id}
                      className={cn(
                        "task-board-column flex flex-col flex-shrink-0 rounded-xl",
                        "w-[calc(100vw-1rem)] min-w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] sm:w-auto sm:min-w-[280px] sm:max-w-[320px] xl:min-w-[300px] xl:max-w-[340px] 2xl:min-w-[320px] 2xl:max-w-[360px]"
                      )}
                    >
                    <Card
                      className={cn(
                        "flex flex-col w-full min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-900/92 shadow-sm backdrop-blur-sm text-slate-100"
                      )}
                    >
                      <CardHeader className="border-b border-slate-800 bg-slate-900/95 p-3 pb-2 sm:p-4 sm:pb-3">
                        <CardTitle className="text-xs sm:text-sm font-semibold flex items-center justify-between gap-2">
                          <span className="text-foreground truncate flex items-center gap-1.5 min-w-0 flex-1">
                            {editingColumnId === column.id ? (
                              <Input
                                value={editingColumnName}
                                onChange={(event) => setEditingColumnName(event.target.value)}
                                onClick={(event) => event.stopPropagation()}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    handleRenameColumn(column.id);
                                  }
                                  if (event.key === "Escape") {
                                    setEditingColumnId(null);
                                    setEditingColumnName("");
                                  }
                                }}
                                onBlur={() => handleRenameColumn(column.id)}
                                className="h-7 min-w-0 flex-1 border-slate-700 bg-slate-950 text-xs text-slate-50"
                                autoFocus
                              />
                            ) : (
                              <span className="truncate">{column.name}</span>
                            )}
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs tabular-nums text-slate-300">{columnTasks.length}</span>
                            {!currentSection?.yougileBoardId && editingColumnId !== column.id && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-primary"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setEditingColumnId(column.id);
                                  setEditingColumnName(column.name);
                                }}
                                title="Переименовать столбец"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {currentSection?.localProjectId && effectiveColumns.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleDeleteColumn(column.id);
                                }}
                                title="Удалить столбец"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </span>
                        </CardTitle>
                        <QuickAddTaskInput
                          columnId={column.id}
                          onAdd={async (colId, title) => {
                            if (!currentUser?.id) {
                              toast({ title: "Ошибка", description: "Войдите в систему для создания задачи", variant: "destructive" });
                              return false;
                            }
                            const payload: any = { title, description: "", status: colId, priority: "medium", assigneeId: null, dueDate: null, __quickAdd: true };
                            if (currentSection?.yougileBoardId) payload.yougileBoardId = currentSection.yougileBoardId;
                            if (currentSection?.localProjectId) {
                              payload.projectId = currentSection.localProjectId;
                              payload.projectColumnId = colId;
                            }
                            await createMutation.mutateAsync(payload);
                          }}
                          className={cn("h-8 sm:h-9 text-xs rounded-lg border-border flex-1 min-w-0", BG_BACKGROUND_OPACITY)}
                        />
                      </CardHeader>
                          <CardContent
                            onDragOver={(event) => {
                              if (!draggingTaskId) return;
                              event.preventDefault();
                              event.dataTransfer.dropEffect = "move";
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              const taskId = getDroppedTaskId(event);
                              if (taskId) moveTaskToColumn(taskId, column.id, columnTasks.length);
                              handleNativeDragEnd();
                            }}
                            className={cn(
                              "flex-1 space-y-2 sm:space-y-3 p-3 min-h-[220px] max-h-[calc(100dvh-330px)] lg:max-h-[calc(100dvh-19.5rem)] overflow-y-auto overflow-x-hidden task-column-content bg-slate-950/35 scrollbar-thin scrollbar-track-slate-950/30 scrollbar-thumb-slate-700",
                              draggingTaskId && "bg-primary/10 rounded-b-xl"
                            )}
                          >
                            {columnTasks.length === 0 ? (
                              <div className="text-center text-sm text-muted-foreground py-12 flex flex-col items-center gap-2">
                                <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                  <Circle className="w-6 h-6 text-slate-400" />
                                </div>
                                <span>Нет задач</span>
                              </div>
                            ) : (
                              columnTasks.map((task, index) => {
                                const isDraggingTask = draggingTaskId === task.id;
                                return (
                                <div
                                  key={task.id}
                                  draggable={!(isSectionFormOpen || isFormOpen || isColumnFormOpen)}
                                  onDragStart={(event) => handleNativeDragStart(event, task.id)}
                                  onDragEnd={handleNativeDragEnd}
                                  onDragOver={(event) => {
                                    if (!draggingTaskId || draggingTaskId === task.id) return;
                                    event.preventDefault();
                                    event.dataTransfer.dropEffect = "move";
                                  }}
                                  onDrop={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    const taskId = getDroppedTaskId(event);
                                    if (taskId && taskId !== task.id) moveTaskToColumn(taskId, column.id, index);
                                    handleNativeDragEnd();
                                  }}
                                  className={cn(
                                    "rounded-xl min-h-[88px] flex-shrink-0 cursor-grab active:cursor-grabbing",
                                    !isDraggingTask && "transition-shadow duration-150",
                                    isDraggingTask && "shadow-2xl ring-2 ring-primary z-[50] bg-card"
                                  )}
                                >
                                  <TaskCard
                                    task={task}
                                    index={index}
                                    provided={{ dragHandleProps: {} }}
                                    snapshot={{ isDragging: isDraggingTask }}
                                    users={users}
                                    taskComments={taskComments}
                                    updateMutation={updateMutation}
                                    getUserAvatar={getUserAvatar}
                                    getUserInitials={getUserInitials}
                                    handleStatusChange={handleStatusChange}
                                    setSelectedTaskForView={setSelectedTaskForView}
                                    getTaskTag={getTaskTag}
                                    getProjectColor={getProjectColor}
                                    getDeadlineColor={getDeadlineColor}
                                    getCardAccentColor={getCardAccentColor}
                                    effectiveColumns={effectiveColumns}
                                    effectiveStickerPresets={effectiveStickerPresets}
                                  />
                                </div>
                              );
                            })
                            )}
                          </CardContent>
                    </Card>
                    </div>
                  );
                })}
              </div>
          </div>
          );
        })() : null}

        {/* Боковая панель для просмотра задачи */}
        <Sheet modal={false} open={!!selectedTaskForView} onOpenChange={(open) => !open && setSelectedTaskForView(null)}>
          <SheetContent
            side="right"
            className="w-full sm:max-w-lg md:max-w-2xl lg:max-w-3xl overflow-y-auto overflow-x-hidden hide-scrollbar touch-scroll-smooth p-3 sm:p-6 max-h-[100dvh] md:max-h-none pb-24 md:pb-6 safe-area-bottom"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            {selectedTaskForView && (
              <Tabs value={taskDetailTab} onValueChange={(v) => setTaskDetailTab(v as "info" | "comments" | "history")} className="w-full flex flex-col">
                <SheetHeader className="mb-4 sm:mb-6 shrink-0">
                  <SheetTitle className="text-lg sm:text-xl md:text-2xl font-bold break-words">{selectedTaskForView.title}</SheetTitle>
                  <SheetDescription className="text-xs sm:text-sm break-words">
                    {selectedTaskForView.description || "Нет описания"}
                  </SheetDescription>
                </SheetHeader>

                <TabsList className="grid w-full grid-cols-3 mb-4 sm:mb-6 h-9 sm:h-10 shrink-0">
                  <TabsTrigger value="info" className="text-xs sm:text-sm px-2 sm:px-4">Информация</TabsTrigger>
                  <TabsTrigger value="comments" className="text-xs sm:text-sm px-2 sm:px-4">
                    <span className="hidden sm:inline">Комментарии</span>
                    <span className="sm:hidden">Комм</span>
                    {taskComments[selectedTaskForView.id]?.length > 0 && (
                      <Badge variant="secondary" className="ml-1 sm:ml-2 h-4 w-4 sm:h-5 sm:w-5 rounded-full p-0 flex items-center justify-center text-[10px] sm:text-xs">
                        {taskComments[selectedTaskForView.id].length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="history" className="text-xs sm:text-sm px-2 sm:px-4">История</TabsTrigger>
                </TabsList>

                <div className="min-h-[360px] flex-1 overflow-y-auto -mx-1 px-1">
                <TabsContent value="info" forceMount className={cn("space-y-4 sm:space-y-6 mt-0 min-h-[320px]", taskDetailTab !== "info" && "hidden")}>
                  {/* Стикеры: дедлайн и приоритет — z-[110] чтобы попап был поверх Sheet (z-[100]) */}
                  <div className="space-y-2">
                    <Label className="text-xs sm:text-sm font-semibold">Стикеры</Label>
                    <div className="flex flex-wrap gap-2">
                      <Popover open={deadlinePopoverOpen} onOpenChange={setDeadlinePopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 rounded-lg text-xs sm:text-sm">
                            <CalendarIcon className="w-3.5 h-3.5" />
                            {selectedTaskForView.dueDate
                              ? format(new Date(selectedTaskForView.dueDate), "d MMM yyyy", { locale: ru })
                              : "Дедлайн"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 border-0 shadow-xl rounded-xl overflow-hidden z-[110]" align="start">
                          <div className="p-3 bg-card">
                            <CalendarPicker
                              mode="single"
                              locale={ru}
                              formatters={{
                                formatWeekdayName: (date) => format(date, "EEE", { locale: ru }),
                              }}
                              selected={selectedTaskForView.dueDate ? new Date(selectedTaskForView.dueDate) : undefined}
                              onSelect={(date) => {
                                if (!date) return;
                                const d = new Date(date);
                                d.setHours(18, 0, 0, 0);
                                updateMutation.mutate({
                                  id: selectedTaskForView.id,
                                  data: { dueDate: d.toISOString() } as unknown as Partial<Task>,
                                });
                                setDeadlinePopoverOpen(false);
                              }}
                              className="rounded-lg"
                              classNames={{
                                months: "flex flex-col sm:flex-row gap-4",
                                month: "space-y-3",
                                caption: "flex justify-center pt-1 relative items-center",
                                caption_label: "text-sm font-semibold",
                                nav: "space-x-1 flex items-center",
                                nav_button: "h-8 w-8 bg-transparent p-0 opacity-70 hover:opacity-100 rounded-lg border border-input",
                                table: "w-full border-collapse space-y-1",
                                head_row: "flex",
                                head_cell: "text-muted-foreground rounded-md w-9 font-medium text-[0.65rem] uppercase tracking-wider",
                                row: "flex w-full mt-1",
                                cell: "h-9 w-9 text-center text-sm p-0 relative rounded-md",
                                day: "h-9 w-9 p-0 font-normal aria-selected:opacity-100 rounded-md hover:bg-accent",
                                day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                                day_today: "bg-accent text-accent-foreground font-semibold",
                                day_outside: "text-muted-foreground opacity-50",
                              }}
                            />
                          </div>
                        </PopoverContent>
                      </Popover>
                      <Popover open={priorityPopoverOpen} onOpenChange={setPriorityPopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 rounded-lg text-xs sm:text-sm">
                            <BarChart3 className="w-3.5 h-3.5" />
                            {getPriorityLabel(selectedTaskForView.priority || "medium")}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-48 p-2 rounded-xl z-[110]" align="start">
                          <div className="grid gap-0.5">
                            {priorities.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                  updateMutation.mutate({
                                    id: selectedTaskForView.id,
                                    data: { priority: p.id },
                                  });
                                  setPriorityPopoverOpen(false);
                                }}
                                className={cn(
                                  "flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                                  selectedTaskForView.priority === p.id
                                    ? "bg-primary text-primary-foreground"
                                    : "hover:bg-accent"
                                )}
                              >
                                <span className={cn("w-2 h-2 rounded-full shrink-0", p.color)} />
                                {p.label}
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  {/* Основная информация */}
                  <div className="space-y-3 sm:space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <div>
                        <Label className="text-xs sm:text-sm font-semibold mb-1.5 sm:mb-2 block">Статус</Label>
                        <Badge variant="secondary" className="rounded-full text-xs sm:text-sm">
                          {`${getStatusLabel(String(selectedTaskForView.status ?? ""), effectiveColumns)}`}
                        </Badge>
                      </div>

                      <div>
                        <Label className="text-xs sm:text-sm font-semibold mb-1.5 sm:mb-2 block">Приоритет</Label>
                        <Badge className={cn("rounded-full text-xs sm:text-sm", getPriorityColor(selectedTaskForView.priority || "medium"))}>
                          {`${getPriorityLabel(selectedTaskForView.priority || "medium")}`}
                        </Badge>
                      </div>
                    </div>

                    <div>
                      <Label className="text-sm font-semibold mb-2 block">Исполнители</Label>
                      <div className="flex flex-wrap gap-2">
                        {users.map((user) => {
                          const selectedIds = getTaskAssigneeIds(selectedTaskForView);
                          const checked = selectedIds.includes(user.id);
                          return (
                            <button
                              key={user.id}
                              type="button"
                              onClick={() => {
                                const currentIds = getTaskAssigneeIds(selectedTaskForView);
                                const nextIds = checked ? currentIds.filter((id) => id !== user.id) : [...currentIds, user.id];
                                updateMutation.mutate({
                                  id: selectedTaskForView.id,
                                  data: {
                                    assigneeId: nextIds[0] || null,
                                    tags: buildAssigneeTags(selectedTaskForView, nextIds, users),
                                  } as any,
                                });
                              }}
                              className={cn(
                                "flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs transition-colors",
                                checked ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:border-primary/50"
                              )}
                            >
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={getUserAvatar(user.id) || undefined} />
                                <AvatarFallback className="text-[10px]">{getUserInitials(user.id) || "?"}</AvatarFallback>
                              </Avatar>
                              <span className="max-w-[140px] truncate">{user.name || user.username}</span>
                            </button>
                          );
                        })}
                        {users.length === 0 && <p className="text-sm text-muted-foreground">Сотрудники пока не загружены</p>}
                      </div>
                    </div>

                    {selectedTaskForView.assigneeId && (
                      <div>
                        <Label className="text-sm font-semibold mb-2 block">Исполнитель</Label>
                        <div className="flex items-center gap-2">
                          <Avatar className="w-8 h-8">
                            <AvatarImage src={getUserAvatar(selectedTaskForView.assigneeId) || undefined} />
                            <AvatarFallback>
                              {getUserInitials(selectedTaskForView.assigneeId) || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <span>{getUserName(selectedTaskForView.assigneeId)}</span>
                        </div>
                      </div>
                    )}

                    {selectedTaskForView.dueDate && (
                      <div>
                        <Label className="text-sm font-semibold mb-2 block">Дедлайн</Label>
                        <div className="flex items-center gap-2">
                          <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                          <span>{format(new Date(selectedTaskForView.dueDate), "dd.MM.yyyy HH:mm", { locale: ru })}</span>
                        </div>
                      </div>
                    )}

                    {selectedTaskForView.category && (
                      <div>
                        <Label className="text-sm font-semibold mb-2 block">Категория</Label>
                        <Badge variant="outline">{selectedTaskForView.category}</Badge>
                      </div>
                    )}

                    {selectedTaskForView.repository && (
                      <div>
                        <Label className="text-sm font-semibold mb-2 block">Репозиторий</Label>
                        <a href={selectedTaskForView.repository} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-2">
                          <Github className="w-4 h-4" />
                          {selectedTaskForView.repository}
                        </a>
                      </div>
                    )}

                    {selectedTaskForView.estimatedHours && (
                      <div>
                        <Label className="text-sm font-semibold mb-2 block">Оценка времени</Label>
                        <div className="flex items-center gap-2">
                          <Hourglass className="w-4 h-4 text-muted-foreground" />
                          <span>{selectedTaskForView.estimatedHours} часов</span>
                        </div>
                      </div>
                    )}

                    {/* Стикеры — заготовленный выбор, как в YouGile */}
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold flex items-center gap-2">
                        <Tag className="w-4 h-4" />
                        Стикеры
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {(Array.isArray((selectedTaskForView as any).tags) ? (selectedTaskForView as any).tags : []).filter((tag: any) => tag?.id !== MULTI_ASSIGNEE_TAG_ID && tag?.id !== KANBAN_ORDER_TAG_ID).map((tag: any) => {
                          const name = typeof tag === "object" && tag?.name != null ? tag.name : String(tag?.id ?? tag);
                          const value = typeof tag === "object" && tag?.value != null ? tag.value : undefined;
                          const displayValue = value && users?.length ? (users.find((u) => u.id === value)?.name ?? value) : value;
                          const label = displayValue ? `${name}: ${displayValue}` : name;
                          const preset = effectiveStickerPresets.find(p => p.id === tag?.id || p.name === name);
                          const color = tag?.color ?? preset?.color;
                          const icon = preset?.icon ?? tag?.icon;
                          return (
                            <span
                              key={tag?.id ?? name}
                              className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-white", getStickerClass(color))}
                            >
                              {icon === "archive" && <Filter className="w-3 h-3 shrink-0" />}
                              {icon === "clock" && <Clock className="w-3 h-3 shrink-0" />}
                              {label}
                              <button
                                type="button"
                                onClick={() => {
                                  const list = [...((selectedTaskForView as any).tags || [])].filter((t: any) => (t?.id ?? t?.name) !== (tag?.id ?? name));
                                  updateMutation.mutate({ id: selectedTaskForView.id, data: { tags: list } });
                                }}
                                className="ml-0.5 rounded p-0.5 hover:bg-white/20"
                                aria-label="Удалить стикер"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          );
                        })}
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 gap-1 rounded-lg text-xs border-dashed">
                              <Plus className="w-3.5 h-3.5" />
                              Добавить стикер
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-2 rounded-xl z-[110]" align="start">
                            <div className="grid gap-0.5">
                              {effectiveStickerPresets.filter(p => {
                                const cur = (selectedTaskForView as any).tags || [];
                                return !cur.some((t: any) => t?.id === p.id || t?.name === p.name);
                              }).map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => {
                                    const list = [...((selectedTaskForView as any).tags || [])];
                                    list.push({ id: p.id, name: p.name, color: p.color, icon: p.icon });
                                    updateMutation.mutate({ id: selectedTaskForView.id, data: { tags: list } });
                                  }}
                                  className={cn(
                                    "flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-white transition-opacity hover:opacity-90",
                                    getStickerClass(p.color)
                                  )}
                                >
                                  {p.icon === "archive" && <Filter className="w-3.5 h-3.5 shrink-0" />}
                                  {p.icon === "clock" && <Clock className="w-3.5 h-3.5 shrink-0" />}
                                  {p.name}
                                </button>
                              ))}
                              {effectiveStickerPresets.every(p => {
                                const cur = (selectedTaskForView as any).tags || [];
                                return cur.some((t: any) => t?.id === p.id || t?.name === p.name);
                              }) && effectiveStickerPresets.length > 0 && (
                                <p className="text-xs text-muted-foreground px-2 py-1">Все стикеры добавлены</p>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>

                      {/* Стикеры доски: выбор из списка или ввод (как в YouGile) */}
                      {boardStickersRaw.length > 0 && (
                        <div className="space-y-2 pt-2 border-t">
                          <Label className="text-xs text-muted-foreground">Добавить стикер доски</Label>
                          {(boardStickersRaw as BoardStickerItem[]).filter((sticker) => !(selectedTaskForView as any).tags?.some((t: any) => t?.id === sticker.id)).map((sticker) => (
                            <div key={sticker.id} className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-medium w-28 shrink-0">{sticker.title}</span>
                              {sticker.type === "user" ? (
                                <Select
                                  value={editingStickerValues[sticker.id] || ""}
                                  onValueChange={(v) => setEditingStickerValues((prev) => ({ ...prev, [sticker.id]: v }))}
                                >
                                  <SelectTrigger className="h-8 flex-1 min-w-[120px] text-xs">
                                    <SelectValue placeholder="Исполнитель" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="">Не выбрано</SelectItem>
                                    {users.map((u) => (
                                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : sticker.type === "list" && sticker.options?.length ? (
                                <Select
                                  value={editingStickerValues[sticker.id] || ""}
                                  onValueChange={(v) => setEditingStickerValues((prev) => ({ ...prev, [sticker.id]: v }))}
                                >
                                  <SelectTrigger className="h-8 flex-1 min-w-[120px] text-xs">
                                    <SelectValue placeholder="Выберите" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="">Не выбрано</SelectItem>
                                    {sticker.options.map((opt) => (
                                      <SelectItem key={opt.id} value={opt.id}>{opt.title ?? opt.id}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Input
                                  placeholder="Введите значение"
                                  className="h-8 flex-1 min-w-[120px] text-xs"
                                  value={editingStickerValues[sticker.id] ?? ""}
                                  onChange={(e) => setEditingStickerValues((prev) => ({ ...prev, [sticker.id]: e.target.value }))}
                                />
                              )}
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="h-8 text-xs"
                                onClick={() => {
                                  const val = editingStickerValues[sticker.id]?.trim();
                                  if (!val) return;
                                  const cur = (selectedTaskForView as any).tags || [];
                                  const next = [...cur, { id: sticker.id, name: sticker.title, value: val }];
                                  updateMutation.mutate({ id: selectedTaskForView.id, data: { tags: next } });
                                  setEditingStickerValues((prev) => ({ ...prev, [sticker.id]: "" }));
                                }}
                              >
                                Добавить
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Подзадачи (чеклист) */}
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold flex items-center gap-2">
                        <ListTodo className="w-4 h-4" />
                        Подзадачи {Array.isArray((selectedTaskForView as any).subtasks) ? `(${(selectedTaskForView as any).subtasks.filter((s: any) => s.completed).length}/${(selectedTaskForView as any).subtasks.length})` : ""}
                      </Label>
                      {Array.isArray((selectedTaskForView as any).subtasks) && (selectedTaskForView as any).subtasks.length > 0 ? (
                        <div className="space-y-1.5">
                          {(selectedTaskForView as any).subtasks.map((st: { id: string; title: string; completed?: boolean }) => (
                            <div key={st.id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                              <Checkbox
                                checked={!!st.completed}
                                onCheckedChange={(checked) => {
                                  const list = [...((selectedTaskForView as any).subtasks || [])];
                                  const idx = list.findIndex((s: any) => s.id === st.id);
                                  if (idx >= 0) {
                                    list[idx] = { ...list[idx], completed: !!checked };
                                    updateMutation.mutate({ id: selectedTaskForView.id, data: { subtasks: list } });
                                  }
                                }}
                                className="h-4 w-4"
                              />
                              <span className={cn("flex-1 text-sm", st.completed && "line-through text-muted-foreground")}>{st.title}</span>
                            </div>
                          ))}
                          <QuickAddSubtaskInput
                            taskId={selectedTaskForView.id}
                            onAdd={(title) => {
                              const list = [...((selectedTaskForView as any).subtasks || [])];
                              list.push({ id: `st-${Date.now()}`, title, completed: false });
                              updateMutation.mutate({ id: selectedTaskForView.id, data: { subtasks: list } });
                            }}
                            className="h-8 text-sm rounded-lg border border-dashed border-slate-300 dark:border-slate-600"
                          />
                        </div>
                      ) : (
                        <QuickAddSubtaskInput
                          taskId={selectedTaskForView.id}
                          onAdd={(title) => {
                            const list = [{ id: `st-${Date.now()}`, title, completed: false }];
                            updateMutation.mutate({ id: selectedTaskForView.id, data: { subtasks: list } });
                          }}
                          className="h-8 text-sm rounded-lg border border-dashed border-slate-300 dark:border-slate-600"
                        />
                      )}
                    </div>
                  </div>

                  {/* Ссылки */}
                  {Array.isArray(selectedTaskForView.links) && selectedTaskForView.links.length > 0 ? (
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold flex items-center gap-2">
                        <Link2 className="w-4 h-4" />
                        Ссылки
                      </Label>
                      <div className="space-y-2">
                        {(selectedTaskForView.links as any[]).map((link: any, index: number) => (
                          <a
                            key={index}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                          >
                            <Link2 className="w-4 h-4 text-muted-foreground" />
                            <span className="flex-1 text-sm font-medium">{link.title}</span>
                            <X className="w-3 h-3 rotate-45 text-muted-foreground" />
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Файлы */}
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold flex items-center gap-2">
                      <Paperclip className="w-4 h-4" />
                      Файлы
                    </Label>
                    <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary">
                      <Paperclip className="h-3.5 w-3.5" />
                      Прикрепить файл
                      <input
                        type="file"
                        className="hidden"
                        multiple
                        onChange={(event) => {
                          const files = Array.from(event.target.files || []);
                          if (!files.length) return;
                          const current = Array.isArray(selectedTaskForView.attachments) ? selectedTaskForView.attachments as any[] : [];
                          const next = [...current, ...files.map(makeLocalAttachment)];
                          updateMutation.mutate({ id: selectedTaskForView.id, data: { attachments: next } as any });
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                    {selectedTaskForView.attachments && Array.isArray(selectedTaskForView.attachments) && selectedTaskForView.attachments.length > 0 ? (
                      <div className="space-y-2">
                        {(selectedTaskForView.attachments as any[]).map((file: any, index: number) => (
                          <div key={index} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                            <Paperclip className="w-4 h-4 text-muted-foreground" />
                            <span className="flex-1 text-sm">{file.name || `Файл ${index + 1}`}</span>
                            {file.url && (
                              <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-sm">
                                Открыть
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Нет прикрепленных файлов</p>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="comments" forceMount className={cn("space-y-3 sm:space-y-4 mt-0 min-h-[320px]", taskDetailTab !== "comments" && "hidden")}>
                  <ScrollArea className="h-[320px] sm:h-[400px] pr-2 sm:pr-4">
                    <div className="space-y-3 sm:space-y-4">
                      {isLoadingComments[selectedTaskForView?.id] ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-primary"></div>
                        </div>
                      ) : taskComments[selectedTaskForView?.id]?.length > 0 ? (
                        taskComments[selectedTaskForView?.id].map((comment: any) => (
                          <div key={comment.id} className="p-3 sm:p-4 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                            <div className="flex items-start gap-2 sm:gap-3">
                              <Avatar className="w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0">
                                <AvatarImage src={getUserAvatar(comment.userId) || undefined} />
                                <AvatarFallback className="text-xs sm:text-sm">
                                  {getUserInitials(comment.userId) || "?"}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
                                  <span className="font-medium text-xs sm:text-sm">{getUserName(comment.userId)}</span>
                                  <span className="text-[10px] sm:text-xs text-muted-foreground">
                                    {format(new Date(comment.createdAt), "dd.MM.yyyy HH:mm", { locale: ru })}
                                  </span>
                                </div>
                                <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
                                  {comment.content}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs sm:text-sm text-muted-foreground text-center py-8">Нет комментариев</p>
                      )}
                    </div>
                  </ScrollArea>

                  <div className="border-t pt-3 sm:pt-4">
                    <div className="space-y-2">
                      <Textarea
                        placeholder="Добавить комментарий..."
                        value={newComment[selectedTaskForView?.id] || ""}
                        onChange={(e) => setNewComment(prev => ({ ...prev, [selectedTaskForView?.id ?? ""]: e.target.value }))}
                        rows={3}
                        className="resize-none text-xs sm:text-sm"
                      />
                      <Button
                        onClick={() => selectedTaskForView?.id && handleAddComment(selectedTaskForView.id)}
                        disabled={!newComment[selectedTaskForView?.id]?.trim()}
                        className="w-full h-9 sm:h-10 text-xs sm:text-sm"
                      >
                        <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
                        Добавить комментарий
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="history" forceMount className={cn("space-y-3 sm:space-y-4 mt-0 min-h-[320px]", taskDetailTab !== "history" && "hidden")}>
                  <ScrollArea className="h-[320px] sm:h-[400px] pr-2 sm:pr-4">
                    {isLoadingHistory[selectedTaskForView?.id] ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-primary"></div>
                      </div>
                    ) : taskHistory[selectedTaskForView?.id]?.length > 0 ? (
                      <div className="space-y-2 sm:space-y-3">
                        {taskHistory[selectedTaskForView?.id].map((item: any) => (
                          <div key={item.id} className="p-3 sm:p-4 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                            <div className="flex items-start gap-2 sm:gap-3">
                              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
                                  <span className="font-medium text-xs sm:text-sm">{getUserName(item.userId)}</span>
                                  <Badge variant="outline" className="text-[10px] sm:text-xs w-fit">
                                    {item.action === "created" ? "Создано" :
                                     item.action === "updated" ? "Обновлено" :
                                     item.action === "status_changed" ? "Статус изменен" :
                                     item.action === "assigned" ? "Назначено" :
                                     item.action === "commented" ? "Комментарий" : item.action}
                                  </Badge>
                                  <span className="text-[10px] sm:text-xs text-muted-foreground">
                                    {format(new Date(item.createdAt), "dd.MM.yyyy HH:mm", { locale: ru })}
                                  </span>
                                </div>
                                {item.newValue && typeof item.newValue === "object" && (
                                  <div className="text-[10px] sm:text-xs text-muted-foreground mt-1 break-words">
                                    {JSON.stringify(item.newValue, null, 2).substring(0, 100)}...
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs sm:text-sm text-muted-foreground text-center py-8">Нет истории изменений</p>
                    )}
                  </ScrollArea>
                </TabsContent>
                </div>
              </Tabs>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </TasksLayout>
  );
}

