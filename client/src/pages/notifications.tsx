import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, Trash2, AlertCircle, Info, CheckCircle, AlertTriangle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

type Notification = {
  id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  read: boolean;
  userId: string | null;
  createdAt: string;
};

function getCurrentUserId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("streamstudio_user");
    if (!raw) return null;
    const user = JSON.parse(raw);
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export default function Notifications() {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(() => getCurrentUserId());

  useEffect(() => {
    setUserId(getCurrentUserId());
  }, []);

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications", userId],
    queryFn: async () => {
      if (!userId) return [];
      const res = await fetch(`/api/notifications/${userId}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!userId,
  });

  const markAsReadMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("PUT", `/api/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications", userId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/notifications/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications", userId] });
      toast({
        title: "Успешно",
        description: "Уведомление удалено",
      });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/notifications/mark-all-read", { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications", userId] });
      toast({
        title: "Успешно",
        description: "Все уведомления отмечены как прочитанные",
      });
    },
  });

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "success":
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case "warning":
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      case "error":
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      default:
        return <Info className="w-5 h-5 text-blue-600" />;
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case "success":
        return "bg-green-50 border-green-200";
      case "warning":
        return "bg-yellow-50 border-yellow-200";
      case "error":
        return "bg-red-50 border-red-200";
      default:
        return "bg-blue-50 border-blue-200";
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "success":
        return "Успех";
      case "warning":
        return "Предупреждение";
      case "error":
        return "Ошибка";
      default:
        return "Информация";
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-gray-600">Управление уведомлениями и предупреждениями</p>
        </div>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-gray-600">
            Управление уведомлениями и предупреждениями 
            {unreadCount > 0 && (
              <Badge className="ml-2 bg-red-100 text-red-800 border-red-200">
                {unreadCount} непрочитанных
              </Badge>
            )}
          </p>
        </div>
        
        {unreadCount > 0 && (
          <Button 
            variant="outline"
            onClick={() => markAllAsReadMutation.mutate()}
            disabled={!userId || markAllAsReadMutation.isPending}
          >
            <Check className="w-4 h-4 mr-2" />
            Отметить все как прочитанные
          </Button>
        )}
      </div>

      <Card className="bg-muted/30 border-muted">
        <CardContent className="py-3 px-4 text-sm text-muted-foreground">
          <strong className="text-foreground">Уведомления как на телефоне:</strong> чтобы новые задачи и события приходили push-уведомлениями (даже когда вкладка закрыта), нужно разрешить уведомления в браузере при первом запросе. На мобильном устройстве для стабильной доставки рекомендуется установить приложение (PWA) через «Добавить на экран» / «Установить приложение».
        </CardContent>
      </Card>

      <div className="space-y-4">
        {notifications.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Bell className="w-12 h-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Нет уведомлений</h3>
              <p className="text-gray-600 text-center">
                Новые уведомления будут отображаться здесь
              </p>
            </CardContent>
          </Card>
        ) : (
          notifications.map((notification) => (
            <Card 
              key={notification.id} 
              className={`transition-all ${
                !notification.read 
                  ? `${getNotificationColor(notification.type)} border-l-4` 
                  : "bg-gray-50 border-gray-200"
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    {getNotificationIcon(notification.type)}
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <CardTitle className="text-base">{notification.title}</CardTitle>
                        <Badge variant="outline" className="text-xs">
                          {getTypeLabel(notification.type)}
                        </Badge>
                        {!notification.read && (
                          <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {formatDistanceToNow(new Date(notification.createdAt), { 
                          addSuffix: true,
                          locale: ru 
                        })}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-1">
                    {!notification.read && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => markAsReadMutation.mutate(notification.id)}
                        disabled={markAsReadMutation.isPending}
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(notification.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-gray-700">{notification.message}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}