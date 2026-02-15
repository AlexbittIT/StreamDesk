import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Users, Shield, Settings, Search, Edit, Trash2, 
  UserPlus, Key, Check, X, AlertCircle, Github, Plus, History, Clock, FileText
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { User, Role } from "@shared/schema";
import { PERMISSIONS } from "@shared/schema";

const permissionGroups = {
  tasks: {
    label: "Задачи",
    permissions: [
      { key: PERMISSIONS.TASKS_VIEW, label: "Просмотр задач" },
      { key: PERMISSIONS.TASKS_CREATE, label: "Создание задач" },
      { key: PERMISSIONS.TASKS_EDIT, label: "Редактирование задач" },
      { key: PERMISSIONS.TASKS_DELETE, label: "Удаление задач" },
      { key: PERMISSIONS.TASKS_ASSIGN, label: "Назначение задач" },
    ]
  },
  equipment: {
    label: "Оборудование",
    permissions: [
      { key: PERMISSIONS.EQUIPMENT_VIEW, label: "Просмотр оборудования" },
      { key: PERMISSIONS.EQUIPMENT_CREATE, label: "Добавление оборудования" },
      { key: PERMISSIONS.EQUIPMENT_EDIT, label: "Редактирование оборудования" },
      { key: PERMISSIONS.EQUIPMENT_DELETE, label: "Удаление оборудования" },
      { key: PERMISSIONS.EQUIPMENT_RESERVE, label: "Бронирование оборудования" },
    ]
  },
  events: {
    label: "События",
    permissions: [
      { key: PERMISSIONS.EVENTS_VIEW, label: "Просмотр событий" },
      { key: PERMISSIONS.EVENTS_CREATE, label: "Создание событий" },
      { key: PERMISSIONS.EVENTS_EDIT, label: "Редактирование событий" },
      { key: PERMISSIONS.EVENTS_DELETE, label: "Удаление событий" },
    ]
  },
  streams: {
    label: "Стримы",
    permissions: [
      { key: PERMISSIONS.STREAMS_VIEW, label: "Просмотр стримов" },
      { key: PERMISSIONS.STREAMS_MANAGE, label: "Управление стримами" },
    ]
  },
  systems: {
    label: "Системы",
    permissions: [
      { key: PERMISSIONS.SYSTEMS_VIEW, label: "Просмотр систем" },
      { key: PERMISSIONS.SYSTEMS_MANAGE, label: "Управление системами" },
    ]
  },
  admin: {
    label: "Администрирование",
    permissions: [
      { key: PERMISSIONS.USERS_VIEW, label: "Просмотр пользователей" },
      { key: PERMISSIONS.USERS_MANAGE, label: "Управление пользователями" },
      { key: PERMISSIONS.ROLES_MANAGE, label: "Управление ролями" },
      { key: PERMISSIONS.ADMIN_PANEL, label: "Админ-панель" },
      { key: PERMISSIONS.SETTINGS_MANAGE, label: "Настройки системы" },
    ]
  },
};

export default function Admin() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isPermissionsOpen, setIsPermissionsOpen] = useState(false);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [userRole, setUserRole] = useState<string>("");
  const [isRepositoryDialogOpen, setIsRepositoryDialogOpen] = useState(false);
  const [editingRepository, setEditingRepository] = useState<any>(null);
  const [repositoryName, setRepositoryName] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [repositoryType, setRepositoryType] = useState("github");
  const [repositoryDescription, setRepositoryDescription] = useState("");
  const { toast } = useToast();

  const currentUser = JSON.parse(localStorage.getItem('streamstudio_user') || '{}');

  const { data: users = [], isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: roles = [], isLoading: rolesLoading } = useQuery<Role[]>({
    queryKey: ["/api/roles"],
  });

  const { data: repositories = [], refetch: refetchRepositories } = useQuery<any[]>({
    queryKey: ["/api/repositories"],
  });

  const updatePermissionsMutation = useMutation({
    mutationFn: async ({ userId, role, permissions }: { userId: string; role: string; permissions: string[] }) => {
      const response = await apiRequest("PUT", `/api/users/${userId}/permissions`, { role, permissions });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Успешно", description: "Права доступа обновлены" });
      setIsPermissionsOpen(false);
    },
    onError: () => {
      toast({ title: "Ошибка", description: "Не удалось обновить права", variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => apiRequest("DELETE", `/api/users/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Успешно", description: "Пользователь деактивирован" });
    },
  });

  const activateUserMutation = useMutation({
    mutationFn: (userId: string) => apiRequest("PUT", `/api/users/${userId}`, { active: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Успешно", description: "Пользователь активирован" });
    },
    onError: () => {
      toast({ title: "Ошибка", description: "Не удалось активировать пользователя", variant: "destructive" });
    },
  });

  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRoleColor = (role: string) => {
    switch (role) {
      case "admin": return "bg-red-100 text-red-800";
      case "manager": return "bg-purple-100 text-purple-800";
      case "employee": return "bg-blue-100 text-blue-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getRoleLabel = (role: string) => {
    const roleObj = roles.find(r => r.name === role);
    return roleObj?.displayName || role;
  };

  const handleEditPermissions = (user: User) => {
    setSelectedUser(user);
    setUserPermissions((user.permissions as string[]) || []);
    setUserRole(user.role);
    setIsPermissionsOpen(true);
  };

  const handlePermissionToggle = (permission: string) => {
    setUserPermissions(prev => 
      prev.includes(permission)
        ? prev.filter(p => p !== permission)
        : [...prev, permission]
    );
  };

  const handleRoleChange = (newRole: string) => {
    setUserRole(newRole);
    const role = roles.find(r => r.name === newRole);
    if (role) {
      setUserPermissions(role.permissions as string[]);
    }
  };

  const handleSavePermissions = () => {
    if (selectedUser) {
      updatePermissionsMutation.mutate({
        userId: selectedUser.id,
        role: userRole,
        permissions: userPermissions
      });
    }
  };

  if (currentUser.role !== "admin") {
    return (
      <div className="flex items-center justify-center h-64">
        <Card className="max-w-md">
          <CardContent className="py-8 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
            <h3 className="text-lg font-semibold mb-2">Доступ запрещён</h3>
            <p className="text-gray-600">
              У вас нет прав для просмотра этой страницы.
              Обратитесь к администратору.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="text-gray-500 mt-1">Управление пользователями и правами доступа</p>
        </div>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Пользователи
          </TabsTrigger>
          <TabsTrigger value="roles" className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Роли
          </TabsTrigger>
          <TabsTrigger value="repositories" className="flex items-center gap-2">
            <Github className="w-4 h-4" />
            Репозитории
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Логи сотрудников
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-6">
          {/* Search */}
          <Card className="mb-6">
            <CardContent className="py-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Поиск пользователей..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-users"
                />
              </div>
            </CardContent>
          </Card>

          {/* Users List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Пользователи ({filteredUsers.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {usersLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : (
                <div className="divide-y">
                  {filteredUsers.map(user => (
                    <div 
                      key={user.id} 
                      className="flex items-center justify-between p-4 hover:bg-gray-50"
                      data-testid={`user-row-${user.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={user.avatar || undefined} />
                          <AvatarFallback>
                            {user.name.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{user.name}</span>
                            <Badge className={getRoleColor(user.role)}>
                              {getRoleLabel(user.role)}
                            </Badge>
                            {user.active === false && (
                              <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-800 border-yellow-300">
                                Ожидает подтверждения
                              </Badge>
                            )}
                            {user.telegramId && (
                              <Badge variant="outline" className="text-xs">
                                Telegram
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-gray-500">
                            @{user.username}
                            {user.email && ` • ${user.email}`}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {user.active === false && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => activateUserMutation.mutate(user.id)}
                            className="bg-green-600 hover:bg-green-700 text-white"
                            data-testid={`button-activate-${user.id}`}
                          >
                            <Check className="w-4 h-4 mr-1" />
                            Подтвердить
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditPermissions(user)}
                          data-testid={`button-edit-permissions-${user.id}`}
                        >
                          <Key className="w-4 h-4 mr-1" />
                          Права
                        </Button>
                        {user.id !== currentUser.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteUserMutation.mutate(user.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}

                  {filteredUsers.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                      Пользователи не найдены
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {rolesLoading ? (
              <div className="col-span-full flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              roles.map(role => (
                <Card key={role.id} className="relative" data-testid={`role-card-${role.id}`}>
                  {role.isSystem && (
                    <Badge className="absolute top-2 right-2 text-xs" variant="secondary">
                      Системная
                    </Badge>
                  )}
                  <CardHeader>
                    <div 
                      className="w-3 h-3 rounded-full mb-2"
                      style={{ backgroundColor: role.color || "#6B7280" }}
                    />
                    <CardTitle>{role.displayName}</CardTitle>
                    <CardDescription>{role.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-gray-500 mb-2">
                      {(role.permissions as string[])?.length || 0} разрешений
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(role.permissions as string[])?.slice(0, 5).map(perm => (
                        <Badge key={perm} variant="outline" className="text-xs">
                          {perm.split(':')[1]}
                        </Badge>
                      ))}
                      {((role.permissions as string[])?.length || 0) > 5 && (
                        <Badge variant="outline" className="text-xs">
                          +{(role.permissions as string[]).length - 5}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="repositories" className="mt-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold">Управление репозиториями</h3>
              <p className="text-sm text-gray-500 mt-1">Добавляйте и редактируйте репозитории для задач</p>
            </div>
            <Button
              onClick={() => {
                setEditingRepository(null);
                setRepositoryName("");
                setRepositoryUrl("");
                setRepositoryType("github");
                setRepositoryDescription("");
                setIsRepositoryDialogOpen(true);
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Добавить репозиторий
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {repositories.map(repo => (
              <Card key={repo.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Github className="w-5 h-5" />
                      <CardTitle className="text-base">{repo.name}</CardTitle>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          setEditingRepository(repo);
                          setRepositoryName(repo.name);
                          setRepositoryUrl(repo.url);
                          setRepositoryType(repo.type || "github");
                          setRepositoryDescription(repo.description || "");
                          setIsRepositoryDialogOpen(true);
                        }}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-700"
                        onClick={async () => {
                          if (confirm(`Удалить репозиторий "${repo.name}"?`)) {
                            try {
                              await apiRequest("DELETE", `/api/repositories/${repo.id}`);
                              refetchRepositories();
                              toast({ title: "Успешно", description: "Репозиторий удален" });
                            } catch (error) {
                              toast({ title: "Ошибка", description: "Не удалось удалить репозиторий", variant: "destructive" });
                            }
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  {repo.description && (
                    <CardDescription>{repo.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="outline">{repo.type || "github"}</Badge>
                    </div>
                    <a
                      href={repo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline flex items-center gap-1"
                    >
                      {repo.url}
                      <X className="w-3 h-3 rotate-45" />
                    </a>
                  </div>
                </CardContent>
              </Card>
            ))}
            {repositories.length === 0 && (
              <div className="col-span-full text-center py-12 text-gray-500">
                Нет репозиториев. Добавьте первый репозиторий.
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="logs" className="mt-6">
          <UserLogsTab />
        </TabsContent>
      </Tabs>

      {/* Repository Dialog */}
      <Dialog open={isRepositoryDialogOpen} onOpenChange={setIsRepositoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingRepository ? "Редактировать репозиторий" : "Добавить репозиторий"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Название *</Label>
              <Input
                value={repositoryName}
                onChange={(e) => setRepositoryName(e.target.value)}
                placeholder="Например: StreamDesk Frontend"
              />
            </div>
            <div>
              <Label>URL *</Label>
              <Input
                value={repositoryUrl}
                onChange={(e) => setRepositoryUrl(e.target.value)}
                placeholder="https://github.com/user/repo"
              />
            </div>
            <div>
              <Label>Тип</Label>
              <Select value={repositoryType} onValueChange={setRepositoryType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="github">GitHub</SelectItem>
                  <SelectItem value="gitlab">GitLab</SelectItem>
                  <SelectItem value="bitbucket">Bitbucket</SelectItem>
                  <SelectItem value="other">Другое</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Описание</Label>
              <Textarea
                value={repositoryDescription}
                onChange={(e) => setRepositoryDescription(e.target.value)}
                placeholder="Краткое описание репозитория"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsRepositoryDialogOpen(false)}>
                Отмена
              </Button>
              <Button
                onClick={async () => {
                  if (!repositoryName.trim() || !repositoryUrl.trim()) {
                    toast({ title: "Ошибка", description: "Заполните название и URL", variant: "destructive" });
                    return;
                  }
                  try {
                    if (editingRepository) {
                      await apiRequest("PUT", `/api/repositories/${editingRepository.id}`, {
                        name: repositoryName,
                        url: repositoryUrl,
                        type: repositoryType,
                        description: repositoryDescription,
                      });
                      toast({ title: "Успешно", description: "Репозиторий обновлен" });
                    } else {
                      await apiRequest("POST", "/api/repositories", {
                        name: repositoryName,
                        url: repositoryUrl,
                        type: repositoryType,
                        description: repositoryDescription,
                      });
                      toast({ title: "Успешно", description: "Репозиторий добавлен" });
                    }
                    refetchRepositories();
                    setIsRepositoryDialogOpen(false);
                  } catch (error) {
                    toast({ title: "Ошибка", description: "Не удалось сохранить репозиторий", variant: "destructive" });
                  }
                }}
              >
                {editingRepository ? "Сохранить" : "Добавить"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Permissions Dialog */}
      <Dialog open={isPermissionsOpen} onOpenChange={setIsPermissionsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              Настройка прав доступа
            </DialogTitle>
          </DialogHeader>
          
          {selectedUser && (
            <div className="space-y-6">
              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                <Avatar className="w-12 h-12">
                  <AvatarImage src={selectedUser.avatar || undefined} />
                  <AvatarFallback>
                    {selectedUser.name.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium">{selectedUser.name}</div>
                  <div className="text-sm text-gray-500">@{selectedUser.username}</div>
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Роль</Label>
                <Select value={userRole} onValueChange={handleRoleChange}>
                  <SelectTrigger data-testid="select-user-role">
                    <SelectValue placeholder="Выберите роль" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map(role => (
                      <SelectItem key={role.id} value={role.name}>
                        {role.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4">
                <Label>Права доступа</Label>
                {Object.entries(permissionGroups).map(([group, config]) => (
                  <Card key={group}>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm font-medium">{config.label}</CardTitle>
                    </CardHeader>
                    <CardContent className="py-2">
                      <div className="space-y-2">
                        {config.permissions.map(perm => (
                          <div key={perm.key} className="flex items-center gap-2">
                            <Checkbox
                              id={perm.key}
                              checked={userPermissions.includes(perm.key)}
                              onCheckedChange={() => handlePermissionToggle(perm.key)}
                            />
                            <label 
                              htmlFor={perm.key}
                              className="text-sm cursor-pointer"
                            >
                              {perm.label}
                            </label>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsPermissionsOpen(false)}>
                  Отмена
                </Button>
                <Button 
                  onClick={handleSavePermissions}
                  disabled={updatePermissionsMutation.isPending}
                  data-testid="button-save-permissions"
                >
                  {updatePermissionsMutation.isPending ? "Сохранение..." : "Сохранить"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Компонент для просмотра логов сотрудников
function UserLogsTab() {
  const [selectedUserId, setSelectedUserId] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const { toast } = useToast();

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: logs = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/user-logs", selectedUserId, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedUserId !== "all") params.append("userId", selectedUserId);
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);
      
      const response = await apiRequest("GET", `/api/admin/user-logs?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch logs");
      return response.json();
    },
    enabled: true,
  });

  const getUserName = (userId: string | null) => {
    if (!userId) return "Неизвестно";
    const user = users.find(u => u.id === userId);
    return user?.name || user?.username || "Неизвестно";
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString("ru-RU", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      created: "Создано",
      updated: "Обновлено",
      status_changed: "Изменен статус",
      assigned: "Назначено",
      commented: "Комментарий",
      deleted: "Удалено",
    };
    return labels[action] || action;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Логи активности сотрудников</CardTitle>
          <CardDescription>
            Просмотр истории действий пользователей в системе
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Пользователь</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Все пользователи" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все пользователи</SelectItem>
                  {users.map(user => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name || user.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Начало периода</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Конец периода</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            История действий ({logs.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Загрузка...</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">Нет записей</div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-4 p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                    {log.type === "task_history" ? (
                      <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    ) : (
                      <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">{getUserName(log.userId)}</span>
                      <Badge variant="outline">{getActionLabel(log.action)}</Badge>
                      <span className="text-sm text-gray-500">{formatDate(log.timestamp)}</span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{log.description}</p>
                    {log.data?.taskId && (
                      <p className="text-xs text-gray-500 mt-1">ID задачи: {log.data.taskId}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
