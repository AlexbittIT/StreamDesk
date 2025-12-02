import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Plus, Search, Filter, CheckCircle2, Clock, AlertCircle, 
  Circle, User, Calendar, MessageSquare, MoreVertical,
  ArrowUp, ArrowRight, ArrowDown, Trash2, Edit, Eye
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTaskSchema, type Task, type User as UserType } from "@shared/schema";
import { z } from "zod";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { ru } from "date-fns/locale";

const taskFormSchema = insertTaskSchema.extend({
  dueDate: z.string().optional(),
  startDate: z.string().optional(),
});

type TaskFormData = z.infer<typeof taskFormSchema>;

const statusConfig = {
  todo: { label: "К выполнению", icon: Circle, color: "bg-gray-100 text-gray-800", bg: "bg-gray-50" },
  in_progress: { label: "В работе", icon: Clock, color: "bg-blue-100 text-blue-800", bg: "bg-blue-50" },
  review: { label: "На проверке", icon: Eye, color: "bg-yellow-100 text-yellow-800", bg: "bg-yellow-50" },
  done: { label: "Готово", icon: CheckCircle2, color: "bg-green-100 text-green-800", bg: "bg-green-50" },
  cancelled: { label: "Отменено", icon: AlertCircle, color: "bg-red-100 text-red-800", bg: "bg-red-50" },
};

const priorityConfig = {
  low: { label: "Низкий", icon: ArrowDown, color: "text-gray-500" },
  medium: { label: "Средний", icon: ArrowRight, color: "text-blue-500" },
  high: { label: "Высокий", icon: ArrowUp, color: "text-orange-500" },
  urgent: { label: "Срочный", icon: AlertCircle, color: "text-red-500" },
};

const categoryOptions = [
  { value: "production", label: "Производство" },
  { value: "equipment", label: "Оборудование" },
  { value: "stream", label: "Стрим" },
  { value: "admin", label: "Администрирование" },
  { value: "other", label: "Другое" },
];

export default function Tasks() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const { toast } = useToast();

  const currentUser = JSON.parse(localStorage.getItem('streamstudio_user') || '{}');

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

  const TaskCard = ({ task }: { task: Task }) => {
    const config = statusConfig[task.status as keyof typeof statusConfig];
    const priorityConf = priorityConfig[task.priority as keyof typeof priorityConfig];
    const isOverdue = task.dueDate && isPast(new Date(task.dueDate)) && task.status !== "done";
    const assigneeName = getUserName(task.assigneeId);

    return (
      <Card 
        className={`mb-3 hover:shadow-md transition-all cursor-pointer ${isOverdue ? 'border-red-300' : ''}`}
        data-testid={`task-card-${task.id}`}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <priorityConf.icon className={`w-4 h-4 ${priorityConf.color}`} />
              <span className="text-xs text-gray-500">{priorityConf.label}</span>
            </div>
            <div className="flex items-center gap-1">
              {task.category && (
                <Badge variant="outline" className="text-xs">
                  {categoryOptions.find(c => c.value === task.category)?.label || task.category}
                </Badge>
              )}
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setSelectedTask(task)}
                data-testid={`task-edit-${task.id}`}
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </div>
          </div>
          
          <h4 className="font-medium text-gray-900 mb-2 line-clamp-2">{task.title}</h4>
          
          {task.description && (
            <p className="text-sm text-gray-600 mb-3 line-clamp-2">{task.description}</p>
          )}
          
          <div className="flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-3">
              {task.dueDate && (
                <div className={`flex items-center gap-1 ${isOverdue ? 'text-red-500' : ''}`}>
                  <Calendar className="w-3 h-3" />
                  {format(new Date(task.dueDate), "d MMM", { locale: ru })}
                </div>
              )}
            </div>
            
            {assigneeName && (
              <div className="flex items-center gap-1">
                <Avatar className="w-5 h-5">
                  <AvatarImage src={getUserAvatar(task.assigneeId) || undefined} />
                  <AvatarFallback className="text-[8px]">
                    {assigneeName.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate max-w-[80px]">{assigneeName}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const KanbanColumn = ({ status, tasks: columnTasks }: { status: string; tasks: Task[] }) => {
    const config = statusConfig[status as keyof typeof statusConfig];
    const StatusIcon = config.icon;

    return (
      <div className={`flex-1 min-w-[280px] max-w-[350px] rounded-lg p-3 ${config.bg}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <StatusIcon className="w-4 h-4" />
            <span className="font-medium">{config.label}</span>
            <Badge variant="secondary" className="ml-1">{columnTasks.length}</Badge>
          </div>
        </div>
        
        <div className="space-y-2 min-h-[200px]">
          {columnTasks.map(task => (
            <TaskCard key={task.id} task={task} />
          ))}
          {columnTasks.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">
              Нет задач
            </div>
          )}
        </div>
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold text-gray-900">Таск-менеджер</h2>
        <div className="flex items-center gap-2">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "kanban" | "list")}>
            <TabsList>
              <TabsTrigger value="kanban">Канбан</TabsTrigger>
              <TabsTrigger value="list">Список</TabsTrigger>
            </TabsList>
          </Tabs>
          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-task">
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

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Поиск задач..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-tasks"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]" data-testid="filter-status">
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
              <SelectTrigger className="w-full sm:w-[180px]" data-testid="filter-priority">
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
        </CardContent>
      </Card>

      {/* Kanban Board */}
      {viewMode === "kanban" && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {["todo", "in_progress", "review", "done"].map(status => (
            <KanbanColumn 
              key={status} 
              status={status} 
              tasks={tasksByStatus[status as keyof typeof tasksByStatus]} 
            />
          ))}
        </div>
      )}

      {/* List View */}
      {viewMode === "list" && (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {filteredTasks.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
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
                      className="flex items-center justify-between p-4 hover:bg-gray-50"
                      data-testid={`task-row-${task.id}`}
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <priorityConf.icon className={`w-5 h-5 flex-shrink-0 ${priorityConf.color}`} />
                        <div className="min-w-0 flex-1">
                          <h4 className="font-medium text-gray-900 truncate">{task.title}</h4>
                          {task.description && (
                            <p className="text-sm text-gray-500 truncate">{task.description}</p>
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
                            <span className="text-sm text-gray-600 hidden md:inline">{assigneeName}</span>
                          </div>
                        )}
                        
                        {task.dueDate && (
                          <span className="text-sm text-gray-500 hidden lg:inline">
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
                  <p className="text-gray-600 mt-2">{selectedTask.description}</p>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-500">Статус</label>
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
                  <label className="text-sm text-gray-500">Приоритет</label>
                  <p className="font-medium">
                    {priorityConfig[selectedTask.priority as keyof typeof priorityConfig]?.label}
                  </p>
                </div>
                
                <div>
                  <label className="text-sm text-gray-500">Исполнитель</label>
                  <p className="font-medium">{getUserName(selectedTask.assigneeId) || "Не назначен"}</p>
                </div>
                
                <div>
                  <label className="text-sm text-gray-500">Дедлайн</label>
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
