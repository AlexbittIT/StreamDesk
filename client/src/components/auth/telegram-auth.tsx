import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MessageCircle, Check, X, User, Phone } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface TelegramUser {
  id: number;
  userId: number | null;
  telegramId: string;
  username: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  verified: boolean;
  createdAt: string;
}

interface TelegramAuthProps {
  onSuccess?: (telegramUser: TelegramUser) => void;
}

export function TelegramAuth({ onSuccess }: TelegramAuthProps) {
  const [telegramId, setTelegramId] = useState("");
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const { toast } = useToast();

  const { data: telegramUsers = [] } = useQuery<TelegramUser[]>({
    queryKey: ["/api/telegram-users"]
  });

  const connectMutation = useMutation({
    mutationFn: async (data: {
      telegramId: string;
      username: string;
      firstName: string;
      lastName?: string;
      phone?: string;
    }) => {
      const response = await apiRequest("POST", "/api/telegram-users", data);
      return response.json();
    },
    onSuccess: (telegramUser) => {
      queryClient.invalidateQueries({ queryKey: ["/api/telegram-users"] });
      toast({
        title: "Успешно",
        description: "Telegram аккаунт подключен",
      });
      onSuccess?.(telegramUser);
      // Очистить форму
      setTelegramId("");
      setUsername("");
      setFirstName("");
      setLastName("");
      setPhone("");
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось подключить Telegram аккаунт",
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/telegram-users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/telegram-users"] });
      toast({
        title: "Успешно",
        description: "Telegram аккаунт отключен",
      });
    },
  });

  const handleConnect = () => {
    if (!telegramId || !username || !firstName) {
      toast({
        title: "Ошибка",
        description: "Заполните обязательные поля",
        variant: "destructive",
      });
      return;
    }

    connectMutation.mutate({
      telegramId,
      username,
      firstName,
      lastName: lastName || undefined,
      phone: phone || undefined,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <MessageCircle className="w-5 h-5 mr-2 text-blue-500" />
          Интеграция с Telegram
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Подключенные аккаунты */}
        {telegramUsers.length > 0 && (
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">Подключенные аккаунты</h4>
            <div className="space-y-2">
              {telegramUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <User className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">@{user.username}</span>
                        {user.verified && (
                          <Badge className="bg-green-100 text-green-800 border-green-200">
                            <Check className="w-3 h-3 mr-1" />
                            Проверен
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-600">
                        {user.firstName} {user.lastName}
                      </p>
                      {user.phone && (
                        <div className="flex items-center space-x-1 text-xs text-gray-500">
                          <Phone className="w-3 h-3" />
                          <span>{user.phone}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => disconnectMutation.mutate(user.id)}
                    disabled={disconnectMutation.isPending}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Форма подключения нового аккаунта */}
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900">Подключить новый аккаунт</h4>
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-start space-x-2">
              <MessageCircle className="w-5 h-5 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Как подключить Telegram:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>Найдите @StreamDeskBot в Telegram</li>
                  <li>Отправьте команду /start</li>
                  <li>Скопируйте ваш Telegram ID из ответа бота</li>
                  <li>Заполните форму ниже</li>
                </ol>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="telegram-id">Telegram ID *</Label>
              <Input
                id="telegram-id"
                placeholder="123456789"
                value={telegramId}
                onChange={(e) => setTelegramId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">Username *</Label>
              <Input
                id="username"
                placeholder="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="first-name">Имя *</Label>
              <Input
                id="first-name"
                placeholder="Иван"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last-name">Фамилия</Label>
              <Input
                id="last-name"
                placeholder="Петров"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="phone">Телефон</Label>
              <Input
                id="phone"
                placeholder="+7 (999) 123-45-67"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <Button
            onClick={handleConnect}
            disabled={connectMutation.isPending}
            className="w-full"
          >
            {connectMutation.isPending ? "Подключение..." : "Подключить аккаунт"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}