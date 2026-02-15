import { useState, useMemo, useCallback, memo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Plus, Search, CheckCircle2, Circle, 
  Trash2, Edit2, Calendar, X, Columns, GripVertical, Check, Filter,
  Paperclip, Link2, Clock, History, FileText, UserPlus, Github, FolderKanban, Tag, Hourglass,
  MessageSquare, ArrowUpDown, ArrowUp, ArrowDown, MoreVertical, Eye
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { type Task, type User as UserType } from "@shared/schema";
import { format, isPast, differenceInDays, differenceInHours } from "date-fns";
import { ru } from "date-fns/locale";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";

interface Section {
  id: string;
  name: string;
  columns: Column[];
  userId?: string; // ID пользователя для фильтрации задач
}

interface Column {
  id: string;
  name: string;
  order: number;
}

const defaultColumns: Column[] = [
  { id: "not_ready", name: "Не готово", order: 0 },
  { id: "todo", name: "К выполнению", order: 1 },
  { id: "in_progress", name: "В работе", order: 2 },
];

function getCurrentUser() {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem('streamstudio_user') || 'null');
  } catch {
    return null;
  }
}

function loadSections(users: UserType[] = [], currentUser: any = null): Section[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = localStorage.getItem('streamdesk_task_sections');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Если есть сохраненные разделы, проверяем наличие "Мои задачи"
      const hasMyTasks = parsed.some((s: Section) => s.id === 'my-tasks');
      if (!hasMyTasks && currentUser) {
        // Добавляем "Мои задачи" в начало, если его нет
        return [{
          id: 'my-tasks',
          name: 'Мои задачи',
          columns: defaultColumns,
          userId: currentUser.id,
        }, ...parsed];
      }
      return parsed;
    }
    
    // По умолчанию создаем раздел "Мои задачи"
    const defaultSections: Section[] = [{
      id: 'my-tasks',
      name: 'Мои задачи',
      columns: defaultColumns,
      userId: currentUser?.id,
    }];
    
    // Если пользователь - администратор, добавляем разделы для каждого пользователя
    if (currentUser?.role === 'admin' && users.length > 0) {
      users.forEach(user => {
        if (user.id !== currentUser.id) {
          defaultSections.push({
            id: `user-${user.id}`,
            name: user.name || user.username || 'Без имени',
            columns: defaultColumns,
            userId: user.id,
          });
        }
      });
    }
    
    return defaultSections;
  } catch {
    return [{
      id: 'my-tasks',
      name: 'Мои задачи',
      columns: defaultColumns,
      userId: currentUser?.id,
    }];
  }
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

// Функция для получения цвета дедлайна
function getDeadlineColor(dueDate: string | null | undefined): string {
  if (!dueDate) return "bg-gray-500";
  
  const due = new Date(dueDate);
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
  const [selectedSectionId, setSelectedSectionId] = useState<string>("my-tasks");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskStatus, setNewTaskStatus] = useState("todo");
  const [newTaskPriority, setNewTaskPriority] = useState("medium");
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState<string>("");
  const [quickTaskInputs, setQuickTaskInputs] = useState<Record<string, string>>({});
  
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
  const [selectedTaskForView, setSelectedTaskForView] = useState<Task | null>(null);
  
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
  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"priority" | "dueDate" | "createdAt" | "title">("priority");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  // Комментарии и история
  const [taskComments, setTaskComments] = useState<Record<string, any[]>>({});
  const [taskHistory, setTaskHistory] = useState<Record<string, any[]>>({});
  const [newComment, setNewComment] = useState<Record<string, string>>({});
  const [isLoadingComments, setIsLoadingComments] = useState<Record<string, boolean>>({});

  // Загрузка комментариев и истории при открытии задачи
  useEffect(() => {
    if (selectedTaskForView?.id) {
      const taskId = selectedTaskForView.id;
      
      // Загрузка комментариев
      if (!taskComments[taskId] && !isLoadingComments[taskId]) {
        setIsLoadingComments(prev => ({ ...prev, [taskId]: true }));
        fetch(`/api/tasks/${taskId}/comments`)
          .then(res => res.json())
          .then(data => {
            setTaskComments(prev => ({ ...prev, [taskId]: Array.isArray(data) ? data : [] }));
            setIsLoadingComments(prev => ({ ...prev, [taskId]: false }));
          })
          .catch(() => {
            setTaskComments(prev => ({ ...prev, [taskId]: [] }));
            setIsLoadingComments(prev => ({ ...prev, [taskId]: false }));
          });
      }
      
      // Загрузка истории
      if (!taskHistory[taskId]) {
        fetch(`/api/tasks/${taskId}/history`)
          .then(res => res.json())
          .then(data => {
            setTaskHistory(prev => ({ ...prev, [taskId]: Array.isArray(data) ? data : [] }));
          })
          .catch(() => {
            setTaskHistory(prev => ({ ...prev, [taskId]: [] }));
          });
      }
    }
  }, [selectedTaskForView?.id]);

  // Добавление комментария
  const handleAddComment = async (taskId: string) => {
    const commentText = newComment[taskId]?.trim();
    if (!commentText || !currentUser?.id) return;

    try {
      const response = await fetch(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: commentText,
          userId: currentUser.id,
        }),
      });

      if (response.ok) {
        const comment = await response.json();
        setTaskComments(prev => ({
          ...prev,
          [taskId]: [...(prev[taskId] || []), comment],
        }));
        setNewComment(prev => ({ ...prev, [taskId]: "" }));
        toast({ title: "Успешно", description: "Комментарий добавлен" });
      }
    } catch (error) {
      toast({ title: "Ошибка", description: "Не удалось добавить комментарий", variant: "destructive" });
    }
  };

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currentUser = getCurrentUser();

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

  // Загрузка проектов
  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ["/api/projects"],
    retry: 1,
  });

  // Инициализация разделов с учетом пользователей
  const [sections, setSections] = useState<Section[]>(() => loadSections([], currentUser));

  // Загрузка задач
  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    retry: 1,
    queryFn: async () => {
      try {
        const response = await fetch("/api/tasks");
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data) ? data : [];
      } catch (error) {
        console.error("[Tasks] Error:", error);
        return [];
      }
    },
  });


  const currentSection = sections.find(s => s.id === selectedSectionId) || sections[0];
  const allColumnIds = useMemo(() => {
    if (!currentSection) return [];
    return currentSection.columns.map(col => col.id);
  }, [currentSection]);

  // Фильтрация и сортировка задач
  const filteredTasks = useMemo(() => {
    let filtered = tasks.filter(task => {
      if (!task) return false;
      
      // Фильтр по столбцам
      const matchesColumn = allColumnIds.includes(task.status || "");
      if (!matchesColumn) return false;
      
      // Фильтр по пользователю (если раздел привязан к пользователю)
      if (currentSection?.userId) {
        // Для "Мои задачи" показываем задачи где assigneeId = userId ИЛИ creatorId = userId
        if (currentSection.id === 'my-tasks') {
          if (task.assigneeId !== currentSection.userId && task.creatorId !== currentSection.userId) {
            return false;
          }
        } else {
          // Для других разделов показываем только задачи назначенные на пользователя
          if (task.assigneeId !== currentSection.userId) {
            return false;
          }
        }
      }
      
      // Фильтр по поиску
      const matchesSearch = !searchTerm || 
        task.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.description?.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;
      
      // Фильтр по приоритету
      if (filterPriority !== "all" && task.priority !== filterPriority) {
        return false;
      }
      
      // Фильтр по категории
      if (filterCategory !== "all" && task.category !== filterCategory) {
        return false;
      }
      
      // Фильтр по проекту
      if (filterProject !== "all" && task.projectId !== filterProject) {
        return false;
      }
      
      // Фильтр по исполнителю
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
  }, [tasks, allColumnIds, searchTerm, currentSection, filterPriority, filterCategory, filterProject, filterAssignee, sortBy, sortOrder]);

  // Группировка задач по столбцам (мемоизировано для производительности)
  const tasksByColumn = useMemo(() => {
    if (!currentSection) return {};
    const result: Record<string, Task[]> = {};
    currentSection.columns.forEach(col => {
      result[col.id] = filteredTasks.filter(t => t?.status === col.id);
    });
    return result;
  }, [currentSection, filteredTasks]);

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

  // Обработка drag and drop
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const { source, destination, draggableId, type } = result;

    // Обработка перетаскивания столбцов
    if (type === "COLUMN") {
      const sectionIndex = sections.findIndex(s => s.id === selectedSectionId);
      if (sectionIndex === -1) return;

      const columns = Array.from(currentSection.columns);
      const [reorderedColumn] = columns.splice(source.index, 1);
      columns.splice(destination.index, 0, reorderedColumn);

      // Обновить порядок
      const updatedColumns = columns.map((col, index) => ({
        ...col,
        order: index,
      }));

      const updatedSections = [...sections];
      updatedSections[sectionIndex] = {
        ...updatedSections[sectionIndex],
        columns: updatedColumns,
      };

      setSections(updatedSections);
      saveSections(updatedSections);
      return;
    }

    // Обработка перетаскивания задач
    if (source.droppableId === destination.droppableId && source.index === destination.index) {
      return;
    }

    const newStatus = destination.droppableId;
    handleStatusChange(draggableId, newStatus);
  };

  // Создание раздела
  const handleCreateSection = () => {
    if (!newSectionName.trim()) {
      toast({ 
        title: "Ошибка", 
        description: "Введите название раздела",
        variant: "destructive" 
      });
      return;
    }

    const newSection: Section = {
      id: `section-${Date.now()}`,
      name: newSectionName,
      columns: [...defaultColumns],
    };

    const updatedSections = [...sections, newSection];
    setSections(updatedSections);
    saveSections(updatedSections);
    setSelectedSectionId(newSection.id);
    setNewSectionName("");
    setIsSectionFormOpen(false);
    toast({ title: "Успешно", description: "Раздел создан" });
  };
  
  // Обновление разделов при изменении пользователей (для админа)
  useEffect(() => {
    if (currentUser?.role === 'admin' && users.length > 0) {
      const userSections = users
        .filter(user => user.id !== currentUser.id)
        .map(user => ({
          id: `user-${user.id}`,
          name: user.name || user.username || 'Без имени',
          columns: defaultColumns,
          userId: user.id,
        }));
      
      // Проверяем, нужно ли обновить разделы
      const existingUserIds = sections
        .filter(s => s.id.startsWith('user-'))
        .map(s => s.userId);
      
      const newUserIds = userSections.map(s => s.userId);
      
      if (existingUserIds.length !== newUserIds.length || 
          !existingUserIds.every(id => newUserIds.includes(id))) {
        // Обновляем разделы
        const myTasksSection = sections.find(s => s.id === 'my-tasks') || {
          id: 'my-tasks',
          name: 'Мои задачи',
          columns: defaultColumns,
          userId: currentUser.id,
        };
        
        const customSections = sections.filter(s => 
          !s.id.startsWith('user-') && s.id !== 'my-tasks'
        );
        
        const updatedSections = [myTasksSection, ...userSections, ...customSections];
        setSections(updatedSections);
        saveSections(updatedSections);
      }
    } else if (currentUser && !sections.find(s => s.id === 'my-tasks')) {
      // Если нет раздела "Мои задачи", создаем его
      const myTasksSection = {
        id: 'my-tasks',
        name: 'Мои задачи',
        columns: defaultColumns,
        userId: currentUser.id,
      };
      setSections([myTasksSection, ...sections]);
      saveSections([myTasksSection, ...sections]);
      setSelectedSectionId('my-tasks');
    }
  }, [users, currentUser]);

  // Создание столбца
  const handleCreateColumn = () => {
    if (!newColumnName.trim()) {
      toast({ 
        title: "Ошибка", 
        description: "Введите название столбца",
        variant: "destructive" 
      });
      return;
    }

    const sectionIndex = sections.findIndex(s => s.id === selectedSectionId);
    if (sectionIndex === -1) return;

    const newColumn: Column = {
      id: `column-${Date.now()}`,
      name: newColumnName,
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
    setIsColumnFormOpen(false);
    toast({ title: "Успешно", description: "Столбец создан" });
  };

  // Быстрое создание задачи из поля под столбцом
  const handleQuickCreateTask = (columnId: string) => {
    const title = quickTaskInputs[columnId]?.trim();
    if (!title) return;

    createMutation.mutate({
      title,
      description: "",
      status: columnId,
      priority: "medium",
      assigneeId: null,
      dueDate: null,
    });

    setQuickTaskInputs({ ...quickTaskInputs, [columnId]: "" });
  };

  // Удаление раздела
  const handleDeleteSection = (sectionId: string) => {
    if (sectionId === 'my-tasks' || sectionId.startsWith('user-')) {
      toast({ 
        title: "Ошибка", 
        description: "Нельзя удалить системный раздел",
        variant: "destructive" 
      });
      return;
    }

    if (confirm("Удалить раздел? Все задачи в этом разделе останутся, но будут без раздела.")) {
      const updatedSections = sections.filter(s => s.id !== sectionId);
      setSections(updatedSections);
      saveSections(updatedSections);
      if (selectedSectionId === sectionId) {
        setSelectedSectionId('default');
      }
      toast({ title: "Успешно", description: "Раздел удален" });
    }
  };

  // Удаление столбца
  const handleDeleteColumn = (columnId: string) => {
    if (defaultColumns.some(col => col.id === columnId)) {
      toast({ 
        title: "Ошибка", 
        description: "Нельзя удалить стандартный столбец",
        variant: "destructive" 
      });
      return;
    }

    if (confirm("Удалить столбец? Задачи из этого столбца будут перемещены в 'К выполнению'.")) {
      const sectionIndex = sections.findIndex(s => s.id === selectedSectionId);
      if (sectionIndex === -1) return;

      const tasksToUpdate = tasks.filter(t => t?.status === columnId);
      tasksToUpdate.forEach(task => {
        updateMutation.mutate({ 
          id: task.id, 
          data: { status: "todo" } 
        });
      });

      const updatedSections = [...sections];
      updatedSections[sectionIndex] = {
        ...updatedSections[sectionIndex],
        columns: updatedSections[sectionIndex].columns.filter(col => col.id !== columnId),
      };

      setSections(updatedSections);
      saveSections(updatedSections);
      toast({ title: "Успешно", description: "Столбец удален" });
    }
  };

  // Создание задачи
  const createMutation = useMutation({
    mutationFn: async (taskData: any) => {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...taskData,
          creatorId: currentUser?.id,
        }),
      });
      if (!response.ok) throw new Error("Не удалось создать задачу");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setIsFormOpen(false);
      setNewTaskTitle("");
      setNewTaskDescription("");
      setNewTaskStatus("todo");
      setNewTaskPriority("medium");
      setNewTaskAssigneeId("");
      setNewTaskDueDate("");
      setNewTaskRepository("");
      setNewTaskProject("");
      setNewTaskCategory("");
      setNewTaskEstimatedHours("");
      setNewTaskLinks([]);
      toast({ title: "Успешно", description: "Задача создана" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Ошибка", 
        description: error.message || "Не удалось создать задачу",
        variant: "destructive" 
      });
    },
  });

  // Обновление задачи
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Task> }) => {
      const response = await fetch(`/api/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Не удалось обновить задачу");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Ошибка", 
        description: error.message || "Не удалось обновить задачу",
        variant: "destructive" 
      });
    },
  });

  // Удаление задачи
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/tasks/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Не удалось удалить задачу");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
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
    if (!newTaskTitle.trim()) {
      toast({ 
        title: "Ошибка", 
        description: "Введите название задачи",
        variant: "destructive" 
      });
      return;
    }

    // Если назначен ответственный, задача должна попасть в столбец "todo" (к выполнению)
    const taskStatus = newTaskAssigneeId ? "todo" : newTaskStatus;

    // Подготовка данных для создания задачи
    const taskData: any = {
      title: newTaskTitle,
      description: newTaskDescription,
      status: taskStatus,
      priority: newTaskPriority,
      assigneeId: newTaskAssigneeId || null,
      dueDate: newTaskDueDate || null,
      repository: newTaskRepository || null,
      projectId: newTaskProject || null,
      category: newTaskCategory || null,
      estimatedHours: newTaskEstimatedHours ? parseInt(newTaskEstimatedHours) : null,
      links: newTaskLinks.length > 0 ? newTaskLinks : null,
    };

    // Добавляем attachments только если есть файлы
    if (attachedFiles.length > 0) {
      taskData.attachments = attachedFiles;
    }

    createMutation.mutate(taskData);

    // Сброс состояний
    setSubtasks([]);
    setNewSubtaskTitle("");
    setAttachedFiles([]);
    setNewTaskRepository("");
    setNewTaskProject("");
    setNewTaskCategory("");
    setNewTaskEstimatedHours("");
    setNewTaskLinks([]);
    setNewLinkTitle("");
    setNewLinkUrl("");
  };

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

  const handleStatusChange = (taskId: string, newStatus: string) => {
    updateMutation.mutate({ 
      id: taskId, 
      data: { 
        status: newStatus,
        completedAt: newStatus === "done" ? new Date() : undefined,
      } 
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
    // Генерируем цвет на основе ID проекта
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

  const daysInSelectedMonth = getDaysInMonth(selectedMonth, selectedYear);
  const daysArray = Array.from({ length: daysInSelectedMonth }, (_, i) => i + 1);
  const hoursArray = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));

  if (tasksLoading) {
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 neon:from-black neon:via-slate-950 neon:to-black p-2 sm:p-3 md:p-4 lg:p-6">
      <div className="max-w-[1920px] mx-auto space-y-2 sm:space-y-3 md:space-y-4">
        {/* Заголовок и управление */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 w-full sm:w-auto">
              <div>
                <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold bg-gradient-to-r from-slate-900 via-slate-700 to-slate-900 dark:from-slate-100 dark:via-slate-300 dark:to-slate-100 neon:from-cyan-300 neon:via-purple-300 neon:to-cyan-300 bg-clip-text text-transparent">
                  {currentSection?.name || "Задачи"}
                </h1>
              </div>
            {/* Список разделов как теги */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              {sections.map(section => (
                <Button
                  key={section.id}
                  variant={selectedSectionId === section.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedSectionId(section.id)}
                  className={cn(
                    "relative group h-8 sm:h-9 px-2 sm:px-3 md:px-4 text-xs sm:text-sm font-medium transition-all",
                    selectedSectionId === section.id 
                      ? "rounded-full shadow-lg hover:shadow-xl" 
                      : "rounded-full border-2 hover:border-primary/50"
                  )}
                >
                  <span className="truncate max-w-[100px] sm:max-w-none">{section.name}</span>
                  {section.id !== 'default' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSection(section.id);
                      }}
                      className="ml-1 sm:ml-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-0.5 hover:bg-destructive/20"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
            {/* Создание раздела */}
            <Dialog open={isSectionFormOpen} onOpenChange={setIsSectionFormOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-full px-2 sm:px-3 md:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-medium">
                  <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">Новый раздел</span>
                  <span className="sm:hidden">Раздел</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Создать раздел</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Название раздела</Label>
                    <Input
                      value={newSectionName}
                      onChange={(e) => setNewSectionName(e.target.value)}
                      placeholder="Название раздела"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleCreateSection();
                        }
                      }}
                    />
                  </div>
                  <Button onClick={handleCreateSection} className="w-full rounded-full px-6 py-2.5 font-medium">
                    Создать
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Создание столбца */}
            {currentSection && (
              <Dialog open={isColumnFormOpen} onOpenChange={setIsColumnFormOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-full px-2 sm:px-3 md:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-medium">
                    <Columns className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                    <span className="hidden sm:inline">Новый столбец</span>
                    <span className="sm:hidden">Столбец</span>
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Создать столбец</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Название столбца</Label>
                      <Input
                        value={newColumnName}
                        onChange={(e) => setNewColumnName(e.target.value)}
                        placeholder="Название столбца"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleCreateColumn();
                          }
                        }}
                      />
                    </div>
                    <Button onClick={handleCreateColumn} className="w-full rounded-full px-6 py-2.5 font-medium">
                      Создать
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}

            {/* Создание задачи */}
            <Sheet open={isFormOpen} onOpenChange={setIsFormOpen}>
              <SheetTrigger asChild>
                <Button size="sm" className="rounded-full px-3 sm:px-4 md:px-6 py-2 sm:py-2.5 text-xs sm:text-sm font-medium shadow-lg hover:shadow-xl transition-all">
                  <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">Новая задача</span>
                  <span className="sm:hidden">Задача</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-lg md:max-w-2xl overflow-y-auto hide-scrollbar p-3 sm:p-6">
                <SheetHeader className="mb-6">
                  <SheetTitle className="text-2xl font-bold">Создать задачу</SheetTitle>
                  <SheetDescription>
                    Заполните все необходимые поля для создания новой задачи
                  </SheetDescription>
                </SheetHeader>
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs sm:text-sm">Название *</Label>
                    <Input
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      placeholder="Название задачи"
                      className="h-9 sm:h-10 text-xs sm:text-sm"
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
                          {currentSection?.columns.map(column => (
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
        </div>

        {/* Поиск и фильтры */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
            <Input
              placeholder="Поиск задач..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 sm:pl-10 h-9 sm:h-10 text-sm"
            />
          </div>
          
          {/* Фильтры */}
          <Popover open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-1.5 sm:gap-2 h-9 sm:h-10 text-xs sm:text-sm px-3 sm:px-4">
                <Filter className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Фильтры</span>
                <span className="sm:hidden">Фильтр</span>
                {(filterPriority !== "all" || filterCategory !== "all" || filterProject !== "all" || filterAssignee !== "all") && (
                  <Badge variant="secondary" className="ml-1 h-4 w-4 sm:h-5 sm:w-5 rounded-full p-0 flex items-center justify-center text-[10px] sm:text-xs">
                    {[filterPriority, filterCategory, filterProject, filterAssignee].filter(f => f !== "all").length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[calc(100vw-2rem)] sm:w-80" align="end">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Приоритет</Label>
                  <Select value={filterPriority} onValueChange={setFilterPriority}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все</SelectItem>
                      <SelectItem value="urgent">Срочный</SelectItem>
                      <SelectItem value="high">Высокий</SelectItem>
                      <SelectItem value="medium">Средний</SelectItem>
                      <SelectItem value="low">Низкий</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Категория</Label>
                  <Select value={filterCategory} onValueChange={setFilterCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все</SelectItem>
                      <SelectItem value="production">Производство</SelectItem>
                      <SelectItem value="equipment">Оборудование</SelectItem>
                      <SelectItem value="stream">Стрим</SelectItem>
                      <SelectItem value="admin">Администрирование</SelectItem>
                      <SelectItem value="other">Другое</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Проект</Label>
                  <Select value={filterProject} onValueChange={setFilterProject}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все</SelectItem>
                      {projects.map(project => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Исполнитель</Label>
                  <Select value={filterAssignee} onValueChange={setFilterAssignee}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все</SelectItem>
                      <SelectItem value="unassigned">Не назначены</SelectItem>
                      {users.map(user => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setFilterPriority("all");
                      setFilterCategory("all");
                      setFilterProject("all");
                      setFilterAssignee("all");
                    }}
                  >
                    Сбросить
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          
          {/* Сортировка */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-1.5 sm:gap-2 h-9 sm:h-10 text-xs sm:text-sm px-3 sm:px-4">
                <ArrowUpDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Сортировка</span>
                <span className="sm:hidden">Сорт</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Сортировать по</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { setSortBy("priority"); setSortOrder("desc"); }}>
                {sortBy === "priority" && (sortOrder === "desc" ? <ArrowDown className="w-4 h-4 mr-2" /> : <ArrowUp className="w-4 h-4 mr-2" />)}
                Приоритету
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setSortBy("dueDate"); setSortOrder("asc"); }}>
                {sortBy === "dueDate" && (sortOrder === "asc" ? <ArrowUp className="w-4 h-4 mr-2" /> : <ArrowDown className="w-4 h-4 mr-2" />)}
                Дедлайну
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setSortBy("createdAt"); setSortOrder("desc"); }}>
                {sortBy === "createdAt" && (sortOrder === "desc" ? <ArrowDown className="w-4 h-4 mr-2" /> : <ArrowUp className="w-4 h-4 mr-2" />)}
                Дате создания
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setSortBy("title"); setSortOrder("asc"); }}>
                {sortBy === "title" && (sortOrder === "asc" ? <ArrowUp className="w-4 h-4 mr-2" /> : <ArrowDown className="w-4 h-4 mr-2" />)}
                Названию
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Канбан доска с drag and drop */}
        {currentSection && (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="columns" direction="horizontal" type="COLUMN">
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="flex gap-2 sm:gap-3 md:gap-4 overflow-x-auto pb-4 px-1 sm:px-2 hide-scrollbar snap-x snap-mandatory"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  {currentSection.columns
                    .sort((a, b) => a.order - b.order)
                    .map((column, columnIndex) => (
                      <Draggable key={column.id} draggableId={`column-${column.id}`} index={columnIndex} type="COLUMN">
                        {(provided, snapshot) => (
                          <Card
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={cn(
                              "flex flex-col min-w-[260px] sm:min-w-[280px] md:min-w-[300px] max-w-[280px] sm:max-w-[300px] md:max-w-[320px] flex-shrink-0 shadow-xl rounded-xl border-2 transition-all snap-start",
                              snapshot.isDragging
                                ? "shadow-2xl scale-105 rotate-2 border-primary/50 z-50 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900"
                                : "border-slate-200 dark:border-slate-700 hover:border-primary/30 hover:shadow-2xl bg-white dark:bg-slate-800/95 backdrop-blur-sm"
                            )}
                          >
                            <CardHeader
                              {...provided.dragHandleProps}
                              className="pb-2 sm:pb-3 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-slate-50 to-transparent dark:from-slate-800/50 dark:to-transparent rounded-t-xl space-y-2 sm:space-y-3 p-3 sm:p-4"
                            >
                              <CardTitle className="text-xs sm:text-sm font-semibold flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                                  <GripVertical className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0" />
                                  <span className="text-slate-900 dark:text-slate-100 truncate">{column.name}</span>
                                </div>
                                <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                                  <Badge variant="secondary" className="text-[10px] sm:text-xs font-medium bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-1.5 sm:px-2">
                                    {tasksByColumn[column.id]?.length || 0}
                                  </Badge>
                                  {!defaultColumns.some(col => col.id === column.id) && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteColumn(column.id);
                                      }}
                                      className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                                      title="Удалить столбец"
                                    >
                                      <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                    </button>
                                  )}
                                </div>
                              </CardTitle>

                              {/* Быстрое добавление задачи под заголовком */}
                              <div className="flex items-center gap-1.5 sm:gap-2 pt-1">
                                <Input
                                  placeholder="Добавить задачу"
                                  value={quickTaskInputs[column.id] || ""}
                                  onChange={(e) => setQuickTaskInputs({ ...quickTaskInputs, [column.id]: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleQuickCreateTask(column.id);
                                    }
                                  }}
                                  className="h-8 sm:h-9 text-xs sm:text-sm rounded-lg border-slate-300 dark:border-slate-600 focus:border-primary focus:ring-2 focus:ring-primary/20 bg-white dark:bg-slate-800 flex-1 min-w-0"
                                />
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 sm:h-9 sm:w-9 rounded-full hover:bg-primary/10 hover:text-primary transition-colors flex-shrink-0"
                                  onClick={() => handleQuickCreateTask(column.id)}
                                  disabled={!quickTaskInputs[column.id]?.trim()}
                                >
                                  <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                </Button>
                              </div>
                            </CardHeader>
                    <Droppable droppableId={column.id}>
                      {(provided, snapshot) => (
                        <CardContent
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={cn(
                            "flex-1 overflow-y-auto space-y-2 sm:space-y-3 min-h-[200px] sm:min-h-[300px] md:min-h-[400px] max-h-[400px] sm:max-h-[500px] md:max-h-[700px] hide-scrollbar p-2 sm:p-3 md:p-4 bg-gradient-to-b from-transparent to-slate-50/50 dark:to-slate-900/50",
                            snapshot.isDraggingOver && "bg-gradient-to-br from-primary/10 via-primary/5 to-transparent dark:from-primary/20 dark:via-primary/10 border-2 border-dashed border-primary/50 rounded-xl shadow-inner"
                          )}
                        >
                          {tasksByColumn[column.id]?.length === 0 ? (
                            <div className="text-center text-sm text-muted-foreground py-12 flex flex-col items-center gap-2">
                              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                <Circle className="w-6 h-6 text-slate-400" />
                              </div>
                              <span>Нет задач</span>
                            </div>
                          ) : (
                            tasksByColumn[column.id]?.map((task, index) => {
                              const taskTag = getTaskTag(task);
                              return (
                                <Draggable key={task.id} draggableId={task.id} index={index}>
                                  {(provided, snapshot) => (
                                    <Card
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      className={cn(
                                        "p-2.5 sm:p-3 md:p-4 hover:shadow-lg transition-all duration-200 cursor-grab active:cursor-grabbing relative border-2 rounded-xl bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-900",
                                        snapshot.isDragging 
                                          ? "shadow-2xl rotate-2 scale-105 border-primary z-50 ring-4 ring-primary/20" 
                                          : "border-slate-200 dark:border-slate-700 hover:border-primary/40 hover:shadow-xl hover:-translate-y-1"
                                      )}
                                    >
                                      {/* Тег приоритета сверху */}
                                      {taskTag && (
                                        <div className="mb-3">
                                          <Badge className={cn("text-xs font-medium px-2 py-0.5 rounded-full", taskTag.color, "shadow-sm")}>
                                            {taskTag.label}
                                          </Badge>
                                        </div>
                                      )}

                                      <div className="space-y-2 sm:space-y-3">
                                        {/* Заголовок задачи */}
                                        <div className="flex items-start justify-between gap-1.5 sm:gap-2">
                                          <h3 
                                            className="font-semibold text-xs sm:text-sm flex-1 leading-snug text-slate-900 dark:text-slate-100 cursor-pointer hover:text-primary transition-colors line-clamp-2 min-w-0"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setSelectedTaskForView(task);
                                            }}
                                            title={task.title}
                                          >
                                            {task.title}
                                          </h3>
                                          <div className="flex items-center gap-1 flex-shrink-0">
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-5 w-5 sm:h-6 sm:w-6"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedTaskForView(task);
                                              }}
                                              title="Просмотр задачи"
                                            >
                                              <Eye className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                            </Button>
                                            <Checkbox
                                              checked={task.status === "done"}
                                              onCheckedChange={(checked) => {
                                                handleStatusChange(task.id, checked ? "done" : "todo");
                                              }}
                                              className="h-3.5 w-3.5 sm:h-4 sm:w-4 rounded border-2 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                            />
                                          </div>
                                        </div>

                                        {/* Описание задачи (если есть) */}
                                        {task.description && (
                                          <p className="text-xs text-muted-foreground line-clamp-2">
                                            {task.description}
                                          </p>
                                        )}

                                        {/* Метаданные: назначение, инициалы и дата */}
                                        <div className="flex items-center justify-between gap-1.5 sm:gap-2 flex-wrap">
                                          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0 flex-1">
                                            {task.assigneeId ? (
                                              <Select
                                                value={task.assigneeId}
                                                onValueChange={(value) => {
                                                  const newAssigneeId = value === "none" ? null : value;
                                                  // При назначении ответственного, задача попадает в столбец "todo"
                                                  const newStatus = newAssigneeId ? "todo" : task.status;
                                                  updateMutation.mutate({
                                                    id: task.id,
                                                    data: { assigneeId: newAssigneeId, status: newStatus },
                                                  });
                                                }}
                                              >
                                                <SelectTrigger asChild>
                                                  <div className="flex items-center gap-1 group cursor-pointer">
                                                    <Avatar className="w-6 h-6 sm:w-7 sm:h-7 ring-2 ring-slate-200 dark:ring-slate-700 group-hover:ring-primary/50 transition-all flex-shrink-0">
                                                      <AvatarImage src={getUserAvatar(task.assigneeId) || undefined} />
                                                      <AvatarFallback className="text-[9px] sm:text-[10px] font-semibold bg-gradient-to-br from-primary/20 to-primary/10 text-primary border border-primary/20">
                                                        {getUserInitials(task.assigneeId) || "?"}
                                                      </AvatarFallback>
                                                    </Avatar>
                                                  </div>
                                                </SelectTrigger>
                                                <SelectContent onClick={(e) => e.stopPropagation()}>
                                                  <SelectItem value="none">Не назначен</SelectItem>
                                                  {users.map(user => (
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
                                                <SelectTrigger asChild>
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 sm:h-7 px-1.5 sm:px-2 text-[10px] sm:text-xs text-muted-foreground hover:text-primary border border-dashed border-slate-300 dark:border-slate-600 hover:border-primary/50 rounded-full"
                                                    onClick={(e) => e.stopPropagation()}
                                                  >
                                                    <Plus className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                                                    <span className="hidden sm:inline">Назначить</span>
                                                  </Button>
                                                </SelectTrigger>
                                                <SelectContent onClick={(e) => e.stopPropagation()}>
                                                  <SelectItem value="none">Не назначен</SelectItem>
                                                  {users.map(user => (
                                                    <SelectItem key={user.id} value={user.id}>
                                                      {user.name}
                                                    </SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                            )}
                                            {task.dueDate && (
                                              <span className="flex items-center gap-0.5 sm:gap-1 text-[10px] sm:text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-700/50 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md whitespace-nowrap">
                                                <Calendar className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                                {format(new Date(task.dueDate), "d MMM", { locale: ru })}
                                              </span>
                                            )}
                                          </div>
                                          
                                          {/* Индикаторы */}
                                          <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
                                            {taskComments[task.id]?.length > 0 && (
                                              <div className="flex items-center gap-0.5 sm:gap-1 text-[10px] sm:text-xs text-muted-foreground">
                                                <MessageSquare className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                                <span>{taskComments[task.id].length}</span>
                                              </div>
                                            )}
                                            {task.attachments && Array.isArray(task.attachments) && task.attachments.length > 0 && (
                                              <div className="flex items-center gap-0.5 sm:gap-1 text-[10px] sm:text-xs text-muted-foreground">
                                                <Paperclip className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                                <span>{task.attachments.length}</span>
                                              </div>
                                            )}
                                            {task.links && Array.isArray(task.links) && task.links.length > 0 && (
                                              <div className="flex items-center gap-0.5 sm:gap-1 text-[10px] sm:text-xs text-muted-foreground">
                                                <Link2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                                <span>{task.links.length}</span>
                                              </div>
                                            )}
                                          </div>
                                        </div>

                                        {/* Полоски: проект и дедлайн */}
                                        <div className="absolute bottom-0 left-0 right-0 flex flex-col gap-0.5">
                                          {/* Полоска проекта */}
                                          {task.projectId && (() => {
                                            const projectColor = getProjectColor(task.projectId);
                                            return projectColor ? (
                                              <div className={cn("h-1.5 rounded-b-xl", projectColor.bg, projectColor.darkBg)} 
                                                style={{
                                                  boxShadow: `0 0 10px ${projectColor.bg.includes('orange') ? '#f97316' : 
                                                    projectColor.bg.includes('purple') ? '#a855f7' :
                                                    projectColor.bg.includes('blue') ? '#3b82f6' :
                                                    projectColor.bg.includes('green') ? '#22c55e' : '#ec4899'}40`,
                                                }}
                                              />
                                            ) : null;
                                          })()}
                                          
                                          {/* Неоновая полоса дедлайна */}
                                          {task.dueDate && (
                                            <div className="h-2 rounded-b-xl overflow-hidden">
                                              <div 
                                                className={cn(
                                                  "h-full w-full rounded-b-xl",
                                                  getDeadlineColor(task.dueDate)
                                                )}
                                                style={{
                                                  boxShadow: `0 0 20px ${getDeadlineColor(task.dueDate).includes('red') ? '#ef4444' : 
                                                    getDeadlineColor(task.dueDate).includes('orange') ? '#f97316' :
                                                    getDeadlineColor(task.dueDate).includes('yellow') ? '#eab308' :
                                                    getDeadlineColor(task.dueDate).includes('blue') ? '#3b82f6' : '#22c55e'}, 
                                                    0 0 40px ${getDeadlineColor(task.dueDate).includes('red') ? '#ef4444' : 
                                                    getDeadlineColor(task.dueDate).includes('orange') ? '#f97316' :
                                                    getDeadlineColor(task.dueDate).includes('yellow') ? '#eab308' :
                                                    getDeadlineColor(task.dueDate).includes('blue') ? '#3b82f6' : '#22c55e'}80,
                                                    inset 0 0 10px ${getDeadlineColor(task.dueDate).includes('red') ? '#ef4444' : 
                                                    getDeadlineColor(task.dueDate).includes('orange') ? '#f97316' :
                                                    getDeadlineColor(task.dueDate).includes('yellow') ? '#eab308' :
                                                    getDeadlineColor(task.dueDate).includes('blue') ? '#3b82f6' : '#22c55e'}40`,
                                                  filter: 'brightness(1.4) saturate(1.3)',
                                                }}
                                              />
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </Card>
                                  )}
                                </Draggable>
                              );
                            })
                          )}
                          {provided.placeholder}
                          
                        </CardContent>
                      )}
                    </Droppable>
                          </Card>
                        )}
                      </Draggable>
                    ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}

        {/* Боковая панель для просмотра задачи */}
        <Sheet open={!!selectedTaskForView} onOpenChange={(open) => !open && setSelectedTaskForView(null)}>
          <SheetContent side="right" className="w-full sm:max-w-lg md:max-w-2xl lg:max-w-3xl overflow-y-auto hide-scrollbar p-3 sm:p-6">
            {selectedTaskForView && (
              <Tabs defaultValue="info" className="w-full">
                <SheetHeader className="mb-4 sm:mb-6">
                  <SheetTitle className="text-lg sm:text-xl md:text-2xl font-bold break-words">{selectedTaskForView.title}</SheetTitle>
                  <SheetDescription className="text-xs sm:text-sm break-words">
                    {selectedTaskForView.description || "Нет описания"}
                  </SheetDescription>
                </SheetHeader>
                
                <TabsList className="grid w-full grid-cols-3 mb-4 sm:mb-6 h-9 sm:h-10">
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

                <TabsContent value="info" className="space-y-4 sm:space-y-6">
                  {/* Основная информация */}
                  <div className="space-y-3 sm:space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <div>
                        <Label className="text-xs sm:text-sm font-semibold mb-1.5 sm:mb-2 block">Статус</Label>
                        <Badge variant="secondary" className="rounded-full text-xs sm:text-sm">
                          {currentSection?.columns.find(c => c.id === selectedTaskForView.status)?.name || selectedTaskForView.status}
                        </Badge>
                      </div>
                      
                      <div>
                        <Label className="text-xs sm:text-sm font-semibold mb-1.5 sm:mb-2 block">Приоритет</Label>
                        <Badge className={cn("rounded-full text-xs sm:text-sm", getPriorityColor(selectedTaskForView.priority || "medium"))}>
                          {getPriorityLabel(selectedTaskForView.priority || "medium")}
                        </Badge>
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
                          <Calendar className="w-4 h-4 text-muted-foreground" />
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
                  </div>

                  {/* Ссылки */}
                  {selectedTaskForView.links && Array.isArray(selectedTaskForView.links) && selectedTaskForView.links.length > 0 && (
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
                  )}

                  {/* Файлы */}
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold flex items-center gap-2">
                      <Paperclip className="w-4 h-4" />
                      Файлы
                    </Label>
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

                <TabsContent value="comments" className="space-y-3 sm:space-y-4">
                  <ScrollArea className="h-[calc(100vh-300px)] sm:h-[500px] md:h-[600px] pr-2 sm:pr-4">
                    <div className="space-y-3 sm:space-y-4">
                      {isLoadingComments[selectedTaskForView.id] ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-primary"></div>
                        </div>
                      ) : taskComments[selectedTaskForView.id]?.length > 0 ? (
                        taskComments[selectedTaskForView.id].map((comment: any) => (
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
                        value={newComment[selectedTaskForView.id] || ""}
                        onChange={(e) => setNewComment(prev => ({ ...prev, [selectedTaskForView.id]: e.target.value }))}
                        rows={3}
                        className="resize-none text-xs sm:text-sm"
                      />
                      <Button
                        onClick={() => handleAddComment(selectedTaskForView.id)}
                        disabled={!newComment[selectedTaskForView.id]?.trim()}
                        className="w-full h-9 sm:h-10 text-xs sm:text-sm"
                      >
                        <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
                        Добавить комментарий
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="history" className="space-y-3 sm:space-y-4">
                  <ScrollArea className="h-[calc(100vh-300px)] sm:h-[500px] md:h-[600px] pr-2 sm:pr-4">
                    {taskHistory[selectedTaskForView.id]?.length > 0 ? (
                      <div className="space-y-2 sm:space-y-3">
                        {taskHistory[selectedTaskForView.id].map((item: any) => (
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
              </Tabs>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
