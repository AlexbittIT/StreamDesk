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
import { 
  Users, Shield, Settings, Search, Edit, Trash2, 
  UserPlus, Key, Check, X, AlertCircle
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
  const { toast } = useToast();

  const currentUser = JSON.parse(localStorage.getItem('streamstudio_user') || '{}');

  const { data: users = [], isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: roles = [], isLoading: rolesLoading } = useQuery<Role[]>({
    queryKey: ["/api/roles"],
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
          <h2 className="text-2xl font-semibold text-gray-900">Администрирование</h2>
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
      </Tabs>

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
