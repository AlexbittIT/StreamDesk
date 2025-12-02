import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useMutation } from "@tanstack/react-query";
import { MessageCircle, LogIn, Loader2, Radio, Tv } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface LoginProps {
  onLogin: (user: any) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const loginMutation = useMutation({
    mutationFn: async (data: { username: string; password: string }) => {
      const response = await apiRequest("POST", "/api/auth/login", data);
      return response.json();
    },
    onSuccess: (data: any) => {
      localStorage.setItem('streamstudio_user', JSON.stringify(data.user));
      onLogin(data.user);
      toast({ title: "Добро пожаловать!", description: `Вы вошли как ${data.user.name}` });
      setLocation("/");
    },
    onError: () => {
      toast({ title: "Ошибка", description: "Неверные учётные данные", variant: "destructive" });
    },
  });

  const telegramLoginMutation = useMutation({
    mutationFn: async (telegramData: any) => {
      const response = await apiRequest("POST", "/api/auth/telegram/login", telegramData);
      return response.json();
    },
    onSuccess: (data: any) => {
      localStorage.setItem('streamstudio_user', JSON.stringify(data.user));
      onLogin(data.user);
      toast({ title: "Добро пожаловать!", description: `Вы вошли через Telegram как ${data.user.name}` });
      setLocation("/");
    },
    onError: () => {
      toast({ title: "Ошибка", description: "Не удалось войти через Telegram", variant: "destructive" });
    },
  });

  useEffect(() => {
    const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME;
    
    if (botUsername && typeof window !== 'undefined') {
      (window as any).onTelegramAuth = (user: any) => {
        telegramLoginMutation.mutate(user);
      };

      const script = document.createElement('script');
      script.src = 'https://telegram.org/js/telegram-widget.js?22';
      script.setAttribute('data-telegram-login', botUsername);
      script.setAttribute('data-size', 'large');
      script.setAttribute('data-radius', '8');
      script.setAttribute('data-onauth', 'onTelegramAuth(user)');
      script.setAttribute('data-request-access', 'write');
      script.async = true;

      const container = document.getElementById('telegram-login-container');
      if (container) {
        container.innerHTML = '';
        container.appendChild(script);
      }
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ username, password });
  };

  const handleDemoTelegramLogin = () => {
    const demoUser = {
      id: Date.now(),
      first_name: "Telegram",
      last_name: "User",
      username: `user_${Date.now()}`,
      photo_url: null,
      auth_date: Math.floor(Date.now() / 1000)
    };
    telegramLoginMutation.mutate(demoUser);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500 to-red-600 mb-4 shadow-lg">
            <Tv className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">StreamStudio</h1>
          <p className="text-gray-400 mt-1">Система управления студией</p>
        </div>

        <Card className="border-0 shadow-2xl">
          <CardHeader className="text-center pb-2">
            <CardTitle>Вход в систему</CardTitle>
            <CardDescription>
              Войдите через Telegram или используйте логин и пароль
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Telegram Login */}
            <div className="space-y-3">
              <div id="telegram-login-container" className="flex justify-center min-h-[40px]" />
              
              {!import.meta.env.VITE_TELEGRAM_BOT_USERNAME && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-12 bg-[#0088cc] hover:bg-[#0077b5] text-white border-0"
                  onClick={handleDemoTelegramLogin}
                  disabled={telegramLoginMutation.isPending}
                  data-testid="button-telegram-login"
                >
                  {telegramLoginMutation.isPending ? (
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  ) : (
                    <MessageCircle className="w-5 h-5 mr-2" />
                  )}
                  Войти через Telegram
                </Button>
              )}
            </div>

            <div className="relative">
              <Separator />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-2 text-xs text-gray-500">
                или
              </span>
            </div>

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Логин</Label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Введите логин"
                  required
                  data-testid="input-username"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Пароль</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Введите пароль"
                  required
                  data-testid="input-password"
                />
              </div>

              <Button
                type="submit"
                className="w-full h-12"
                disabled={loginMutation.isPending}
                data-testid="button-login"
              >
                {loginMutation.isPending ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                  <LogIn className="w-5 h-5 mr-2" />
                )}
                Войти
              </Button>
            </form>

            {/* Demo Accounts Info */}
            <div className="text-center text-xs text-gray-500 pt-2">
              <p>Демо-доступ: admin / admin123</p>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-gray-500 text-sm mt-6">
          StreamStudio Management System
        </p>
      </div>
    </div>
  );
}
