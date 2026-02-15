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
import { 
  Plus, Search, HardDrive, Calendar,
  User, Edit, Trash2, Film, Clock, CheckCircle2,
  Columns, GripVertical, X, Settings2, MessageSquare, Link2, Github, ExternalLink, Save
} from "lucide-react";
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

export default function Projects() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [kanbanProject, setKanbanProject] = useState<any>(null);
  const [isKanbanOpen, setIsKanbanOpen] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const { toast } = useToast();

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["/api/projects"],
  });

  const { data: users = [] } = useQuery({
    queryKey: ["/api/users"],
  });

  const { data: computers = [] } = useQuery({
    queryKey: ["/api/computers"],
  });

  // Загрузка столбцов проекта
  const { data: projectColumns = [], refetch: refetchColumns } = useQuery<ProjectColumn[]>({
    queryKey: ["/api/projects", kanbanProject?.id, "columns"],
    queryFn: async () => {
      if (!kanbanProject?.id) return [];
      const response = await apiRequest("GET", `/api/projects/${kanbanProject.id}/columns`);
      return response.json();
    },
    enabled: !!kanbanProject?.id && isKanbanOpen,
  });

  // Загрузка задач проекта
  const { data: projectTasks = [], refetch: refetchTasks } = useQuery({
    queryKey: ["/api/tasks"],
    enabled: isKanbanOpen,
  });

  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [newTaskColumnId, setNewTaskColumnId] = useState<string | null>(null);
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  // Обработка перетаскивания столбцов и задач
  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination || !kanbanProject?.id) return;

    // Перетаскивание столбцов
    if (result.type === "COLUMN") {
      const items = Array.from(projectColumns);
      const [reorderedItem] = items.splice(result.source.index, 1);
      items.splice(result.destination.index, 0, reorderedItem);

      try {
        await apiRequest("POST", `/api/projects/${kanbanProject.id}/columns/reorder`, {
          columnIds: items.map(col => col.id),
        });
        refetchColumns();
      } catch (error: any) {
        toast({ title: "Ошибка", description: "Не удалось изменить порядок столбцов", variant: "destructive" });
      }
      return;
    }

    // Перетаскивание задач между столбцами
    if (result.type === "TASK") {
      const taskId = result.draggableId;
      const sourceColumnId = result.source.droppableId;
      const destColumnId = result.destination.droppableId;

      if (sourceColumnId === destColumnId) return; // Задача не переместилась

      try {
        await apiRequest("PUT", `/api/tasks/${taskId}`, {
          projectColumnId: destColumnId,
        });
        refetchTasks();
        toast({ title: "Задача перемещена" });
      } catch (error: any) {
        toast({ title: "Ошибка", description: "Не удалось переместить задачу", variant: "destructive" });
      }
    }
  };

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

  const filteredProjects = (projects as any[]).filter((item) => {
    const matchesSearch = item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.client?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;
    const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
    return matchesSearch && matchesStatus && matchesCategory;
  });

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
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button className="dark:neon-glow-purple" data-testid="button-add-project">
              <Plus className="w-4 h-4 mr-2" />
              Новый проект
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Создать проект</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Название проекта *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Рекламный ролик для..." data-testid="input-project-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="client"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Клиент</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Название клиента" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Описание</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Краткое описание проекта..." />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Категория</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Выберите категорию" />
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
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Статус</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.entries(statusConfig).map(([key, conf]) => (
                              <SelectItem key={key} value={key}>{conf.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="deadline"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Дедлайн</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
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
                        <FormLabel>Ответственный</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Выберите исполнителя" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(users as any[]).map(user => (
                              <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="storageLocation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Хранилище</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="D:\Projects\..." />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="estimatedSize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Примерный размер</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="500 GB" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Примечания</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Дополнительные заметки..." />
                      </FormControl>
                      <FormMessage />
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

      <Card className="dark:border-border/50">
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Поиск проектов..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-projects"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Статус" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                {Object.entries(statusConfig).map(([key, conf]) => (
                  <SelectItem key={key} value={key}>{conf.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Категория" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все категории</SelectItem>
                {categoryOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredProjects.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <Film className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Проекты не найдены</p>
            <p className="text-sm text-muted-foreground mt-1">Создайте первый видеопроект</p>
          </div>
        ) : (
          filteredProjects.map((project: any) => {
            const status = statusConfig[project.status as keyof typeof statusConfig] || statusConfig.planning;
            const category = categoryOptions.find(c => c.value === project.category);

            return (
              <Card 
                key={project.id} 
                className="dark:border-border/50 dark:hover:border-primary/50 transition-all hover:shadow-lg"
                data-testid={`project-card-${project.id}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                        <Film className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-lg line-clamp-1">{project.name}</CardTitle>
                        {project.client && (
                          <p className="text-sm text-muted-foreground">{project.client}</p>
                        )}
                      </div>
                    </div>
                    <Badge className={status.color}>{status.label}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Прогресс</span>
                      <span className="font-medium">{status.progress}%</span>
                    </div>
                    <Progress value={status.progress} className="h-2" />
                  </div>

                  {category && (
                    <div className="flex items-center gap-2 text-sm">
                      <Film className="w-4 h-4 text-muted-foreground" />
                      <span>{category.label}</span>
                    </div>
                  )}
                  
                  {project.deadline && (
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span>Дедлайн: {format(new Date(project.deadline), "d MMMM yyyy", { locale: ru })}</span>
                    </div>
                  )}

                  {project.assignedTo && (
                    <div className="flex items-center gap-2 text-sm">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span>{getUserName(project.assignedTo)}</span>
                    </div>
                  )}

                  {project.storageLocation && (
                    <div className="flex items-center gap-2 text-sm">
                      <HardDrive className="w-4 h-4 text-muted-foreground" />
                      <span className="font-mono text-xs truncate">{project.storageLocation}</span>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => {
                        setKanbanProject(project);
                        setIsKanbanOpen(true);
                      }}
                    >
                      <Columns className="w-4 h-4 mr-1" />
                      Kanban
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => setSelectedProject(project)}
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Изменить
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => deleteMutation.mutate(project.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Kanban Modal */}
      <Dialog open={isKanbanOpen} onOpenChange={setIsKanbanOpen}>
        <DialogContent className="max-w-[95vw] h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  {kanbanProject?.name || "Kanban"}
                </DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">Управление задачами проекта</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsKanbanOpen(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-x-auto p-6 bg-gradient-to-br from-slate-50 to-blue-50/30 dark:from-slate-900 dark:to-slate-800">
            {projectColumns.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full">
                <Columns className="w-16 h-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Нет столбцов</h3>
                <p className="text-muted-foreground mb-4">Создайте первый столбец для начала работы</p>
                <Button
                  onClick={() => setIsAddingColumn(true)}
                  className="bg-primary hover:bg-primary/90"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Создать столбец
                </Button>
              </div>
            ) : (
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="columns" direction="horizontal" type="COLUMN">
                {(provided) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className="flex gap-4 min-w-max h-full"
                  >
                    {/* Существующие столбцы */}
                    {projectColumns.map((column, index) => {
                      const columnTasks = (projectTasks as any[]).filter(
                        (task: any) => task.projectId === kanbanProject?.id && task.projectColumnId === column.id
                      );
                      return (
                        <Draggable key={column.id} draggableId={`column-${column.id}`} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={cn(
                                "flex-shrink-0 w-80 bg-white dark:bg-slate-800 rounded-xl shadow-lg border-2 flex flex-col transition-all",
                                snapshot.isDragging
                                  ? "border-blue-500 shadow-2xl rotate-2"
                                  : "border-slate-200 dark:border-slate-700"
                              )}
                            >
                              <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                                <div className="flex items-center gap-2 flex-1">
                                  <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing">
                                    <GripVertical className="w-5 h-5 text-muted-foreground hover:text-blue-500 transition-colors" />
                                  </div>
                                  <h3 className="font-semibold text-lg">{column.name}</h3>
                                  <Badge variant="secondary" className="ml-2">
                                    {columnTasks.length}
                                  </Badge>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={async () => {
                                    try {
                                      await apiRequest("DELETE", `/api/projects/${kanbanProject.id}/columns/${column.id}`);
                                      refetchColumns();
                                      toast({ title: "Столбец удалён" });
                                    } catch (error: any) {
                                      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
                                    }
                                  }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                              <Droppable droppableId={column.id} type="TASK">
                                {(provided, snapshot) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.droppableProps}
                                    className={cn(
                                      "flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]",
                                      snapshot.isDraggingOver && "bg-blue-50/50 dark:bg-blue-950/20"
                                    )}
                                  >
                                    {columnTasks.map((task: any, taskIndex: number) => (
                                      <Draggable key={task.id} draggableId={task.id} index={taskIndex}>
                                        {(provided, snapshot) => (
                                          <Card
                                            ref={provided.innerRef}
                                            {...provided.draggableProps}
                                            {...provided.dragHandleProps}
                                            className={cn(
                                              "p-3 hover:shadow-md transition-all cursor-grab active:cursor-grabbing",
                                              snapshot.isDragging && "shadow-xl rotate-1"
                                            )}
                                            onClick={() => {
                                              setSelectedTask(task);
                                              setIsTaskDialogOpen(true);
                                            }}
                                          >
                                            <CardContent className="p-0">
                                              <h4 className="font-medium mb-2">{task.title}</h4>
                                              {task.description && (
                                                <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{task.description}</p>
                                              )}
                                              <div className="flex items-center justify-between mt-2">
                                                {task.assigneeId && (
                                                  <div className="flex items-center gap-1.5">
                                                    <Avatar className="w-5 h-5">
                                                      <AvatarImage src={(users as any[]).find(u => u.id === task.assigneeId)?.avatar} />
                                                      <AvatarFallback className="text-[9px]">
                                                        {getUserName(task.assigneeId)?.split(' ').map((n: string) => n[0]).join('')}
                                                      </AvatarFallback>
                                                    </Avatar>
                                                    <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                                                      {getUserName(task.assigneeId)}
                                                    </span>
                                                  </div>
                                                )}
                                                <div className="flex items-center gap-1">
                                                  {task.repository && (
                                                    <Github className="w-3.5 h-3.5 text-muted-foreground" />
                                                  )}
                                                  {task.links && Array.isArray(task.links) && task.links.length > 0 && (
                                                    <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
                                                  )}
                                                  {task.comments && task.comments.length > 0 && (
                                                    <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                                                  )}
                                                </div>
                                              </div>
                                            </CardContent>
                                          </Card>
                                        )}
                                      </Draggable>
                                    ))}
                                    {provided.placeholder}
                                    {columnTasks.length === 0 && !snapshot.isDraggingOver && (
                                      <div className="text-center py-8 text-muted-foreground text-sm">
                                        Нет задач
                                      </div>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="w-full mt-2 border-dashed"
                                      onClick={() => {
                                        setNewTaskColumnId(column.id);
                                        setIsCreatingTask(true);
                                      }}
                                    >
                                      <Plus className="w-4 h-4 mr-2" />
                                      Добавить задачу
                                    </Button>
                                  </div>
                                )}
                              </Droppable>
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}

              {/* Кнопка добавления столбца */}
              {isAddingColumn ? (
                <div className="flex-shrink-0 w-80 bg-white dark:bg-slate-800 rounded-xl shadow-lg border-2 border-dashed border-slate-300 dark:border-slate-600 p-4">
                  <Input
                    placeholder="Название столбца"
                    value={newColumnName}
                    onChange={(e) => setNewColumnName(e.target.value)}
                    onKeyPress={async (e) => {
                      if (e.key === "Enter" && newColumnName.trim()) {
                        try {
                          await apiRequest("POST", `/api/projects/${kanbanProject.id}/columns`, {
                            name: newColumnName.trim(),
                          });
                          setNewColumnName("");
                          setIsAddingColumn(false);
                          refetchColumns();
                          toast({ title: "Столбец создан" });
                        } catch (error: any) {
                          toast({ title: "Ошибка", description: error.message, variant: "destructive" });
                        }
                      }
                      if (e.key === "Escape") {
                        setIsAddingColumn(false);
                        setNewColumnName("");
                      }
                    }}
                    autoFocus
                    className="mb-2"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={async () => {
                        if (newColumnName.trim()) {
                          try {
                            await apiRequest("POST", `/api/projects/${kanbanProject.id}/columns`, {
                              name: newColumnName.trim(),
                            });
                            setNewColumnName("");
                            setIsAddingColumn(false);
                            refetchColumns();
                            toast({ title: "Столбец создан" });
                          } catch (error: any) {
                            toast({ title: "Ошибка", description: error.message, variant: "destructive" });
                          }
                        }
                      }}
                    >
                      Создать
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setIsAddingColumn(false);
                        setNewColumnName("");
                      }}
                    >
                      Отмена
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setIsAddingColumn(true)}
                  className="flex-shrink-0 w-80 h-32 bg-white dark:bg-slate-800 rounded-xl shadow-lg border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-all group"
                >
                  <div className="text-center">
                    <Plus className="w-8 h-8 mx-auto mb-2 text-muted-foreground group-hover:text-blue-500" />
                    <p className="text-sm font-medium text-muted-foreground group-hover:text-blue-500">
                      Добавить столбец
                    </p>
                  </div>
                </button>
              )}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Диалог создания/редактирования задачи */}
      <Dialog open={isTaskDialogOpen || isCreatingTask} onOpenChange={(open) => {
        setIsTaskDialogOpen(open);
        setIsCreatingTask(open);
        if (!open) {
          setSelectedTask(null);
          setNewTaskColumnId(null);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedTask ? "Редактировать задачу" : "Создать задачу"}</DialogTitle>
          </DialogHeader>
          <TaskForm
            task={selectedTask}
            projectId={kanbanProject?.id}
            columnId={newTaskColumnId || selectedTask?.projectColumnId}
            users={users as any[]}
            onSuccess={() => {
              setIsTaskDialogOpen(false);
              setIsCreatingTask(false);
              setSelectedTask(null);
              setNewTaskColumnId(null);
              refetchTasks();
            }}
            onCancel={() => {
              setIsTaskDialogOpen(false);
              setIsCreatingTask(false);
              setSelectedTask(null);
              setNewTaskColumnId(null);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Компонент формы задачи
function TaskForm({ task, projectId, columnId, users, onSuccess, onCancel }: {
  task?: any;
  projectId?: string;
  columnId?: string | null;
  users: any[];
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(task?.title || "");
  const [description, setDescription] = useState(task?.description || "");
  const [assigneeId, setAssigneeId] = useState(task?.assigneeId || "");
  const [repository, setRepository] = useState(task?.repository || "");
  const [links, setLinks] = useState<Array<{ title: string; url: string }>>(
    task?.links && Array.isArray(task.links) ? task.links : []
  );
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [comments, setComments] = useState<Array<{ id: string; content: string; userId: string; createdAt: string }>>([]);
  const [newComment, setNewComment] = useState("");
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // Загрузка комментариев
  const { data: commentsData } = useQuery({
    queryKey: ["/api/tasks", task?.id, "comments"],
    queryFn: async () => {
      if (!task?.id) return [];
      const response = await apiRequest("GET", `/api/tasks/${task.id}/comments`);
      return response.json();
    },
    enabled: !!task?.id,
  });

  useEffect(() => {
    if (commentsData) {
      setComments(commentsData || []);
    }
  }, [commentsData]);

      const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: "Ошибка", description: "Название задачи обязательно", variant: "destructive" });
      return;
    }

    if (!task && !columnId) {
      toast({ title: "Ошибка", description: "Выберите столбец для задачи", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      const currentUser = JSON.parse(localStorage.getItem('streamstudio_user') || '{}');
      
      if (task) {
        // Обновление задачи
        await apiRequest("PUT", `/api/tasks/${task.id}`, {
          title,
          description,
          assigneeId: assigneeId || null,
          repository: repository || null,
          links,
          projectId,
          projectColumnId: columnId || task.projectColumnId,
        });
        toast({ title: "Задача обновлена" });
      } else {
        // Создание задачи
        await apiRequest("POST", "/api/tasks", {
          title,
          description,
          assigneeId: assigneeId || null,
          repository: repository || null,
          links,
          projectId,
          projectColumnId: columnId,
          creatorId: currentUser.id,
          status: "todo",
          priority: "medium",
        });
        toast({ title: "Задача создана" });
      }
      onSuccess();
    } catch (error: any) {
      toast({ title: "Ошибка", description: error.message || "Не удалось сохранить задачу", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !task?.id) return;
    
    const currentUser = JSON.parse(localStorage.getItem('streamstudio_user') || '{}');
    try {
      await apiRequest("POST", `/api/tasks/${task.id}/comments`, {
        content: newComment.trim(),
        userId: currentUser.id,
      });
      setNewComment("");
      // Обновляем комментарии через queryClient
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", task.id, "comments"] });
      toast({ title: "Комментарий добавлен" });
    } catch (error: any) {
      toast({ title: "Ошибка", description: "Не удалось добавить комментарий", variant: "destructive" });
    }
  };

  const handleAddLink = () => {
    if (!newLinkTitle.trim() || !newLinkUrl.trim()) return;
    setLinks([...links, { title: newLinkTitle.trim(), url: newLinkUrl.trim() }]);
    setNewLinkTitle("");
    setNewLinkUrl("");
  };

  const handleRemoveLink = (index: number) => {
    setLinks(links.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium mb-2 block">Название *</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Название задачи"
        />
      </div>

      <div>
        <label className="text-sm font-medium mb-2 block">Описание</label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Описание задачи"
          rows={3}
        />
      </div>

      <div>
        <label className="text-sm font-medium mb-2 block">Исполнитель</label>
        <Select value={assigneeId} onValueChange={setAssigneeId}>
          <SelectTrigger>
            <SelectValue placeholder="Выберите исполнителя" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Не назначен</SelectItem>
            {users.map(user => (
              <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-sm font-medium mb-2 block">Репозиторий</label>
        <Input
          value={repository}
          onChange={(e) => setRepository(e.target.value)}
          placeholder="https://github.com/user/repo"
        />
      </div>

      <div>
        <label className="text-sm font-medium mb-2 block">Ссылки</label>
        <div className="space-y-2">
          {links.map((link, index) => (
            <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded">
              <ExternalLink className="w-4 h-4 text-muted-foreground" />
              <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex-1 text-sm hover:underline">
                {link.title}
              </a>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => handleRemoveLink(index)}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input
              placeholder="Название ссылки"
              value={newLinkTitle}
              onChange={(e) => setNewLinkTitle(e.target.value)}
              className="flex-1"
            />
            <Input
              placeholder="URL"
              value={newLinkUrl}
              onChange={(e) => setNewLinkUrl(e.target.value)}
              className="flex-1"
            />
            <Button size="icon" onClick={handleAddLink} disabled={!newLinkTitle.trim() || !newLinkUrl.trim()}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {task && (
        <div>
          <label className="text-sm font-medium mb-2 block">Комментарии</label>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {comments.map((comment) => {
              const user = users.find(u => u.id === comment.userId);
              return (
                <div key={comment.id} className="p-2 bg-muted rounded text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{user?.name || "Неизвестный"}</span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(comment.createdAt), "d MMM yyyy, HH:mm", { locale: ru })}
                    </span>
                  </div>
                  <p className="text-muted-foreground">{comment.content}</p>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 mt-2">
            <Textarea
              placeholder="Добавить комментарий..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              rows={2}
              className="flex-1"
            />
            <Button onClick={handleAddComment} disabled={!newComment.trim()}>
              <MessageSquare className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4">
        <Button variant="outline" onClick={onCancel}>Отмена</Button>
        <Button onClick={handleSave} disabled={isLoading || !title.trim()}>
          {isLoading ? "Сохранение..." : task ? "Сохранить" : "Создать"}
        </Button>
      </div>
    </div>
  );
}
