import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link2, ChevronRight, Loader2, AlertCircle, FolderKanban, LayoutGrid, ListTodo } from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface YouGileProject {
  id: string;
  title?: string;
}

interface YouGileBoard {
  id: string;
  title?: string;
  projectId?: string;
}

interface YouGileColumn {
  id: string;
  title?: string;
  boardId?: string;
}

interface YouGileTask {
  id?: string;
  title?: string;
  description?: string;
  columnId?: string;
  boardId?: string;
  projectId?: string;
  deadline?: string;
  status?: string;
}

export default function TasksYouGile() {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["/api/yougile/status"],
    retry: false,
  });

  const { data: projects = [], isLoading: projectsLoading } = useQuery<YouGileProject[]>({
    queryKey: ["/api/yougile/projects"],
    enabled: status?.configured === true,
    retry: false,
  });

  const { data: boards = [], isLoading: boardsLoading } = useQuery<YouGileBoard[]>({
    queryKey: ["/api/yougile/boards", selectedProjectId],
    enabled: status?.configured === true && !!selectedProjectId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/yougile/boards?projectId=${selectedProjectId}`);
      return res.json();
    },
    retry: false,
  });

  const { data: columns = [], isLoading: columnsLoading } = useQuery<YouGileColumn[]>({
    queryKey: ["/api/yougile/columns", selectedBoardId],
    enabled: status?.configured === true && !!selectedBoardId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/yougile/columns?boardId=${selectedBoardId}`);
      return res.json();
    },
    retry: false,
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<YouGileTask[]>({
    queryKey: ["/api/yougile/tasks", selectedProjectId, selectedBoardId],
    enabled: status?.configured === true && (!!selectedProjectId || !!selectedBoardId),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedProjectId) params.set("projectId", selectedProjectId);
      if (selectedBoardId) params.set("boardId", selectedBoardId);
      const res = await apiRequest("GET", `/api/yougile/tasks?${params.toString()}`);
      return res.json();
    },
    retry: false,
  });

  if (statusLoading || status?.configured !== true) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-amber-500" />
            <h2 className="text-xl font-semibold mb-2">YouGile не подключён</h2>
            <p className="text-muted-foreground mb-4">
              Администратор должен задать <code className="bg-muted px-1 rounded">YOUGILE_API_KEY</code> в <code className="bg-muted px-1 rounded">.env</code> и перезапустить сервер.
            </p>
            <Link href="/settings">
              <Button variant="outline">Настройки → Интеграции</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const loading = projectsLoading || boardsLoading || columnsLoading || tasksLoading;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Link2 className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Задачи YouGile</h1>
        </div>
        <Link href="/tasks">
          <Button variant="outline" size="sm">Локальные задачи</Button>
        </Link>
      </div>

      <p className="text-sm text-muted-foreground">
        Просмотр проектов, досок и задач из YouGile. Создание и редактирование — через API или в интерфейсе YouGile.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FolderKanban className="w-4 h-4" />
              Проекты
            </CardTitle>
          </CardHeader>
          <CardContent>
            {projectsLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            ) : projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">Нет проектов</p>
            ) : (
              <ul className="space-y-1">
                {projects.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProjectId(p.id);
                        setSelectedBoardId(null);
                      }}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                        selectedProjectId === p.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                      )}
                    >
                      {p.title || p.id}
                      <ChevronRight className="inline w-4 h-4 ml-1 opacity-70" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <LayoutGrid className="w-4 h-4" />
              Доски
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedProjectId ? (
              <p className="text-sm text-muted-foreground">Выберите проект</p>
            ) : boardsLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            ) : boards.length === 0 ? (
              <p className="text-sm text-muted-foreground">Нет досок</p>
            ) : (
              <ul className="space-y-1">
                {boards.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedBoardId(b.id)}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                        selectedBoardId === b.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                      )}
                    >
                      {b.title || b.id}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ListTodo className="w-4 h-4" />
              Задачи
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading && !tasks.length ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            ) : tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Нет задач или выберите проект/доску</p>
            ) : (
              <ul className="space-y-2 max-h-[400px] overflow-y-auto">
                {tasks.slice(0, 50).map((t) => (
                  <li key={t.id || t.title} className="p-2 rounded-lg border border-border bg-card">
                    <p className="font-medium text-sm truncate">{t.title || "—"}</p>
                    {t.deadline && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Дедлайн: {new Date(t.deadline).toLocaleDateString("ru-RU")}
                      </p>
                    )}
                    {t.status && (
                      <Badge variant="secondary" className="mt-1 text-xs">{t.status}</Badge>
                    )}
                  </li>
                ))}
                {tasks.length > 50 && (
                  <li className="text-xs text-muted-foreground">Показаны первые 50 из {tasks.length}</li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {columns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Колонки выбранной доски</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {columns.map((c) => (
                <Badge key={c.id} variant="outline">{c.title || c.id}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
