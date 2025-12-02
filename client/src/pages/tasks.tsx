import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  Plus, Search, CheckCircle2, Clock, AlertCircle, 
  Circle, Calendar, MoreVertical, X,
  ArrowUp, ArrowRight, ArrowDown, Trash2, Eye, GripVertical,
  Play, Pause, Timer, Users, Paperclip
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTaskSchema, type Task, type User as UserType } from "@shared/schema";
import { z } from "zod";
import { format, formatDistanceToNow, isPast, differenceInDays, differenceInHours, addDays } from "date-fns";
import { ru } from "date-fns/locale";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";

const taskFormSchema = insertTaskSchema.extend({
  dueDate: z.string().optional(),
  startDate: z.string().optional(),
});

type TaskFormData = z.infer<typeof taskFormSchema>;

const statusConfig = {
  todo: { 
    label: "К выполнению", 
    icon: Circle, 
    color: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300", 
    bg: "bg-slate-50 dark:bg-slate-900/50",
    border: "border-slate-200 dark:border-slate-700"
  },
  in_progress: { 
    label: "В работе", 
    icon: Play, 
    color: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300", 
    bg: "bg-blue-50/50 dark:bg-blue-950/30",
    border: "border-blue-200 dark:border-blue-800"
  },
  review: { 
    label: "На проверке", 
    icon: Eye, 
    color: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300", 
    bg: "bg-amber-50/50 dark:bg-amber-950/30",
    border: "border-amber-200 dark:border-amber-800"
  },
  done: { 
    label: "Готово", 
    icon: CheckCircle2, 
    color: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300", 
    bg: "bg-emerald-50/50 dark:bg-emerald-950/30",
    border: "border-emerald-200 dark:border-emerald-800"
  },
  cancelled: { 
    label: "Отменено", 
    icon: X, 
    color: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300", 
    bg: "bg-red-50/50 dark:bg-red-950/30",
    border: "border-red-200 dark:border-red-800"
  },
};

const priorityConfig = {
  low: { label: "Низкий", icon: ArrowDown, color: "text-slate-500 dark:text-slate-400", dot: "bg-slate-400" },
  medium: { label: "Средний", icon: ArrowRight, color: "text-blue-500 dark:text-blue-400", dot: "bg-blue-500" },
  high: { label: "Высокий", icon: ArrowUp, color: "text-orange-500 dark:text-orange-400", dot: "bg-orange-500" },
  urgent: { label: "Срочный", icon: AlertCircle, color: "text-red-500 dark:text-red-400", dot: "bg-red-500" },
};

const getDeadlineInfo = (dueDate: Date | string | null, startDate?: Date | string | null) => {
  if (!dueDate) return null;
  
  const due = new Date(dueDate);
  const now = new Date();
  const start = startDate ? new Date(startDate) : addDays(now, -7);
  
  const totalTime = due.getTime() - start.getTime();
  const elapsed = now.getTime() - start.getTime();
  const progress = Math.min(100, Math.max(0, (elapsed / totalTime) * 100));
  
  const hoursLeft = differenceInHours(due, now);
  const daysLeft = differenceInDays(due, now);
  const isOverdue = isPast(due);
  
  let color = "bg-emerald-500";
  let textColor = "text-emerald-600 dark:text-emerald-400";
  
  if (isOverdue) {
    color = "bg-red-500";
    textColor = "text-red-600 dark:text-red-400";
  } else if (hoursLeft < 24) {
    color = "bg-red-500";
    textColor = "text-red-600 dark:text-red-400";
  } else if (daysLeft < 3) {
    color = "bg-amber-500";
    textColor = "text-amber-600 dark:text-amber-400";
  } else if (daysLeft < 7) {
    color = "bg-blue-500";
    textColor = "text-blue-600 dark:text-blue-400";
  }
  
  let label = "";
  if (isOverdue) {
    label = `Просрочено на ${Math.abs(daysLeft)} дн.`;
  } else if (hoursLeft < 24) {
    label = `${hoursLeft} ч.`;
  } else {
    label = `${daysLeft} дн.`;
  }
  
  return { progress, color, textColor, label, isOverdue };
};

const categoryOptions = [
  { value: "production", label: "Производство" },
  { value: "equipment", label: "Оборудование" },
  { value: "stream", label: "Стрим" },
  { value: "admin", label: "Администрирование" },
  { value: "other", label: "Другое" },
];

function getCurrentUser() {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem('streamstudio_user') || '{}');
  } catch {
    return {};
  }
}

export default function Tasks() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const { toast } = useToast();

  const [currentUser, setCurrentUser] = useState<any>({});
  
  useEffect(() => {
    setCurrentUser(getCurrentUser());
  }, []);

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const { data: users = [] } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
  });

  const form = useForm<TaskFormData>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: "",
      description: "",
      status: "todo",
      priority: "medium",
      creatorId: currentUser.id,
      category: "other",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: TaskFormData) => {
      const payload = {
        ...data,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
      };
      const response = await apiRequest("POST", "/api/tasks", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Успешно", description: "Задача создана" });
      setIsFormOpen(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Ошибка", description: "Не удалось создать задачу", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Task> }) => {
      const response = await apiRequest("PUT", `/api/tasks/${id}`, { ...data, userId: currentUser.id });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Успешно", description: "Задача обновлена" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/tasks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Успешно", description: "Задача удалена" });
    },
  });

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         task.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || task.status === statusFilter;
    const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesPriority;
  });

  const tasksByStatus = {
    todo: filteredTasks.filter(t => t.status === "todo"),
    in_progress: filteredTasks.filter(t => t.status === "in_progress"),
    review: filteredTasks.filter(t => t.status === "review"),
    done: filteredTasks.filter(t => t.status === "done"),
  };

  const getUserName = (userId: string | null) => {
    if (!userId) return null;
    const user = users.find(u => u.id === userId);
    return user ? user.name : null;
  };

  const getUserAvatar = (userId: string | null) => {
    if (!userId) return null;
    const user = users.find(u => u.id === userId);
    return user?.avatar || null;
  };

  const onSubmit = (data: TaskFormData) => {
    createMutation.mutate(data);
  };

  const handleStatusChange = (taskId: string, newStatus: string) => {
    const updates: Partial<Task> = { status: newStatus };
    if (newStatus === "done") {
      updates.completedAt = new Date();
    }
    updateMutation.mutate({ id: taskId, data: updates });
  };

  const handleDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;
    
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    
    const newStatus = destination.droppableId;
    
    // Optimistic update - immediately update UI
    queryClient.setQueryData<Task[]>(["/api/tasks"], (old) => {
      if (!old) return old;
      return old.map(task => 
        task.id === draggableId 
          ? { ...task, status: newStatus, completedAt: newStatus === "done" ? new Date() : task.completedAt }
          : task
      );
    });
    
    // Then sync with server
    handleStatusChange(draggableId, newStatus);
    
    toast({
      title: "Статус изменён",
      description: `Задача перемещена в "${statusConfig[newStatus as keyof typeof statusConfig]?.label}"`,
    });
  };

  const DraggableTaskCard = ({ task, index }: { task: Task; index: number }) => {
    const priorityConf = priorityConfig[task.priority as keyof typeof priorityConfig];
    const deadlineInfo = task.dueDate && task.status !== "done" 
      ? getDeadlineInfo(task.dueDate, task.startDate) 
      : null;
    const assigneeName = getUserName(task.assigneeId);

    return (
      <Draggable draggableId={task.id} index={index}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            className={`mb-2 cursor-grab active:cursor-grabbing transition-transform ${snapshot.isDragging ? 'rotate-1 scale-[1.02]' : ''}`}
          >
            <div
              className={`
                rounded-lg p-3 transition-all
                bg-white dark:bg-slate-800/90
                border border-slate-200 dark:border-slate-700
                hover:border-slate-300 dark:hover:border-slate-600
                hover:shadow-md dark:hover:shadow-lg dark:hover:shadow-black/20
                ${snapshot.isDragging ? 'shadow-xl ring-2 ring-primary/50 dark:ring-primary/30' : ''}
                ${deadlineInfo?.isOverdue ? 'border-l-4 border-l-red-500' : ''}
              `}
              data-testid={`task-card-${task.id}`}
            >
              {/* Priority indicator & Category */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${priorityConf.dot}`} />
                  <span className={`text-xs font-medium ${priorityConf.color}`}>{priorityConf.label}</span>
                </div>
                <div className="flex items-center gap-1">
                  {task.category && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400">
                      {categoryOptions.find(c => c.value === task.category)?.label || task.category}
                    </Badge>
                  )}
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="h-6 w-6 p-0 hover:bg-slate-100 dark:hover:bg-slate-700"
                    onClick={() => setSelectedTask(task)}
                    data-testid={`task-edit-${task.id}`}
                  >
                    <MoreVertical className="w-3.5 h-3.5 text-slate-500" />
                  </Button>
                </div>
              </div>
              
              {/* Title */}
              <h4 className="font-medium text-slate-900 dark:text-slate-100 mb-1.5 line-clamp-2 text-sm leading-snug">
                {task.title}
              </h4>
              
              {/* Description */}
              {task.description && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 line-clamp-2 leading-relaxed">
                  {task.description}
                </p>
              )}
              
              {/* Deadline progress bar */}
              {deadlineInfo && (
                <div className="mb-2">
                  <div className="flex items-center justify-between text-[10px] mb-1">
                    <div className={`flex items-center gap-1 ${deadlineInfo.textColor}`}>
                      <Timer className="w-3 h-3" />
                      <span className="font-medium">{deadlineInfo.label}</span>
                    </div>
                    <span className="text-slate-400 dark:text-slate-500">
                      {format(new Date(task.dueDate!), "d MMM", { locale: ru })}
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all ${deadlineInfo.color}`}
                      style={{ width: `${Math.min(deadlineInfo.progress, 100)}%` }}
                    />
                  </div>
                </div>
              )}
              
              {/* Footer: Assignee & Actions */}
              <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  {assigneeName ? (
                    <div className="flex items-center gap-1.5">
                      <Avatar className="w-5 h-5 border border-slate-200 dark:border-slate-600">
                        <AvatarImage src={getUserAvatar(task.assigneeId) || undefined} />
                        <AvatarFallback className="text-[9px] bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                          {assigneeName.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-slate-600 dark:text-slate-400 truncate max-w-[70px]">{assigneeName}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-slate-400 dark:text-slate-500">
                      <Users className="w-3.5 h-3.5" />
                      <span>Не назначено</span>
                    </div>
                  )}
                </div>
                
                {!deadlineInfo && task.dueDate && (
                  <div className="flex items-center gap-1 text-slate-400 dark:text-slate-500">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(task.dueDate), "d MMM", { locale: ru })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Draggable>
    );
  };

  const KanbanColumn = ({ status, tasks: columnTasks }: { status: string; tasks: Task[] }) => {
    const config = statusConfig[status as keyof typeof statusConfig];
    const StatusIcon = config.icon;

    return (
      <div className={`
        flex-1 min-w-[260px] max-w-[320px] rounded-xl
        bg-slate-50 dark:bg-slate-900/50
        border border-slate-200 dark:border-slate-800
        flex flex-col max-h-[calc(100vh-200px)]
      `}>
        {/* Column Header */}
        <div className={`
          flex items-center justify-between p-3
          border-b border-slate-200 dark:border-slate-800
          ${config.bg} rounded-t-xl
        `}>
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-md ${config.color}`}>
              <StatusIcon className="w-3.5 h-3.5" />
            </div>
            <span className="font-semibold text-sm text-slate-700 dark:text-slate-200">{config.label}</span>
          </div>
          <Badge 
            className="h-5 min-w-5 flex items-center justify-center text-xs font-semibold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
          >
            {columnTasks.length}
          </Badge>
        </div>
        
        {/* Scrollable Task List */}
        <Droppable droppableId={status}>
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={`
                flex-1 overflow-y-auto p-2 space-y-0 min-h-[150px]
                transition-all duration-200
                ${snapshot.isDraggingOver 
                  ? 'bg-primary/5 dark:bg-primary/10 ring-2 ring-inset ring-primary/30' 
                  : ''
                }
              `}
              style={{ maxHeight: 'calc(100vh - 280px)' }}
            >
              {columnTasks.map((task, index) => (
                <DraggableTaskCard key={task.id} task={task} index={index} />
              ))}
              {provided.placeholder}
              {columnTasks.length === 0 && !snapshot.isDraggingOver && (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400 dark:text-slate-600">
                  <Circle className="w-8 h-8 mb-2 opacity-50" />
                  <span className="text-sm">Нет задач</span>
                </div>
              )}
            </div>
          )}
        </Droppable>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Таск-менеджер</h2>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "kanban" | "list")} className="hidden sm:block">
              <TabsList className="bg-slate-100 dark:bg-slate-800">
                <TabsTrigger value="kanban" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700">Канбан</TabsTrigger>
                <TabsTrigger value="list" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700">Список</TabsTrigger>
              </TabsList>
            </Tabs>
            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
              <DialogTrigger asChild>
                <Button 
                  className="bg-primary hover:bg-primary/90 text-white shadow-sm flex-1 sm:flex-none"
                  data-testid="button-create-task"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Новая задача
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Создать задачу</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Название *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Название задачи" data-testid="input-task-title" />
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
                          <Textarea 
                            {...field} 
                            placeholder="Описание задачи"
                            value={field.value || ""}
                            data-testid="input-task-description"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="priority"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Приоритет</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-priority">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="low">Низкий</SelectItem>
                              <SelectItem value="medium">Средний</SelectItem>
                              <SelectItem value="high">Высокий</SelectItem>
                              <SelectItem value="urgent">Срочный</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Категория</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value || "other"}>
                            <FormControl>
                              <SelectTrigger data-testid="select-category">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {categoryOptions.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="assigneeId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Исполнитель</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger data-testid="select-assignee">
                              <SelectValue placeholder="Выберите исполнителя" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {users.map(user => (
                              <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="startDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Дата начала</FormLabel>
                          <FormControl>
                            <Input 
                              type="datetime-local" 
                              {...field} 
                              value={field.value || ""}
                              data-testid="input-start-date"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="dueDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Дедлайн</FormLabel>
                          <FormControl>
                            <Input 
                              type="datetime-local" 
                              {...field}
                              value={field.value || ""}
                              data-testid="input-due-date"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={createMutation.isPending}
                    data-testid="button-submit-task"
                  >
                    {createMutation.isPending ? "Создание..." : "Создать задачу"}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Поиск задач..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
            data-testid="input-search-tasks"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[160px] bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700" data-testid="filter-status">
            <SelectValue placeholder="Статус" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            {Object.entries(statusConfig).map(([key, conf]) => (
              <SelectItem key={key} value={key}>{conf.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-full sm:w-[160px] bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700" data-testid="filter-priority">
            <SelectValue placeholder="Приоритет" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все приоритеты</SelectItem>
            {Object.entries(priorityConfig).map(([key, conf]) => (
              <SelectItem key={key} value={key}>{conf.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Kanban Board */}
      {viewMode === "kanban" && (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-4 -mx-2 px-2">
            {["todo", "in_progress", "review", "done"].map(status => (
              <KanbanColumn 
                key={status} 
                status={status} 
                tasks={tasksByStatus[status as keyof typeof tasksByStatus]} 
              />
            ))}
          </div>
        </DragDropContext>
      )}

      {/* List View */}
      {viewMode === "list" && (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {filteredTasks.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  Задачи не найдены
                </div>
              ) : (
                filteredTasks.map(task => {
                  const config = statusConfig[task.status as keyof typeof statusConfig];
                  const priorityConf = priorityConfig[task.priority as keyof typeof priorityConfig];
                  const assigneeName = getUserName(task.assigneeId);
                  
                  return (
                    <div 
                      key={task.id} 
                      className="flex items-center justify-between p-4 hover:bg-muted/50"
                      data-testid={`task-row-${task.id}`}
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <priorityConf.icon className={`w-5 h-5 flex-shrink-0 ${priorityConf.color}`} />
                        <div className="min-w-0 flex-1">
                          <h4 className="font-medium text-foreground truncate">{task.title}</h4>
                          {task.description && (
                            <p className="text-sm text-muted-foreground truncate">{task.description}</p>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4 ml-4 flex-shrink-0">
                        <Badge className={config.color}>{config.label}</Badge>
                        
                        {assigneeName && (
                          <div className="flex items-center gap-2">
                            <Avatar className="w-6 h-6">
                              <AvatarImage src={getUserAvatar(task.assigneeId) || undefined} />
                              <AvatarFallback className="text-[10px]">
                                {assigneeName.split(' ').map(n => n[0]).join('')}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm text-muted-foreground hidden md:inline">{assigneeName}</span>
                          </div>
                        )}
                        
                        {task.dueDate && (
                          <span className="text-sm text-muted-foreground hidden lg:inline">
                            {format(new Date(task.dueDate), "d MMM", { locale: ru })}
                          </span>
                        )}
                        
                        <Select 
                          value={task.status} 
                          onValueChange={(value) => handleStatusChange(task.id, value)}
                        >
                          <SelectTrigger className="w-[130px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(statusConfig).map(([key, conf]) => (
                              <SelectItem key={key} value={key}>{conf.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => deleteMutation.mutate(task.id)}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Task Detail Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={() => setSelectedTask(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Детали задачи</DialogTitle>
          </DialogHeader>
          {selectedTask && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">{selectedTask.title}</h3>
                {selectedTask.description && (
                  <p className="text-muted-foreground mt-2">{selectedTask.description}</p>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground">Статус</label>
                  <Select 
                    value={selectedTask.status} 
                    onValueChange={(value) => {
                      handleStatusChange(selectedTask.id, value);
                      setSelectedTask({ ...selectedTask, status: value });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusConfig).map(([key, conf]) => (
                        <SelectItem key={key} value={key}>{conf.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="text-sm text-muted-foreground">Приоритет</label>
                  <p className="font-medium">
                    {priorityConfig[selectedTask.priority as keyof typeof priorityConfig]?.label}
                  </p>
                </div>
                
                <div>
                  <label className="text-sm text-muted-foreground">Исполнитель</label>
                  <p className="font-medium">{getUserName(selectedTask.assigneeId) || "Не назначен"}</p>
                </div>
                
                <div>
                  <label className="text-sm text-muted-foreground">Дедлайн</label>
                  <p className="font-medium">
                    {selectedTask.dueDate 
                      ? format(new Date(selectedTask.dueDate), "d MMMM yyyy, HH:mm", { locale: ru })
                      : "Не указан"}
                  </p>
                </div>
              </div>
              
              <div className="flex justify-end gap-2 pt-4">
                <Button 
                  variant="destructive" 
                  onClick={() => {
                    deleteMutation.mutate(selectedTask.id);
                    setSelectedTask(null);
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Удалить
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
