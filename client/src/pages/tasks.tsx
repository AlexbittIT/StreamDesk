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

/** РЎСЃС‹Р»РєР° РЅР° Р·Р°РґР°С‡Рё YouGile. РЎРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ С‚РѕР»СЊРєРѕ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєР°СЏ (СЂР°Р· РІ РјРёРЅСѓС‚Сѓ), РєРЅРѕРїРєР° РЅРµ РїРѕРєР°Р·С‹РІР°РµС‚СЃСЏ. */
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
      <Button size="sm" variant="ghost" className="rounded-xl h-9 sm:h-10 px-3 shrink-0" title="Р—Р°РґР°С‡Рё YouGile">
        YouGile
      </Button>
    </Link>
  );
}

/** РџРѕР»Рµ Р±С‹СЃС‚СЂРѕРіРѕ РґРѕР±Р°РІР»РµРЅРёСЏ Р·Р°РґР°С‡Рё: СЃРІРѕС‘ СЃРѕСЃС‚РѕСЏРЅРёРµ РІРЅСѓС‚СЂРё, С‡С‚РѕР±С‹ РїСЂРё СЂРµ-СЂРµРЅРґРµСЂРµ СЂРѕРґРёС‚РµР»СЏ (СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ Рё С‚.Рґ.) РЅРµ С‚РµСЂСЏР»СЃСЏ С„РѕРєСѓСЃ Рё РІРІРѕРґ. */
function QuickAddTaskInput({
  columnId,
  onAdd,
  disabled,
  placeholder = "Р”РѕР±Р°РІРёС‚СЊ Р·Р°РґР°С‡Сѓ",
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
        placeholder="Р”РѕР±Р°РІРёС‚СЊ РїРѕРґР·Р°РґР°С‡Сѓ"
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
  { id: "not_ready", name: "Р‘СЌРєР»РѕРі", order: 0 },
  { id: "todo", name: "Рљ РІС‹РїРѕР»РЅРµРЅРёСЋ", order: 1 },
  { id: "in_progress", name: "Р’ СЂР°Р±РѕС‚Рµ", order: 2 },
  { id: "done", name: "Р“РѕС‚РѕРІРѕ", order: 3 },
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
      name: String(c?.name ?? "РЎС‚РѕР»Р±РµС†"),
      order: Number(c?.order) ?? i,
    }));
  } catch {
    return DEFAULT_COLUMNS;
  }
}

/** Р§РµР»РѕРІРµРєРѕС‡РёС‚Р°РµРјРѕРµ РЅР°Р·РІР°РЅРёРµ СЃС‚Р°С‚СѓСЃР°: РїРѕ РєРѕР»РѕРЅРєР°Рј РёР»Рё Р·Р°РїР°СЃРЅС‹Рµ РґР»СЏ todo/in_progress/done/not_ready */
function getStatusLabel(statusId: string | null | undefined, columns: Column[]): string {
  if (!statusId) return "вЂ”";
  const fromCol = columns.find(c => c.id === statusId)?.name;
  if (fromCol) return fromCol;
  const fallback: Record<string, string> = {
    not_ready: "Р‘СЌРєР»РѕРі",
    todo: "Рљ РІС‹РїРѕР»РЅРµРЅРёСЋ",
    in_progress: "Р’ СЂР°Р±РѕС‚Рµ",
    done: "Р“РѕС‚РѕРІРѕ",
  };
  return fallback[statusId] ?? statusId;
}

const KANBAN_CARD_BG = "bg-card/85 dark:bg-card/90";
const BORDER_BORDER_OPACITY = "border-border/70";
const BG_BACKGROUND_OPACITY = "bg-background/80";

/** Р­Р»РµРјРµРЅС‚ СЃРїРёСЃРєР° СЃС‚РёРєРµСЂРѕРІ (СЃ РґРѕСЃРєРё YouGile РёР»Рё РІСЃС‚СЂРѕРµРЅРЅС‹Р№) */
type StickerPresetItem = { id: string; name: string; color: string; icon?: "archive" | "clock" };

/** РЎС‚РёРєРµСЂ РґРѕСЃРєРё YouGile СЃ С‚РёРїРѕРј Рё РѕРїС†РёСЏРјРё: list вЂ” РІС‹Р±РѕСЂ РёР· СЃРїРёСЃРєР°, string вЂ” РІРІРѕРґ С‚РµРєСЃС‚Р°, user вЂ” РёСЃРїРѕР»РЅРёС‚РµР»СЊ */
type BoardStickerItem = { id: string; title: string; type: "list" | "string" | "user"; options?: Array<{ id: string; title?: string }> };

/** РўРµРі Р·Р°РґР°С‡Рё СЃ РѕРїС†РёРѕРЅР°Р»СЊРЅС‹Рј Р·РЅР°С‡РµРЅРёРµРј (РІС‹Р±СЂР°РЅРЅС‹Р№ РІР°СЂРёР°РЅС‚ РёР»Рё РІРІРµРґС‘РЅРЅС‹Р№ С‚РµРєСЃС‚) */
type TaskTagWithValue = { id: string; name: string; color?: string; icon?: string; value?: string };

/** Р—Р°РіРѕС‚РѕРІР»РµРЅРЅС‹Рµ СЃС‚РёРєРµСЂС‹ (РєР°Рє РІ YouGile) вЂ” РјРѕР¶РЅРѕ РґРѕР±Р°РІР»СЏС‚СЊ Рє Р·Р°РґР°С‡Рµ Рё РѕС‚РјРµС‡Р°С‚СЊ */
const STICKER_PRESETS: StickerPresetItem[] = [
  { id: "archive", name: "РђСЂС…РёРІ", color: "slate", icon: "archive" },
  { id: "urgent", name: "РЎСЂРѕС‡РЅРѕ", color: "red", icon: "clock" },
  { id: "in-work", name: "Р’ СЂР°Р±РѕС‚Рµ", color: "blue" },
  { id: "review", name: "РќР° РїСЂРѕРІРµСЂРєРµ", color: "amber" },
  { id: "lecture", name: "Р›РµРєС†РёСЏ", color: "violet" },
  { id: "lab", name: "Р›Р°Р±Р°", color: "green", icon: "clock" },
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
    name: "РСЃРїРѕР»РЅРёС‚РµР»СЊ",
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

/** Р Р°Р·РґРµР»С‹ С‚РѕР»СЊРєРѕ В«РњРѕРё Р·Р°РґР°С‡РёВ» (Р»РѕРєР°Р»СЊРЅРѕ). Р”РѕСЃРєРё вЂ” С‚РѕР»СЊРєРѕ РёР· YouGile, РїРѕРґРіСЂСѓР¶Р°СЋС‚СЃСЏ РїРѕ API. */
function loadSections(_users: UserType[] = [], currentUser: any = null): Section[] {
  if (typeof window === 'undefined') return [];
  const cols = getDefaultColumns();
  return [{ id: 'my-tasks', name: 'РњРѕРё Р·Р°РґР°С‡Рё', columns: cols, userId: currentUser?.id }];
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
  { id: "low", label: "РќРёР·РєРёР№", color: "bg-gray-500" },
  { id: "medium", label: "РЎСЂРµРґРЅРёР№", color: "bg-blue-500" },
  { id: "high", label: "Р’С‹СЃРѕРєРёР№", color: "bg-orange-500" },
  { id: "urgent", label: "РЎСЂРѕС‡РЅС‹Р№", color: "bg-red-500" },
];

// Р“РµРЅРµСЂР°С†РёСЏ РјРµСЃСЏС†РµРІ Рё С‡РёСЃРµР»
const months = [
  "РЇРЅРІР°СЂСЊ", "Р¤РµРІСЂР°Р»СЊ", "РњР°СЂС‚", "РђРїСЂРµР»СЊ", "РњР°Р№", "РСЋРЅСЊ",
  "РСЋР»СЊ", "РђРІРіСѓСЃС‚", "РЎРµРЅС‚СЏР±СЂСЊ", "РћРєС‚СЏР±СЂСЊ", "РќРѕСЏР±СЂСЊ", "Р”РµРєР°Р±СЂСЊ"
];

const getDaysInMonth = (month: number, year: number) => {
  return new Date(year, month + 1, 0).getDate();
};

const timeOptions = ["00", "15", "30", "45"];

// Р¤СѓРЅРєС†РёСЏ РґР»СЏ РїРѕР»СѓС‡РµРЅРёСЏ С†РІРµС‚Р° РґРµРґР»Р°Р№РЅР° (РїСЂРёРЅРёРјР°РµС‚ ISO-СЃС‚СЂРѕРєСѓ РёР»Рё Date РёР· API/СЃС…РµРјС‹)
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
  // РЎРѕСЃС‚РѕСЏРЅРёСЏ РґР»СЏ РІС‹Р±РѕСЂР° РґРµРґР»Р°Р№РЅР°
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDate());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedHour, setSelectedHour] = useState<string>("00");
  const [selectedMinute, setSelectedMinute] = useState<string>("00");
  const [newTaskDueDate, setNewTaskDueDate] = useState<string>("");
  
  // РЎРѕСЃС‚РѕСЏРЅРёСЏ РґР»СЏ РїРѕРґР·Р°РґР°С‡ Рё С„Р°Р№Р»РѕРІ
  const [subtasks, setSubtasks] = useState<Array<{ id: string; title: string; completed: boolean }>>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<Array<{ id: string; name: string; url: string }>>([]);
  const [newTaskTags, setNewTaskTags] = useState<TaskTagWithValue[]>([]);
  /** Р—РЅР°С‡РµРЅРёСЏ СЃС‚РёРєРµСЂРѕРІ РґРѕСЃРєРё РїСЂРё СЃРѕР·РґР°РЅРёРё: id СЃС‚РёРєРµСЂР° в†’ РІС‹Р±СЂР°РЅРЅРѕРµ/РІРІРµРґС‘РЅРЅРѕРµ Р·РЅР°С‡РµРЅРёРµ */
  const [newTaskStickerValues, setNewTaskStickerValues] = useState<Record<string, string>>({});
  /** Р’ РїСЂРѕСЃРјРѕС‚СЂРµ Р·Р°РґР°С‡Рё: Р·РЅР°С‡РµРЅРёРµ СЃС‚РёРєРµСЂР° РґРѕСЃРєРё РїРµСЂРµРґ РґРѕР±Р°РІР»РµРЅРёРµРј (id в†’ Р·РЅР°С‡РµРЅРёРµ) */
  const [editingStickerValues, setEditingStickerValues] = useState<Record<string, string>>({});
  const [selectedTaskForView, setSelectedTaskForView] = useState<Task | null>(null);
  const [taskDetailTab, setTaskDetailTab] = useState<"info" | "comments" | "history">("info");
  
  // Р”РѕРїРѕР»РЅРёС‚РµР»СЊРЅС‹Рµ РїРѕР»СЏ РґР»СЏ Р·Р°РґР°С‡Рё
  const [newTaskRepository, setNewTaskRepository] = useState<string>("");
  const [newTaskProject, setNewTaskProject] = useState<string>("");
  const [newTaskCategory, setNewTaskCategory] = useState<string>("");
  const [newTaskEstimatedHours, setNewTaskEstimatedHours] = useState<string>("");
  const [newTaskLinks, setNewTaskLinks] = useState<Array<{ title: string; url: string }>>([]);
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");

  // Р¤РёР»СЊС‚СЂС‹ Рё СЃРѕСЂС‚РёСЂРѕРІРєР°
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

  // РљРѕРјРјРµРЅС‚Р°СЂРёРё Рё РёСЃС‚РѕСЂРёСЏ
  const [taskComments, setTaskComments] = useState<Record<string, any[]>>({});
  const [taskHistory, setTaskHistory] = useState<Record<string, any[]>>({});
  const [newComment, setNewComment] = useState<Record<string, string>>({});
  const [isLoadingComments, setIsLoadingComments] = useState<Record<string, boolean>>({});
  const [isLoadingHistory, setIsLoadingHistory] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (selectedTaskForView?.id) setTaskDetailTab("info");
  }, [selectedTaskForView?.id]);

  // Р—Р°РіСЂСѓР·РєР° РєРѕРјРјРµРЅС‚Р°СЂРёРµРІ Рё РёСЃС‚РѕСЂРёРё РїСЂРё РѕС‚РєСЂС‹С‚РёРё Р·Р°РґР°С‡Рё
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

  // Р”РѕР±Р°РІР»РµРЅРёРµ РєРѕРјРјРµРЅС‚Р°СЂРёСЏ
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
        toast({ title: "РЈСЃРїРµС€РЅРѕ", description: "РљРѕРјРјРµРЅС‚Р°СЂРёР№ РґРѕР±Р°РІР»РµРЅ" });
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
      toast({ title: "РћС€РёР±РєР°", description: "РќРµ СѓРґР°Р»РѕСЃСЊ РґРѕР±Р°РІРёС‚СЊ РєРѕРјРјРµРЅС‚Р°СЂРёР№", variant: "destructive" });
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

  // Р—Р°РіСЂСѓР·РєР° РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№ (РЅСѓР¶РЅРѕ РґР»СЏ СЃРѕР·РґР°РЅРёСЏ СЂР°Р·РґРµР»РѕРІ)
  const { data: users = [] } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
    retry: 1,
  });

  // Р—Р°РіСЂСѓР·РєР° СЂРµРїРѕР·РёС‚РѕСЂРёРµРІ
  const { data: repositories = [] } = useQuery<any[]>({
    queryKey: ["/api/repositories"],
    retry: 1,
  });

  // Р—Р°РіСЂСѓР·РєР° РїСЂРѕРµРєС‚РѕРІ (РІРёРґРµРѕРїСЂРѕРµРєС‚С‹ вЂ” РґР»СЏ СЃРѕР·РґР°РЅРёСЏ Р·Р°РґР°С‡ Рё С‚.Рґ.)
  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ["/api/projects"],
    retry: 1,
  });

  // РџСЂРѕРµРєС‚С‹ YouGile (РїРµСЂРІР°СЏ СЃС‚СЂРѕРєР°: РњРѕРё Р·Р°РґР°С‡Рё + РЅР°Р·РІР°РЅРёСЏ РїСЂРѕРµРєС‚РѕРІ YouGile). РџСЂРё РѕС€РёР±РєРµ РЅРµ РїРµСЂРµР·Р°РїРёСЃС‹РІР°РµРј вЂ” СЃРѕС…СЂР°РЅСЏРµРј РїСЂРµРґС‹РґСѓС‰РёРµ РґР°РЅРЅС‹Рµ.
  const { data: yougileProjects = [] } = useQuery<Array<{ id: string; title?: string }>>({
    queryKey: ["/api/yougile/projects"],
    retry: 1,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/yougile/projects"), { credentials: "include" });
      if (!res.ok) throw new Error(res.status === 500 ? "YouGile РЅРµРґРѕСЃС‚СѓРїРµРЅ" : String(res.status));
      const data = await safeJson(res, [] as any[]);
      return Array.isArray(data) ? data : [];
    },
  });

  const [sections, setSections] = useState<Section[]>(() => loadSections([], currentUser));
  // Р’С‹Р±СЂР°РЅРЅР°СЏ РґРѕСЃРєР° (РІС‚РѕСЂР°СЏ СЃС‚СЂРѕРєР°): РїСЂРё РєР»РёРєРµ РЅР° РґРѕСЃРєСѓ РїРѕРєР°Р·С‹РІР°РµРј РµС‘ РєРѕР»РѕРЅРєРё
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);

  // РџРµСЂРІР°СЏ СЃС‚СЂРѕРєР°: В«РњРѕРё Р·Р°РґР°С‡РёВ» + РїСЂРѕРµРєС‚С‹ YouGile (РїРѕ РЅР°Р·РІР°РЅРёСЏРј РёР· YouGile)
  const displaySections = useMemo((): Section[] => {
    const myTasks = sections.find(s => s.id === "my-tasks") ?? {
      id: "my-tasks",
      name: "РњРѕРё Р·Р°РґР°С‡Рё",
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
        name: project.name || "Р”РѕСЃРєР°",
        columns: Array.isArray(project.columns) && project.columns.length > 0
          ? project.columns.map((column: any, index: number) => ({
              id: String(column.id ?? column.name ?? `column-${index}`),
              name: String(column.name ?? column.title ?? "РЎС‚РѕР»Р±РµС†"),
              order: Number(column.order ?? index),
            }))
          : getDefaultColumns(),
        localProjectId: project.id,
      }));
    const ygProjects = (yougileProjects || []).map((p: any) => ({
      id: "yg-project-" + p.id,
      name: p.title || "РџСЂРѕРµРєС‚",
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

  // Р—Р°РґР°С‡Рё: РґР»СЏ В«РњРѕРё Р·Р°РґР°С‡РёВ» вЂ” Р»РѕРєР°Р»СЊРЅС‹Рµ; РґР»СЏ РІС‹Р±СЂР°РЅРЅРѕР№ РґРѕСЃРєРё YouGile вЂ” РїРѕ yougileBoardId
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

  // РЎРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ СЃ YouGile: РїСЂРё Р·Р°РіСЂСѓР·РєРµ вЂ” РІСЃРµ РґРѕСЃРєРё (С‡С‚РѕР±С‹ Р·Р°РґР°С‡Рё РёР· YouGile РїРѕРїР°Р»Рё РІ РЅСѓР¶РЅС‹Рµ РїСЂРѕРµРєС‚С‹/РґРѕСЃРєРё), Р·Р°С‚РµРј СЂР°Р· РІ РјРёРЅСѓС‚Сѓ вЂ” РІС‹Р±СЂР°РЅРЅР°СЏ РґРѕСЃРєР°
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
    runSync(); // СЃСЂР°Р·Сѓ СЃРёРЅС…СЂРѕРЅРёР·РёСЂСѓРµРј РІСЃРµ Р·Р°РґР°С‡Рё YouGile (Р±РµР· boardId = РІСЃРµ РґРѕСЃРєРё), С‡С‚РѕР±С‹ Р·Р°РґР°С‡Рё РїРѕСЏРІРёР»РёСЃСЊ РІ РїСЂРѕРµРєС‚Рµ/РґРѕСЃРєРµ
    runSync(yougileBoardIdForQuery ?? undefined);
    const t = setInterval(() => runSync(yougileBoardIdForQuery ?? undefined), 60 * 1000);
    return () => clearInterval(t);
  }, [yougileStatus?.configured, queryClient, yougileBoardIdForQuery, selectedTaskForView, isBoardDragging]);

  // РџСЂРё СЃРјРµРЅРµ СЂР°Р·РґРµР»Р° СЃР±СЂР°СЃС‹РІР°РµРј РІС‹Р±СЂР°РЅРЅСѓСЋ РґРѕСЃРєСѓ
  useEffect(() => {
    if (!selectedSectionId?.startsWith("yg-project-")) setSelectedBoardId(null);
  }, [selectedSectionId]);

  // Р РµР·РµСЂРІРёСЂСѓРµРј РјРµСЃС‚Рѕ РїРѕРґ СЃРєСЂРѕР»Р»Р±Р°СЂ (РІСЃРµРіРґР° РІС‹Р·С‹РІР°РµРј С…СѓРє РґРѕ Р»СЋР±РѕРіРѕ СѓСЃР»РѕРІРЅРѕРіРѕ return)
  useEffect(() => {
    document.body.classList.add("scrollbar-gutter-stable");
    return () => document.body.classList.remove("scrollbar-gutter-stable");
  }, []);

  // РўРµРєСѓС‰РёР№ В«СЂР°Р·РґРµР»В» РґР»СЏ РєР°РЅР±Р°РЅР°: В«РњРѕРё Р·Р°РґР°С‡РёВ» РёР»Рё РІС‹Р±СЂР°РЅРЅР°СЏ РґРѕСЃРєР° YouGile (СЃ yougileBoardId РґР»СЏ РєРѕР»РѕРЅРѕРє Рё Р·Р°РґР°С‡)
  const currentSection = useMemo(() => {
    if (selectedSectionId === "my-tasks" || !selectedSectionId) {
      return displaySections.find(s => s.id === "my-tasks") || displaySections[0];
    }
    if (selectedYougileProjectId && selectedBoardId) {
      const board = yougileBoardsOfProject.find((b: any) => b.id === selectedBoardId);
      return {
        id: "board-" + selectedBoardId,
        name: board?.title || "Р”РѕСЃРєР°",
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

  // РЎС‚РёРєРµСЂС‹ РґРѕСЃРєРё YouGile СЃ С‚РёРїРѕРј Рё РѕРїС†РёСЏРјРё (list = РІС‹РїР°РґР°СЋС‰РёР№ СЃРїРёСЃРѕРє, string = РІРІРѕРґ, user = РёСЃРїРѕР»РЅРёС‚РµР»СЊ)
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

  // РћР±СЉРµРґРёРЅС‘РЅРЅС‹Р№ СЃРїРёСЃРѕРє РїР»Р°С€РµРє РґР»СЏ РѕС‚РѕР±СЂР°Р¶РµРЅРёСЏ РЅР° РєР°СЂС‚РѕС‡РєР°С…: РґРѕСЃРєР° YouGile + РІСЃС‚СЂРѕРµРЅРЅС‹Рµ РїСЂРµСЃРµС‚С‹
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
        .map((c, i) => ({ id: c.id, name: c.title || "РЎС‚РѕР»Р±РµС†", order: c.order ?? i }));
    }
    if (currentSection.localProjectId && Array.isArray(projectColumnsRaw) && projectColumnsRaw.length > 0) {
      return projectColumnsRaw
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((c, i) => ({ id: c.id, name: c.name || "РЎС‚РѕР»Р±РµС†", order: c.order ?? i }));
    }
    return Array.isArray(currentSection.columns) ? currentSection.columns : [];
  }, [currentSection, isYouGileBoard, yougileColumnsRaw, projectColumnsRaw]);

  const allColumnIds = useMemo(() => effectiveColumns.map((col) => col.id), [effectiveColumns]);
  const boardOrderKey = useMemo(() => {
    if (currentSection?.localProjectId) return `project:${currentSection.localProjectId}`;
    if (currentSection?.yougileBoardId) return `yougile:${currentSection.yougileBoardId}`;
    return "my-tasks";
  }, [currentSection?.localProjectId, currentSection?.yougileBoardId]);

  // Р¤РёР»СЊС‚СЂР°С†РёСЏ Рё СЃРѕСЂС‚РёСЂРѕРІРєР° Р·Р°РґР°С‡
  const filteredTasks = useMemo(() => {
    let filtered = tasks.filter(task => {
      if (!task) return false;
      // Р”РѕСЃРєР° YouGile: Р·Р°РґР°С‡Рё СѓР¶Рµ РїСЂРёС€Р»Рё РїРѕ yougileBoardId СЃ API
      if (currentSection?.yougileBoardId) {
        if ((task as any).yougileBoardId !== currentSection.yougileBoardId) return false;
        if (!allColumnIds.includes(task.status || "")) return false;
      } else {
        // В«РњРѕРё Р·Р°РґР°С‡РёВ»: РїРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЋ Рё РїРѕ СЃС‚РѕР»Р±С†Сѓ
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
    
    // РЎРѕСЂС‚РёСЂРѕРІРєР°
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

  // Р”Р»СЏ СЂР°Р·РґРµР»Р° В«РњРѕРё Р·Р°РґР°С‡РёВ»: С‚РѕР»СЊРєРѕ Р·Р°РґР°С‡Рё, РЅР°Р·РЅР°С‡РµРЅРЅС‹Рµ РјРЅРµ РёР»Рё СЃРѕР·РґР°РЅРЅС‹Рµ РјРЅРѕР№ (РїРѕ API)
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

  // Р“СЂСѓРїРїРёСЂРѕРІРєР° Р·Р°РґР°С‡ РїРѕ СЃС‚РѕР»Р±С†Р°Рј (СЃС‚Р°С‚СѓСЃ = id РєРѕР»РѕРЅРєРё; РґР»СЏ YouGile РґРѕСЃРєРё вЂ” id РєРѕР»РѕРЅРєРё YouGile)
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

  // РњРµРјРѕРёР·РёСЂРѕРІР°РЅРЅС‹Рµ С„СѓРЅРєС†РёРё РґР»СЏ РїСЂРѕРёР·РІРѕРґРёС‚РµР»СЊРЅРѕСЃС‚Рё
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

  // РЎРѕР·РґР°РЅРёРµ СЂР°Р·РґРµР»Р°
  const handleCreateSection = async () => {
    const sectionName = (boardNameInputRef.current?.value ?? newSectionName).trim();
    if (!sectionName) {
      toast({ 
        title: "РћС€РёР±РєР°", 
        description: "Р’РІРµРґРёС‚Рµ РЅР°Р·РІР°РЅРёРµ СЂР°Р·РґРµР»Р°",
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
      toast({ title: "Р“РѕС‚РѕРІРѕ", description: "Р”РѕСЃРєР° СЃРѕР·РґР°РЅР°" });
      window.setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "columns"] });
      }, 300);
      return;
    } catch (error: any) {
      toast({ title: "РћС€РёР±РєР°", description: error?.message || "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ РґРѕСЃРєСѓ", variant: "destructive" });
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
    toast({ title: "РЈСЃРїРµС€РЅРѕ", description: "Р Р°Р·РґРµР» СЃРѕР·РґР°РЅ" });
  };
  
  useEffect(() => {
    if (currentUser && !sections.find(s => s.id === 'my-tasks')) {
      const myTasksSection = {
        id: 'my-tasks',
        name: 'РњРѕРё Р·Р°РґР°С‡Рё',
        columns: getDefaultColumns(),
        userId: currentUser.id,
      };
      setSections([myTasksSection]);
      saveSections([myTasksSection]);
      setSelectedSectionId('my-tasks');
    }
  }, [currentUser]);

  // РЎРѕР·РґР°РЅРёРµ СЃС‚РѕР»Р±С†Р°
  const handleCreateColumn = () => {
    const columnName = (columnNameInputRef.current?.value ?? newColumnName).trim();
    if (!columnName) {
      toast({ 
        title: "РћС€РёР±РєР°", 
        description: "Р’РІРµРґРёС‚Рµ РЅР°Р·РІР°РЅРёРµ СЃС‚РѕР»Р±С†Р°",
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
          toast({ title: "РЈСЃРїРµС€РЅРѕ", description: "РЎС‚РѕР»Р±РµС† СЃРѕР·РґР°РЅ" });
        })
        .catch((error: any) => {
          toast({ title: "РћС€РёР±РєР°", description: error?.message || "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ СЃС‚РѕР»Р±РµС†", variant: "destructive" });
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
    toast({ title: "РЈСЃРїРµС€РЅРѕ", description: "РЎС‚РѕР»Р±РµС† СЃРѕР·РґР°РЅ" });
  };

  // РЈРґР°Р»РµРЅРёРµ СЂР°Р·РґРµР»Р°
  const handleRenameColumn = (columnId: string) => {
    const columnName = editingColumnName.trim();
    if (!columnName) {
      toast({ title: "РћС€РёР±РєР°", description: "Р’РІРµРґРёС‚Рµ РЅР°Р·РІР°РЅРёРµ СЃС‚РѕР»Р±С†Р°", variant: "destructive" });
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
          toast({ title: "РћС€РёР±РєР°", description: error?.message || "РќРµ СѓРґР°Р»РѕСЃСЊ РїРµСЂРµРёРјРµРЅРѕРІР°С‚СЊ СЃС‚РѕР»Р±РµС†", variant: "destructive" });
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
      toast({ title: "РћС€РёР±РєР°", description: "РЎРёСЃС‚РµРјРЅСѓСЋ РґРѕСЃРєСѓ СѓРґР°Р»РёС‚СЊ РЅРµР»СЊР·СЏ", variant: "destructive" });
      return;
    }

    const localProjectId = sectionId.startsWith("project-") ? sectionId.slice("project-".length) : null;
    if (localProjectId) {
      const boardName = displaySections.find((section) => section.id === sectionId)?.name || "СЌС‚Сѓ РґРѕСЃРєСѓ";
      if (!confirm(`РўРѕС‡РЅРѕ СѓРґР°Р»РёС‚СЊ РґРѕСЃРєСѓ "${boardName}"?`)) return;
      apiRequest("DELETE", `/api/projects/${encodeURIComponent(localProjectId)}`)
        .then(() => {
          queryClient.setQueryData<any[]>(["/api/projects"], (prev) =>
            Array.isArray(prev) ? prev.filter((project) => project?.id !== localProjectId) : prev
          );
          queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
          queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
          setSelectedSectionId("my-tasks");
          toast({ title: "Р“РѕС‚РѕРІРѕ", description: "Р”РѕСЃРєР° СѓРґР°Р»РµРЅР°" });
        })
        .catch((error: any) => {
          toast({ title: "РћС€РёР±РєР°", description: error?.message || "РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ РґРѕСЃРєСѓ", variant: "destructive" });
        });
      return;
    }

    if (confirm("РўРѕС‡РЅРѕ СѓРґР°Р»РёС‚СЊ СЂР°Р·РґРµР»? Р—Р°РґР°С‡Рё РѕСЃС‚Р°РЅСѓС‚СЃСЏ, РЅРѕ Р±СѓРґСѓС‚ Р±РµР· СЂР°Р·РґРµР»Р°.")) {
      const updatedSections = sections.filter((section) => section.id !== sectionId);
      setSections(updatedSections);
      saveSections(updatedSections);
      if (selectedSectionId === sectionId) setSelectedSectionId("my-tasks");
      toast({ title: "Р“РѕС‚РѕРІРѕ", description: "Р Р°Р·РґРµР» СѓРґР°Р»С‘РЅ" });
    }
  };

  const handleDeleteColumn = (columnId: string) => {
    if (!currentSection?.localProjectId && getDefaultColumns().some((column) => column.id === columnId)) {
      toast({ title: "РћС€РёР±РєР°", description: "РЎС‚Р°РЅРґР°СЂС‚РЅС‹Р№ СЃС‚РѕР»Р±РµС† СѓРґР°Р»РёС‚СЊ РЅРµР»СЊР·СЏ", variant: "destructive" });
      return;
    }

    if (currentSection?.localProjectId) {
      const column = effectiveColumns.find((item) => item.id === columnId);
      const fallbackColumnId = effectiveColumns.find((item) => item.id !== columnId)?.id || "todo";
      if (!confirm(`РўРѕС‡РЅРѕ СѓРґР°Р»РёС‚СЊ СЃС‚РѕР»Р±РµС† "${column?.name || "СЃС‚РѕР»Р±РµС†"}"? Р—Р°РґР°С‡Рё РёР· РЅРµРіРѕ Р±СѓРґСѓС‚ РїРµСЂРµРЅРµСЃРµРЅС‹ РІ РїРµСЂРІС‹Р№ РґРѕСЃС‚СѓРїРЅС‹Р№ СЃС‚РѕР»Р±РµС†.`)) return;
      const tasksToUpdate = tasks.filter((task) => task?.status === columnId);
      Promise.all(tasksToUpdate.map((task) =>
        apiRequest("PUT", `/api/tasks/${task.id}`, { status: fallbackColumnId, userId: currentUser?.id }).catch(() => undefined)
      ))
        .then(() => apiRequest("DELETE", `/api/projects/${encodeURIComponent(currentSection.localProjectId!)}/columns/${encodeURIComponent(columnId)}`))
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/projects", currentSection.localProjectId, "columns"] });
          queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
          toast({ title: "Р“РѕС‚РѕРІРѕ", description: "РЎС‚РѕР»Р±РµС† СѓРґР°Р»С‘РЅ" });
        })
        .catch((error: any) => {
          toast({ title: "РћС€РёР±РєР°", description: error?.message || "РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ СЃС‚РѕР»Р±РµС†", variant: "destructive" });
        });
      return;
    }

    if (confirm("РўРѕС‡РЅРѕ СѓРґР°Р»РёС‚СЊ СЃС‚РѕР»Р±РµС†? Р—Р°РґР°С‡Рё РёР· РЅРµРіРѕ Р±СѓРґСѓС‚ РїРµСЂРµРЅРµСЃРµРЅС‹ РІ 'Рљ РІС‹РїРѕР»РЅРµРЅРёСЋ'.")) {
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
      toast({ title: "Р“РѕС‚РѕРІРѕ", description: "РЎС‚РѕР»Р±РµС† СѓРґР°Р»С‘РЅ" });
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
      if (!response.ok) throw new Error("РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ Р·Р°РґР°С‡Сѓ");
      const data = await safeJson(response, null);
      if (data == null) throw new Error("РЎРµСЂРІРµСЂ РІРµСЂРЅСѓР» РЅРµРІРµСЂРЅС‹Р№ РѕС‚РІРµС‚. РџСЂРѕРІРµСЂСЊС‚Рµ РїРѕРґРєР»СЋС‡РµРЅРёРµ Рє API.");
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
      toast({ title: "РЈСЃРїРµС€РЅРѕ", description: "Р—Р°РґР°С‡Р° СЃРѕР·РґР°РЅР°" });
      const queryKey = ["/api/tasks", currentUser?.id, yougileBoardIdForQuery ?? "all"] as const;
      queryClient.setQueryData<Task[]>(queryKey, (prev) => (prev ? [...prev, createdTask] : [createdTask]));
    },
    onError: (error: any) => {
      toast({ 
        title: "РћС€РёР±РєР°", 
        description: error.message || "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ Р·Р°РґР°С‡Сѓ",
        variant: "destructive" 
      });
    },
  });

  // РћР±РЅРѕРІР»РµРЅРёРµ Р·Р°РґР°С‡Рё. РћРїС‚РёРјРёСЃС‚РёС‡РЅРѕРµ РѕР±РЅРѕРІР»РµРЅРёРµ Рё РїСЂРё РїРµСЂРµС‚Р°СЃРєРёРІР°РЅРёРё: РєР°СЂС‚РѕС‡РєР° СЃСЂР°Р·Сѓ РїРµСЂРµРµР·Р¶Р°РµС‚ РІ РЅРѕРІСѓСЋ РєРѕР»РѕРЅРєСѓ, Р·Р°РїСЂРѕСЃ Рє СЃРµСЂРІРµСЂСѓ Рё YouGile СѓС…РѕРґРёС‚ РІ С„РѕРЅРµ (РїСЂРё Р»РёРјРёС‚Рµ API вЂ” РІ РѕС‡РµСЂРµРґСЊ).
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
      if (!response.ok) throw new Error("РќРµ СѓРґР°Р»РѕСЃСЊ РѕР±РЅРѕРІРёС‚СЊ Р·Р°РґР°С‡Сѓ");
      const parsed = await safeJson(response, null);
      if (parsed == null) throw new Error("РЎРµСЂРІРµСЂ РІРµСЂРЅСѓР» РЅРµРІРµСЂРЅС‹Р№ РѕС‚РІРµС‚. РџСЂРѕРІРµСЂСЊС‚Рµ РїРѕРґРєР»СЋС‡РµРЅРёРµ Рє API.");
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
        title: "РћС€РёР±РєР°",
        description: error.message || "РќРµ СѓРґР°Р»РѕСЃСЊ РѕР±РЅРѕРІРёС‚СЊ Р·Р°РґР°С‡Сѓ",
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

  // РЈРґР°Р»РµРЅРёРµ Р·Р°РґР°С‡Рё
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(apiUrl(`/api/tasks/${id}`), {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ Р·Р°РґР°С‡Сѓ");
      const data = await safeJson(response, null);
      return data ?? { id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.refetchQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "РЈСЃРїРµС€РЅРѕ", description: "Р—Р°РґР°С‡Р° СѓРґР°Р»РµРЅР°" });
    },
    onError: (error: any) => {
      toast({ 
        title: "РћС€РёР±РєР°", 
        description: error.message || "РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ Р·Р°РґР°С‡Сѓ",
        variant: "destructive" 
      });
    },
  });

  const handleCreateTask = () => {
    const title = titleInputRef.current?.value?.trim() ?? newTaskTitle.trim();
    if (!title) {
      toast({ 
        title: "РћС€РёР±РєР°", 
        description: "Р’РІРµРґРёС‚Рµ РЅР°Р·РІР°РЅРёРµ Р·Р°РґР°С‡Рё",
        variant: "destructive" 
      });
      return;
    }
    if (!currentUser?.id) {
      toast({ title: "РћС€РёР±РєР°", description: "Р’РѕР№РґРёС‚Рµ РІ СЃРёСЃС‚РµРјСѓ РґР»СЏ СЃРѕР·РґР°РЅРёСЏ Р·Р°РґР°С‡Рё", variant: "destructive" });
      return;
    }

    // Р•СЃР»Рё РЅР°Р·РЅР°С‡РµРЅ РѕС‚РІРµС‚СЃС‚РІРµРЅРЅС‹Р№, Р·Р°РґР°С‡Р° РґРѕР»Р¶РЅР° РїРѕРїР°СЃС‚СЊ РІ СЃС‚РѕР»Р±РµС† "todo" (Рє РІС‹РїРѕР»РЅРµРЅРёСЋ)
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

    // Р”РѕР±Р°РІР»СЏРµРј attachments С‚РѕР»СЊРєРѕ РµСЃР»Рё РµСЃС‚СЊ С„Р°Р№Р»С‹
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
      // Р’ СЂРµР°Р»СЊРЅРѕРј РїСЂРёР»РѕР¶РµРЅРёРё Р·РґРµСЃСЊ Р±СѓРґРµС‚ Р·Р°РіСЂСѓР·РєР° РЅР° СЃРµСЂРІРµСЂ
      const fileUrl = URL.createObjectURL(file);
      setAttachedFiles([...attachedFiles, { 
        id: `file-${Date.now()}-${Math.random()}`, 
        name: file.name, 
        url: fileUrl 
      }]);
    });
  };

  // РћР±СЂР°Р±РѕС‚РєР° РІС‹Р±РѕСЂР° РґРµРґР»Р°Р№РЅР°
  const handleDeadlineSelect = () => {
    const date = new Date(selectedYear, selectedMonth, selectedDay, parseInt(selectedHour), parseInt(selectedMinute));
    setNewTaskDueDate(date.toISOString());
  };

  // РСЃРїРѕР»СЊР·СѓРµРј РјРµРјРѕРёР·РёСЂРѕРІР°РЅРЅС‹Рµ РІРµСЂСЃРёРё
  const getUserName = memoizedGetUserName;
  const getUserAvatar = memoizedGetUserAvatar;
  const getUserInitials = memoizedGetUserInitials;

  const getPriorityColor = (priority: string) => {
    return priorities.find(p => p.id === priority)?.color || "bg-gray-500";
  };

  const getPriorityLabel = (priority: string) => {
    const priorityMap: Record<string, string> = {
      low: "РЅРёР·РєРёР№",
      medium: "СЃСЂРµРґРЅРёР№",
      high: "РІС‹СЃРѕРєРёР№",
      urgent: "СЃСЂРѕС‡РЅС‹Р№",
    };
    return priorityMap[priority] || "СЃСЂРµРґРЅРёР№";
  };

  // РџРѕР»СѓС‡РµРЅРёРµ С‚РµРіР° РґР»СЏ Р·Р°РґР°С‡Рё (РїСЂРёРѕСЂРёС‚РµС‚ РєР°Рє С‚РµРі)
  const getTaskTag = useCallback((task: Task) => {
    if (task.priority === "urgent" || task.priority === "high") {
      return { label: getPriorityLabel(task.priority || "medium"), color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" };
    }
    return null;
  }, []);

  // РџРѕР»СѓС‡РµРЅРёРµ С†РІРµС‚Р° РїСЂРѕРµРєС‚Р°
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

  // Р Р°Р·РЅРѕС†РІРµС‚РЅС‹Рµ Р°РєС†РµРЅС‚С‹ РєР°СЂС‚РѕС‡РµРє (Р»РµРІР°СЏ РіСЂР°РЅРёС†Р°) РїРѕ СЃС‚Р°С‚СѓСЃСѓ РёР»Рё id
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

// РњРµРјРѕРёР·РёСЂРѕРІР°РЅРЅС‹Р№ РєРѕРјРїРѕРЅРµРЅС‚ РєР°СЂС‚РѕС‡РєРё Р·Р°РґР°С‡Рё вЂ” СѓРјРµРЅСЊС€Р°РµС‚ РїРµСЂРµСЂР°РµРЅРґРµСЂС‹
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
        {/* РџРµСЂРІР°СЏ СЃС‚СЂРѕРєР°: Р·РѕРЅР° РїРµСЂРµС‚Р°СЃРєРёРІР°РЅРёСЏ (СЂСѓС‡РєР° + РЅР°Р·РІР°РЅРёРµ + Р°РІР°С‚Р°СЂ), С‡РµРєР±РѕРєСЃ, РјРµРЅСЋ вЂ” РїРµСЂРµС‚Р°СЃРєРёРІР°С‚СЊ Р·Р° РІСЃСЋ Р·РѕРЅСѓ, Р±РµР· СЃРјРµС‰РµРЅРёСЏ РєР°СЂС‚РѕС‡РєРё */}
        <div className="flex items-start gap-2.5 sm:gap-2">
          {(provided?.dragHandleProps) && (
            <div
              className="cursor-grab active:cursor-grabbing touch-manipulation flex items-start gap-2 min-w-0 flex-1 rounded py-2 -my-2 px-1 -mx-1 min-h-[44px] sm:min-h-0 sm:py-0.5 sm:-my-0.5"
              title="РџРµСЂРµС‚Р°С‰РёС‚СЊ"
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
                  <Eye className="w-4 h-4 mr-2" /> РћС‚РєСЂС‹С‚СЊ
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* РЎС‚РёРєРµСЂС‹ Рё РїСЂРёРѕСЂРёС‚РµС‚: РєР°Рє РЅР° РєР°СЂС‚РѕС‡РєРµ YouGile вЂ” С†РІРµС‚РЅС‹Рµ РїР»Р°С€РєРё СЃ Р·Р°РіРѕС‚РѕРІР»РµРЅРЅС‹Рј РІС‹Р±РѕСЂРѕРј */}
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
            <span className={cn("inline-block w-2 h-2 rounded-full shrink-0", getProjectColor(task.projectId)?.bg)} title="РџСЂРѕРµРєС‚" />
          )}
        </div>

        {/* РџРѕРґР·Р°РґР°С‡Рё (С‡РµРєР»РёСЃС‚) РЅР° РєР°СЂС‚РѕС‡РєРµ */}
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

        {/* Р”Р°С‚Р° Рё РјРµС‚Р° вЂ” РЅР° С‚РµР»РµС„РѕРЅРµ РєСЂСѓРїРЅРµРµ Р·РѕРЅС‹ РЅР°Р¶Р°С‚РёСЏ */}
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
                  <SelectItem value="none">РќРµ РЅР°Р·РЅР°С‡РµРЅ</SelectItem>
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
                    <span>РќР°Р·РЅР°С‡РёС‚СЊ</span>
                  </Button>
                </SelectTrigger>
                <SelectContent onClick={(e) => e.stopPropagation()}>
                  <SelectItem value="none">РќРµ РЅР°Р·РЅР°С‡РµРЅ</SelectItem>
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

  // РџРѕР»РЅРѕСЌРєСЂР°РЅРЅС‹Р№ СЃРїРёРЅРЅРµСЂ С‚РѕР»СЊРєРѕ РїСЂРё РїРµСЂРІРѕР№ Р·Р°РіСЂСѓР·РєРµ (РЅРµС‚ РґР°РЅРЅС‹С…). РџСЂРё СЃРјРµРЅРµ РґРѕСЃРєРё РїРѕРєР°Р·С‹РІР°РµРј РїСЂРµРґС‹РґСѓС‰РёРµ Р·Р°РґР°С‡Рё Рё С‚РѕРЅРєРёР№ РёРЅРґРёРєР°С‚РѕСЂ
  if (tasksLoading && tasks.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Р—Р°РіСЂСѓР·РєР° Р·Р°РґР°С‡...</p>
        </div>
      </div>
    );
  }

  return (
    <TasksLayout>
      <div className="relative space-y-0 rounded-xl border border-border/70 bg-background/70 shadow-sm backdrop-blur lg:min-h-[calc(100dvh-4rem)] xl:rounded-none xl:border-0">
        {/* РЁР°РїРєР° РІ СЃС‚РёР»Рµ MOII/CRM: С‚С‘РјРЅР°СЏ РїРѕР»РѕСЃР°, Р·Р°РіРѕР»РѕРІРѕРє РїРѕ С†РµРЅС‚СЂСѓ (РјРѕР±РёР»СЊРЅС‹Р№) РёР»Рё СЃР»РµРІР°, С„РёР»СЊС‚СЂ Рё РјРµРЅСЋ СЃРїСЂР°РІР° */}
        <div className="rounded-t-2xl border-b border-border/70 bg-card/80 px-3 py-3 backdrop-blur sm:px-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ListTodo className="h-4 w-4" />
              </div>
              <h1 className="truncate text-base font-semibold text-foreground sm:text-lg">
                {currentSection?.name || "Р—Р°РґР°С‡Рё"}
              </h1>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {effectiveColumns.length} РєРѕР»РѕРЅРѕРє В· {filteredTasks.length} Р·Р°РґР°С‡
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
                  <Label>РџСЂРёРѕСЂРёС‚РµС‚</Label>
                  <Select value={filterPriority} onValueChange={setFilterPriority}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Р’СЃРµ</SelectItem>
                      <SelectItem value="urgent">РЎСЂРѕС‡РЅС‹Р№</SelectItem>
                      <SelectItem value="high">Р’С‹СЃРѕРєРёР№</SelectItem>
                      <SelectItem value="medium">РЎСЂРµРґРЅРёР№</SelectItem>
                      <SelectItem value="low">РќРёР·РєРёР№</SelectItem>
                    </SelectContent>
                  </Select>
                  <Label>РљР°С‚РµРіРѕСЂРёСЏ</Label>
                  <Select value={filterCategory} onValueChange={setFilterCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Р’СЃРµ</SelectItem>
                      <SelectItem value="production">РџСЂРѕРёР·РІРѕРґСЃС‚РІРѕ</SelectItem>
                      <SelectItem value="equipment">РћР±РѕСЂСѓРґРѕРІР°РЅРёРµ</SelectItem>
                      <SelectItem value="stream">РЎС‚СЂРёРј</SelectItem>
                      <SelectItem value="admin">РђРґРјРёРЅРёСЃС‚СЂРёСЂРѕРІР°РЅРёРµ</SelectItem>
                      <SelectItem value="other">Р”СЂСѓРіРѕРµ</SelectItem>
                    </SelectContent>
                  </Select>
                  <Label>РСЃРїРѕР»РЅРёС‚РµР»СЊ</Label>
                  <Select value={filterAssignee} onValueChange={setFilterAssignee}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Р’СЃРµ</SelectItem>
                      <SelectItem value="unassigned">РќРµ РЅР°Р·РЅР°С‡РµРЅС‹</SelectItem>
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
                  <Columns className="w-4 h-4 mr-2" /> РќРѕРІР°СЏ РґРѕСЃРєР°
                </DropdownMenuItem>
                {currentSection?.localProjectId && (
                  <DropdownMenuItem onClick={() => setIsColumnFormOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" /> РќРѕРІС‹Р№ СЃС‚РѕР»Р±РµС†
                  </DropdownMenuItem>
                )}
                {currentSection?.localProjectId && (
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDeleteSection(`project-${currentSection.localProjectId}`)}>
                    <Trash2 className="w-4 h-4 mr-2" /> РЈРґР°Р»РёС‚СЊ РґРѕСЃРєСѓ
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setIsFormOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" /> РќРѕРІР°СЏ Р·Р°РґР°С‡Р°
                </DropdownMenuItem>
                {/* РЎС‚РѕР»Р±С†С‹ СЃРёРЅС…СЂРѕРЅРёР·РёСЂСѓСЋС‚СЃСЏ СЃ YouGile; СЃРѕР·РґР°РЅРёРµ С‚РѕР»СЊРєРѕ С‡РµСЂРµР· РЅР°СЃС‚СЂРѕР№РєРё РјР°РїРїРёРЅРіР° РєРѕР»РѕРЅРѕРє */}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          </div>
        </div>

        {/* РўРѕРЅРєР°СЏ РїРѕР»РѕСЃРєР° Р·Р°РіСЂСѓР·РєРё РїСЂРё СЃРјРµРЅРµ РґРѕСЃРєРё (Р±РµР· РїРѕР»РЅРѕСЌРєСЂР°РЅРЅРѕРіРѕ Р·Р°С‚РµРјРЅРµРЅРёСЏ) */}
        {tasksFetching && tasks.length > 0 && (
          <div className="absolute left-0 right-0 top-0 z-10 h-0.5 bg-primary/20 overflow-hidden rounded-full">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/70" />
          </div>
        )}

        {/* РџРµСЂРІР°СЏ СЃС‚СЂРѕРєР°: РњРѕРё Р·Р°РґР°С‡Рё Рё РїСЂРѕРµРєС‚С‹ YouGile (РЅР°Р·РІР°РЅРёСЏ РёР· YouGile) */}
        <div className="border-b border-border/70 bg-card/55 px-2 sm:px-3 pt-3 pb-2 backdrop-blur">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2 px-1">РџСЂРѕРµРєС‚С‹</p>
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

        {/* Р’С‚РѕСЂР°СЏ СЃС‚СЂРѕРєР°: РґРѕСЃРєРё РІС‹Р±СЂР°РЅРЅРѕРіРѕ РїСЂРѕРµРєС‚Р° YouGile (РїРѕ РєР»РёРєСѓ вЂ” РєРѕР»РѕРЅРєРё СЌС‚РѕР№ РґРѕСЃРєРё) */}
        {selectedYougileProjectId && yougileBoardsOfProject.length > 0 && (
          <div className="border-x border-t border-border bg-card/70 dark:bg-card/80 backdrop-blur-sm px-2 sm:px-3 pt-2 pb-2 mt-0.5">
            <p className="text-xs text-muted-foreground mb-2 px-0.5">Р”РѕСЃРєРё</p>
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
                  {board.title || "Р”РѕСЃРєР°"}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2 sm:space-y-3 md:space-y-4 px-0 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setIsFormOpen(true)} className="rounded-xl h-9 sm:h-10 px-4 shrink-0 touch-manipulation">
              <Plus className="w-4 h-4 mr-2" />
              РЎРѕР·РґР°С‚СЊ Р·Р°РґР°С‡Сѓ
            </Button>
            <YouGileTasksLink />
          </div>

          {/* Р”РёР°Р»РѕРіРё СЂР°Р·РґРµР»/СЃС‚РѕР»Р±РµС† (РѕС‚РєСЂС‹РІР°СЋС‚СЃСЏ РёР· РјРµРЅСЋ) */}
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
              <DialogHeader><DialogTitle>РЎРѕР·РґР°С‚СЊ РґРѕСЃРєСѓ</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>РќР°Р·РІР°РЅРёРµ РґРѕСЃРєРё</Label>
                  <Input
                    ref={boardNameInputRef}
                    defaultValue=""
                    placeholder="РќР°РїСЂРёРјРµСЂ: РњРѕРЅС‚Р°Р¶"
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
                  <Label>РљС‚Рѕ РІРёРґРёС‚ РґРѕСЃРєСѓ</Label>
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
                      <div className="px-2 py-3 text-sm text-muted-foreground">РЎРѕС‚СЂСѓРґРЅРёРєРё РЅРµ Р·Р°РіСЂСѓР¶РµРЅС‹</div>
                    )}
                  </div>
                </div>
                <Button onClick={handleCreateSection} className="w-full" disabled={isCreatingBoard}>
                  {isCreatingBoard ? "РЎРѕР·РґР°С‘Рј..." : "РЎРѕР·РґР°С‚СЊ"}
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
                <DialogTitle>РќРѕРІС‹Р№ СЃС‚РѕР»Р±РµС†</DialogTitle>
                <DialogDescription>Р”РѕР±Р°РІСЊС‚Рµ РєРѕР»РѕРЅРєСѓ РІ С‚РµРєСѓС‰СѓСЋ РґРѕСЃРєСѓ.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>РќР°Р·РІР°РЅРёРµ СЃС‚РѕР»Р±С†Р°</Label>
                  <Input
                    ref={columnNameInputRef}
                    defaultValue=""
                    placeholder="РќР°РїСЂРёРјРµСЂ: РќР° РїСЂРѕРІРµСЂРєРµ"
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
                    РћС‚РјРµРЅР°
                  </Button>
                  <Button type="button" onClick={handleCreateColumn}>
                    РЎРѕР·РґР°С‚СЊ
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
                  <SheetTitle className="text-2xl font-bold">РЎРѕР·РґР°С‚СЊ Р·Р°РґР°С‡Сѓ</SheetTitle>
                  <SheetDescription>
                    Р—Р°РїРѕР»РЅРёС‚Рµ РІСЃРµ РЅРµРѕР±С…РѕРґРёРјС‹Рµ РїРѕР»СЏ РґР»СЏ СЃРѕР·РґР°РЅРёСЏ РЅРѕРІРѕР№ Р·Р°РґР°С‡Рё
                  </SheetDescription>
                </SheetHeader>
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs sm:text-sm" htmlFor="task-title-input">РќР°Р·РІР°РЅРёРµ *</Label>
                    <Input
                      ref={titleInputRef}
                      id="task-title-input"
                      defaultValue=""
                      placeholder="РќР°Р·РІР°РЅРёРµ Р·Р°РґР°С‡Рё"
                      className="h-9 sm:h-10 text-xs sm:text-sm scroll-mt-24"
                      autoComplete="off"
                      aria-label="РќР°Р·РІР°РЅРёРµ Р·Р°РґР°С‡Рё"
                      style={{ scrollMarginTop: "6rem" }}
                    />
                  </div>
                  <div>
                    <Label className="text-xs sm:text-sm">РћРїРёСЃР°РЅРёРµ</Label>
                    <Textarea
                      value={newTaskDescription}
                      onChange={(e) => setNewTaskDescription(e.target.value)}
                      placeholder="РћРїРёСЃР°РЅРёРµ Р·Р°РґР°С‡Рё"
                      rows={3}
                      className="text-xs sm:text-sm resize-none"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <Label className="text-xs sm:text-sm">РЎС‚РѕР»Р±РµС†</Label>
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
                      <Label className="text-xs sm:text-sm">РџСЂРёРѕСЂРёС‚РµС‚</Label>
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
                    <Label className="text-xs sm:text-sm">РСЃРїРѕР»РЅРёС‚РµР»СЊ</Label>
                    <Select value={newTaskAssigneeId || "none"} onValueChange={(value) => setNewTaskAssigneeId(value === "none" ? "" : value)}>
                      <SelectTrigger className="h-9 sm:h-10 text-xs sm:text-sm">
                        <SelectValue placeholder="РќРµ РЅР°Р·РЅР°С‡РµРЅ" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">РќРµ РЅР°Р·РЅР°С‡РµРЅ</SelectItem>
                        {users.map(user => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {/* Р’С‹Р±РѕСЂ РґРµРґР»Р°Р№РЅР° */}
                  <div>
                    <Label className="text-xs sm:text-sm">Р”РµРґР»Р°Р№РЅ</Label>
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
                        Р’С‹Р±СЂР°РЅРѕ: {format(new Date(newTaskDueDate), "dd.MM.yyyy HH:mm", { locale: ru })}
                      </p>
                    )}
                  </div>

                  {/* РЎС‚РёРєРµСЂС‹ РґРѕСЃРєРё YouGile: РїРѕ С‚РёРїСѓ вЂ” РІС‹РїР°РґР°СЋС‰РёР№ СЃРїРёСЃРѕРє РёР»Рё РїРѕР»Рµ РІРІРѕРґР° */}
                  {boardStickersRaw.length > 0 && (
                    <div className="space-y-3">
                      <Label className="text-xs sm:text-sm">РЎС‚РёРєРµСЂС‹ РґРѕСЃРєРё</Label>
                      {(boardStickersRaw as BoardStickerItem[]).map((sticker) => (
                        <div key={sticker.id} className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">{sticker.title}</Label>
                          {sticker.type === "user" ? (
                            <Select
                              value={newTaskStickerValues[sticker.id] || ""}
                              onValueChange={(v) => setNewTaskStickerValues((prev) => ({ ...prev, [sticker.id]: v }))}
                            >
                              <SelectTrigger className="h-9 text-xs sm:text-sm">
                                <SelectValue placeholder="Р’С‹Р±РµСЂРёС‚Рµ РёСЃРїРѕР»РЅРёС‚РµР»СЏ" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="">РќРµ РІС‹Р±СЂР°РЅРѕ</SelectItem>
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
                                <SelectValue placeholder="Р’С‹Р±РµСЂРёС‚Рµ РёР· СЃРїРёСЃРєР°" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="">РќРµ РІС‹Р±СЂР°РЅРѕ</SelectItem>
                                {sticker.options.map((opt) => (
                                  <SelectItem key={opt.id} value={opt.id}>{opt.title ?? opt.id}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              placeholder="Р’РІРµРґРёС‚Рµ Р·РЅР°С‡РµРЅРёРµ"
                              className="h-9 text-xs sm:text-sm"
                              value={newTaskStickerValues[sticker.id] ?? ""}
                              onChange={(e) => setNewTaskStickerValues((prev) => ({ ...prev, [sticker.id]: e.target.value }))}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {/* РџР»Р°С€РєРё-РїСЂРµСЃРµС‚С‹ (РµСЃР»Рё РЅРµС‚ СЃС‚РёРєРµСЂРѕРІ РґРѕСЃРєРё РёР»Рё РґРѕРїРѕР»РЅРёС‚РµР»СЊРЅРѕ) */}
                  {effectiveStickerPresets.length > 0 && boardStickersRaw.length === 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs sm:text-sm">РЎС‚РёРєРµСЂС‹</Label>
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

                  {/* РџРѕРґР·Р°РґР°С‡Рё */}
                  <div className="space-y-2 sm:space-y-3">
                    <Label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                      <Circle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      РџРѕРґР·Р°РґР°С‡Рё ({subtasks.length})
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
                          placeholder="Р”РѕР±Р°РІРёС‚СЊ РїРѕРґР·Р°РґР°С‡Сѓ"
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

                  {/* Р РµРїРѕР·РёС‚РѕСЂРёР№ */}
                  <div>
                    <Label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                      <Github className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      Р РµРїРѕР·РёС‚РѕСЂРёР№
                    </Label>
                    <Select value={newTaskRepository || "none"} onValueChange={(value) => setNewTaskRepository(value === "none" ? "" : value)}>
                      <SelectTrigger className="h-9 sm:h-10 text-xs sm:text-sm">
                        <SelectValue placeholder="Р’С‹Р±РµСЂРёС‚Рµ СЂРµРїРѕР·РёС‚РѕСЂРёР№" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">РќРµ РІС‹Р±СЂР°РЅ</SelectItem>
                        {repositories.map(repo => (
                          <SelectItem key={repo.id} value={repo.url}>
                            {repo.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* РџСЂРѕРµРєС‚ */}
                  <div>
                    <Label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                      <FolderKanban className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      РџСЂРѕРµРєС‚
                    </Label>
                    <Select value={newTaskProject || "none"} onValueChange={(value) => setNewTaskProject(value === "none" ? "" : value)}>
                      <SelectTrigger className="h-9 sm:h-10 text-xs sm:text-sm">
                        <SelectValue placeholder="Р’С‹Р±РµСЂРёС‚Рµ РїСЂРѕРµРєС‚" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">РќРµ РІС‹Р±СЂР°РЅ</SelectItem>
                        {projects.map(project => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* РљР°С‚РµРіРѕСЂРёСЏ */}
                  <div>
                    <Label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                      <Tag className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      РљР°С‚РµРіРѕСЂРёСЏ
                    </Label>
                    <Select value={newTaskCategory || "none"} onValueChange={(value) => setNewTaskCategory(value === "none" ? "" : value)}>
                      <SelectTrigger className="h-9 sm:h-10 text-xs sm:text-sm">
                        <SelectValue placeholder="Р’С‹Р±РµСЂРёС‚Рµ РєР°С‚РµРіРѕСЂРёСЋ" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">РќРµ РІС‹Р±СЂР°РЅР°</SelectItem>
                        <SelectItem value="production">РџСЂРѕРёР·РІРѕРґСЃС‚РІРѕ</SelectItem>
                        <SelectItem value="equipment">РћР±РѕСЂСѓРґРѕРІР°РЅРёРµ</SelectItem>
                        <SelectItem value="stream">РЎС‚СЂРёРј</SelectItem>
                        <SelectItem value="admin">РђРґРјРёРЅРёСЃС‚СЂРёСЂРѕРІР°РЅРёРµ</SelectItem>
                        <SelectItem value="other">Р”СЂСѓРіРѕРµ</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* РћС†РµРЅРєР° РІСЂРµРјРµРЅРё */}
                  <div>
                    <Label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                      <Hourglass className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      РћС†РµРЅРєР° РІСЂРµРјРµРЅРё (С‡Р°СЃС‹)
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      value={newTaskEstimatedHours}
                      onChange={(e) => setNewTaskEstimatedHours(e.target.value)}
                      placeholder="РќР°РїСЂРёРјРµСЂ: 8"
                      className="h-9 sm:h-10 text-xs sm:text-sm"
                    />
                  </div>

                  {/* РЎСЃС‹Р»РєРё */}
                  <div className="space-y-2 sm:space-y-3">
                    <Label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                      <Link2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      РЎСЃС‹Р»РєРё ({newTaskLinks.length})
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
                          placeholder="РќР°Р·РІР°РЅРёРµ СЃСЃС‹Р»РєРё"
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
                        Р”РѕР±Р°РІРёС‚СЊ СЃСЃС‹Р»РєСѓ
                      </Button>
                    </div>
                  </div>

                  {/* Р¤Р°Р№Р»С‹ */}
                  <div className="space-y-2 sm:space-y-3">
                    <Label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                      <Paperclip className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      Р¤Р°Р№Р»С‹ ({attachedFiles.length})
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
                            РџСЂРёРєСЂРµРїРёС‚СЊ С„Р°Р№Р»С‹
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
                      {createMutation.isPending ? "РЎРѕР·РґР°РЅРёРµ..." : "РЎРѕР·РґР°С‚СЊ Р·Р°РґР°С‡Сѓ"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setIsFormOpen(false)}
                      className="rounded-full px-4 sm:px-6 py-2 sm:py-2.5 text-xs sm:text-sm h-9 sm:h-10"
                    >
                      РћС‚РјРµРЅР°
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>

        {/* В«РњРѕРё Р·Р°РґР°С‡РёВ»: РїР»РёС‚РєРё С‚РѕР»СЊРєРѕ РјРѕРёС… Р·Р°РґР°С‡ (РЅР°Р·РЅР°С‡РµРЅРЅС‹С…/СЃРѕР·РґР°РЅРЅС‹С… РјРЅРѕР№) + РёСЃС‚РѕСЂРёСЏ РІС‹РїРѕР»РЅРµРЅРЅС‹С… */}
        {currentSection?.id === "my-tasks" ? (
          <div className="space-y-6 px-0 pt-2">
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3">РўРµРєСѓС‰РёРµ Р·Р°РґР°С‡Рё</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {myTasksActive.length === 0 ? (
                  <div className="col-span-full rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
                    РќРµС‚ Р°РєС‚РёРІРЅС‹С… Р·Р°РґР°С‡. Р—Р°РґР°С‡Рё, РєРѕС‚РѕСЂС‹Рµ РІР°Рј РЅР°Р·РЅР°С‡РёР»Рё, РїРѕСЏРІСЏС‚СЃСЏ Р·РґРµСЃСЊ.
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
              <h2 className="text-sm font-semibold text-muted-foreground mb-3">РСЃС‚РѕСЂРёСЏ РІС‹РїРѕР»РЅРµРЅРЅС‹С…</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {myTasksCompleted.length === 0 ? (
                  <p className="col-span-full text-sm text-muted-foreground">РџРѕРєР° РЅРµС‚ РІС‹РїРѕР»РЅРµРЅРЅС‹С… Р·Р°РґР°С‡</p>
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
                            Р’С‹РїРѕР»РЅРµРЅРѕ {format(new Date(task.completedAt), "d MMM yyyy", { locale: ru })}
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
            Р’С‹Р±РµСЂРёС‚Рµ РґРѕСЃРєСѓ РІС‹С€Рµ, С‡С‚РѕР±С‹ СѓРІРёРґРµС‚СЊ РєРѕР»РѕРЅРєРё Рё Р·Р°РґР°С‡Рё
          </div>
        ) : currentSection ? (() => {
          const columns = effectiveColumns.slice().sort((a, b) => a.order - b.order);
          if (columns.length === 0) {
            return <div className="w-full py-4 text-center text-sm text-muted-foreground">РќРµС‚ СЃС‚РѕР»Р±С†РѕРІ РґР»СЏ РѕС‚РѕР±СЂР°Р¶РµРЅРёСЏ</div>;
          }
          return (
          <div className="w-full min-w-0 rounded-xl bg-slate-950/70 pt-3 text-slate-100 dark:bg-slate-950/70 lg:min-h-[calc(100dvh-14.5rem)] xl:rounded-none">
            {currentSection?.yougileBoardId && (
              <p className="text-xs text-muted-foreground mb-2 px-0.5">РљРѕР»РѕРЅРєРё РґРѕСЃРєРё: {currentSection.name}</p>
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
                                title="РџРµСЂРµРёРјРµРЅРѕРІР°С‚СЊ СЃС‚РѕР»Р±РµС†"
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
                                title="РЈРґР°Р»РёС‚СЊ СЃС‚РѕР»Р±РµС†"
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
                              toast({ title: "РћС€РёР±РєР°", description: "Р’РѕР№РґРёС‚Рµ РІ СЃРёСЃС‚РµРјСѓ РґР»СЏ СЃРѕР·РґР°РЅРёСЏ Р·Р°РґР°С‡Рё", variant: "destructive" });
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
                                <span>РќРµС‚ Р·Р°РґР°С‡</span>
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

        {/* Р‘РѕРєРѕРІР°СЏ РїР°РЅРµР»СЊ РґР»СЏ РїСЂРѕСЃРјРѕС‚СЂР° Р·Р°РґР°С‡Рё */}
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
                    {selectedTaskForView.description || "РќРµС‚ РѕРїРёСЃР°РЅРёСЏ"}
                  </SheetDescription>
                </SheetHeader>
                
                <TabsList className="grid w-full grid-cols-3 mb-4 sm:mb-6 h-9 sm:h-10 shrink-0">
                  <TabsTrigger value="info" className="text-xs sm:text-sm px-2 sm:px-4">РРЅС„РѕСЂРјР°С†РёСЏ</TabsTrigger>
                  <TabsTrigger value="comments" className="text-xs sm:text-sm px-2 sm:px-4">
                    <span className="hidden sm:inline">РљРѕРјРјРµРЅС‚Р°СЂРёРё</span>
                    <span className="sm:hidden">РљРѕРјРј</span>
                    {taskComments[selectedTaskForView.id]?.length > 0 && (
                      <Badge variant="secondary" className="ml-1 sm:ml-2 h-4 w-4 sm:h-5 sm:w-5 rounded-full p-0 flex items-center justify-center text-[10px] sm:text-xs">
                        {taskComments[selectedTaskForView.id].length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="history" className="text-xs sm:text-sm px-2 sm:px-4">РСЃС‚РѕСЂРёСЏ</TabsTrigger>
                </TabsList>

                <div className="min-h-[360px] flex-1 overflow-y-auto -mx-1 px-1">
                <TabsContent value="info" forceMount className={cn("space-y-4 sm:space-y-6 mt-0 min-h-[320px]", taskDetailTab !== "info" && "hidden")}>
                  {/* РЎС‚РёРєРµСЂС‹: РґРµРґР»Р°Р№РЅ Рё РїСЂРёРѕСЂРёС‚РµС‚ вЂ” z-[110] С‡С‚РѕР±С‹ РїРѕРїР°Рї Р±С‹Р» РїРѕРІРµСЂС… Sheet (z-[100]) */}
                  <div className="space-y-2">
                    <Label className="text-xs sm:text-sm font-semibold">РЎС‚РёРєРµСЂС‹</Label>
                    <div className="flex flex-wrap gap-2">
                      <Popover open={deadlinePopoverOpen} onOpenChange={setDeadlinePopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 rounded-lg text-xs sm:text-sm">
                            <CalendarIcon className="w-3.5 h-3.5" />
                            {selectedTaskForView.dueDate
                              ? format(new Date(selectedTaskForView.dueDate), "d MMM yyyy", { locale: ru })
                              : "Р”РµРґР»Р°Р№РЅ"}
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

                  {/* РћСЃРЅРѕРІРЅР°СЏ РёРЅС„РѕСЂРјР°С†РёСЏ */}
                  <div className="space-y-3 sm:space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <div>
                        <Label className="text-xs sm:text-sm font-semibold mb-1.5 sm:mb-2 block">РЎС‚Р°С‚СѓСЃ</Label>
                        <Badge variant="secondary" className="rounded-full text-xs sm:text-sm">
                          {`${getStatusLabel(String(selectedTaskForView.status ?? ""), effectiveColumns)}`}
                        </Badge>
                      </div>
                      
                      <div>
                        <Label className="text-xs sm:text-sm font-semibold mb-1.5 sm:mb-2 block">РџСЂРёРѕСЂРёС‚РµС‚</Label>
                        <Badge className={cn("rounded-full text-xs sm:text-sm", getPriorityColor(selectedTaskForView.priority || "medium"))}>
                          {`${getPriorityLabel(selectedTaskForView.priority || "medium")}`}
                        </Badge>
                      </div>
                    </div>

                    <div>
                      <Label className="text-sm font-semibold mb-2 block">РСЃРїРѕР»РЅРёС‚РµР»Рё</Label>
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
                        {users.length === 0 && <p className="text-sm text-muted-foreground">РЎРѕС‚СЂСѓРґРЅРёРєРё РїРѕРєР° РЅРµ Р·Р°РіСЂСѓР¶РµРЅС‹</p>}
                      </div>
                    </div>

                    {selectedTaskForView.assigneeId && (
                      <div>
                        <Label className="text-sm font-semibold mb-2 block">РСЃРїРѕР»РЅРёС‚РµР»СЊ</Label>
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
                        <Label className="text-sm font-semibold mb-2 block">Р”РµРґР»Р°Р№РЅ</Label>
                        <div className="flex items-center gap-2">
                          <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                          <span>{format(new Date(selectedTaskForView.dueDate), "dd.MM.yyyy HH:mm", { locale: ru })}</span>
                        </div>
                      </div>
                    )}

                    {selectedTaskForView.category && (
                      <div>
                        <Label className="text-sm font-semibold mb-2 block">РљР°С‚РµРіРѕСЂРёСЏ</Label>
                        <Badge variant="outline">{selectedTaskForView.category}</Badge>
                      </div>
                    )}

                    {selectedTaskForView.repository && (
                      <div>
                        <Label className="text-sm font-semibold mb-2 block">Р РµРїРѕР·РёС‚РѕСЂРёР№</Label>
                        <a href={selectedTaskForView.repository} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-2">
                          <Github className="w-4 h-4" />
                          {selectedTaskForView.repository}
                        </a>
                      </div>
                    )}

                    {selectedTaskForView.estimatedHours && (
                      <div>
                        <Label className="text-sm font-semibold mb-2 block">РћС†РµРЅРєР° РІСЂРµРјРµРЅРё</Label>
                        <div className="flex items-center gap-2">
                          <Hourglass className="w-4 h-4 text-muted-foreground" />
                          <span>{selectedTaskForView.estimatedHours} С‡Р°СЃРѕРІ</span>
                        </div>
                      </div>
                    )}

                    {/* РЎС‚РёРєРµСЂС‹ вЂ” Р·Р°РіРѕС‚РѕРІР»РµРЅРЅС‹Р№ РІС‹Р±РѕСЂ, РєР°Рє РІ YouGile */}
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold flex items-center gap-2">
                        <Tag className="w-4 h-4" />
                        РЎС‚РёРєРµСЂС‹
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
                                aria-label="РЈРґР°Р»РёС‚СЊ СЃС‚РёРєРµСЂ"
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
                              Р”РѕР±Р°РІРёС‚СЊ СЃС‚РёРєРµСЂ
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
                                <p className="text-xs text-muted-foreground px-2 py-1">Р’СЃРµ СЃС‚РёРєРµСЂС‹ РґРѕР±Р°РІР»РµРЅС‹</p>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>

                      {/* РЎС‚РёРєРµСЂС‹ РґРѕСЃРєРё: РІС‹Р±РѕСЂ РёР· СЃРїРёСЃРєР° РёР»Рё РІРІРѕРґ (РєР°Рє РІ YouGile) */}
                      {boardStickersRaw.length > 0 && (
                        <div className="space-y-2 pt-2 border-t">
                          <Label className="text-xs text-muted-foreground">Р”РѕР±Р°РІРёС‚СЊ СЃС‚РёРєРµСЂ РґРѕСЃРєРё</Label>
                          {(boardStickersRaw as BoardStickerItem[]).filter((sticker) => !(selectedTaskForView as any).tags?.some((t: any) => t?.id === sticker.id)).map((sticker) => (
                            <div key={sticker.id} className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-medium w-28 shrink-0">{sticker.title}</span>
                              {sticker.type === "user" ? (
                                <Select
                                  value={editingStickerValues[sticker.id] || ""}
                                  onValueChange={(v) => setEditingStickerValues((prev) => ({ ...prev, [sticker.id]: v }))}
                                >
                                  <SelectTrigger className="h-8 flex-1 min-w-[120px] text-xs">
                                    <SelectValue placeholder="РСЃРїРѕР»РЅРёС‚РµР»СЊ" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="">РќРµ РІС‹Р±СЂР°РЅРѕ</SelectItem>
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
                                    <SelectValue placeholder="Р’С‹Р±РµСЂРёС‚Рµ" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="">РќРµ РІС‹Р±СЂР°РЅРѕ</SelectItem>
                                    {sticker.options.map((opt) => (
                                      <SelectItem key={opt.id} value={opt.id}>{opt.title ?? opt.id}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Input
                                  placeholder="Р’РІРµРґРёС‚Рµ Р·РЅР°С‡РµРЅРёРµ"
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
                                Р”РѕР±Р°РІРёС‚СЊ
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* РџРѕРґР·Р°РґР°С‡Рё (С‡РµРєР»РёСЃС‚) */}
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold flex items-center gap-2">
                        <ListTodo className="w-4 h-4" />
                        РџРѕРґР·Р°РґР°С‡Рё {Array.isArray((selectedTaskForView as any).subtasks) ? `(${(selectedTaskForView as any).subtasks.filter((s: any) => s.completed).length}/${(selectedTaskForView as any).subtasks.length})` : ""}
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

                  {/* РЎСЃС‹Р»РєРё */}
                  {Array.isArray(selectedTaskForView.links) && selectedTaskForView.links.length > 0 ? (
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold flex items-center gap-2">
                        <Link2 className="w-4 h-4" />
                        РЎСЃС‹Р»РєРё
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

                  {/* Р¤Р°Р№Р»С‹ */}
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold flex items-center gap-2">
                      <Paperclip className="w-4 h-4" />
                      Р¤Р°Р№Р»С‹
                    </Label>
                    <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary">
                      <Paperclip className="h-3.5 w-3.5" />
                      РџСЂРёРєСЂРµРїРёС‚СЊ С„Р°Р№Р»
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
                            <span className="flex-1 text-sm">{file.name || `Р¤Р°Р№Р» ${index + 1}`}</span>
                            {file.url && (
                              <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-sm">
                                РћС‚РєСЂС‹С‚СЊ
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">РќРµС‚ РїСЂРёРєСЂРµРїР»РµРЅРЅС‹С… С„Р°Р№Р»РѕРІ</p>
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
                        <p className="text-xs sm:text-sm text-muted-foreground text-center py-8">РќРµС‚ РєРѕРјРјРµРЅС‚Р°СЂРёРµРІ</p>
                      )}
                    </div>
                  </ScrollArea>
                  
                  <div className="border-t pt-3 sm:pt-4">
                    <div className="space-y-2">
                      <Textarea
                        placeholder="Р”РѕР±Р°РІРёС‚СЊ РєРѕРјРјРµРЅС‚Р°СЂРёР№..."
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
                        Р”РѕР±Р°РІРёС‚СЊ РєРѕРјРјРµРЅС‚Р°СЂРёР№
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
                                    {item.action === "created" ? "РЎРѕР·РґР°РЅРѕ" :
                                     item.action === "updated" ? "РћР±РЅРѕРІР»РµРЅРѕ" :
                                     item.action === "status_changed" ? "РЎС‚Р°С‚СѓСЃ РёР·РјРµРЅРµРЅ" :
                                     item.action === "assigned" ? "РќР°Р·РЅР°С‡РµРЅРѕ" :
                                     item.action === "commented" ? "РљРѕРјРјРµРЅС‚Р°СЂРёР№" : item.action}
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
                      <p className="text-xs sm:text-sm text-muted-foreground text-center py-8">РќРµС‚ РёСЃС‚РѕСЂРёРё РёР·РјРµРЅРµРЅРёР№</p>
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

