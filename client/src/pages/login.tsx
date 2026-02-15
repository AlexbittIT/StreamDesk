import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useMutation } from "@tanstack/react-query";
import { MessageCircle, LogIn, Loader2, Radio, Tv, UserPlus, X, Sparkles } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface LoginProps {
  onLogin: (user: any) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showRegister, setShowRegister] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Telegram Gateway states
  const [showTelegramGateway, setShowTelegramGateway] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [codeTimestamp, setCodeTimestamp] = useState<number | null>(null);
  const [isRequestingCode, setIsRequestingCode] = useState(false);

  const loginMutation = useMutation({
    mutationFn: async (data: { username: string; password: string }) => {
      console.log("[Login] Attempting login for:", data.username);
      
      // Для админа используем короткий таймаут
      const isAdmin = data.username === "admin" && data.password === "admin123";
      const timeoutMs = isAdmin ? 5000 : 60000; // 5 секунд для админа, 60 для остальных
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      try {
        console.log("[Login] Sending request to /api/auth/login");
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          credentials: "include",
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        console.log("[Login] Response status:", response.status, response.ok);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: "Ошибка авторизации" }));
          console.error("[Login] Login failed:", errorData);
          throw new Error(errorData.message || "Ошибка авторизации");
        }
        
        const result = await response.json();
        console.log("[Login] Login successful, received data:", result);
        return result;
      } catch (error: any) {
        clearTimeout(timeoutId);
        console.error("[Login] Login error:", error);
        if (error.name === 'AbortError') {
          throw new Error('Превышено время ожидания. Попробуйте снова.');
        }
        throw error;
      }
    },
    onSuccess: (data: any) => {
      console.log("[Login] Login successful, user data:", data);
      
      if (!data || !data.user) {
        console.error("[Login] Invalid response data:", data);
        toast({
          title: "Ошибка",
          description: "Неверный формат ответа от сервера",
          variant: "destructive"
        });
        return;
      }

      try {
        // Сохраняем пользователя в localStorage
        const userJson = JSON.stringify(data.user);
        localStorage.setItem('streamstudio_user', userJson);
        console.log("[Login] User saved to localStorage:", userJson);
        
        // Проверяем, что данные сохранились
        const saved = localStorage.getItem('streamstudio_user');
        if (!saved) {
          throw new Error("Failed to save user to localStorage");
        }
        
        setIsAnimating(true);
        
        toast({ 
          title: "Добро пожаловать!", 
          description: `Вы вошли как ${data.user.name}`,
          duration: 1500
        });
        
        // Ждем завершения анимации перед редиректом
        setTimeout(() => {
          console.log("[Login] Calling onLogin callback after animation");
          onLogin(data.user);
        }, 1500);
      } catch (error: any) {
        console.error("[Login] Error saving user:", error);
        toast({
          title: "Ошибка",
          description: "Не удалось сохранить данные пользователя: " + error.message,
          variant: "destructive"
        });
      }
    },
    onError: (error: any) => {
      console.error("Login error:", error);
      let message = "Неверные учётные данные";
      
      if (error.message) {
        if (error.message.includes("timeout") || error.message.includes("время ожидания")) {
          message = "Превышено время ожидания. Проверьте подключение к серверу.";
        } else if (error.message.includes("500")) {
          message = "Ошибка сервера. Попробуйте позже.";
        } else {
          message = error.message;
        }
      }
      
      toast({ 
        title: "Ошибка", 
        description: message, 
        variant: "destructive" 
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: { username: string; password: string; name: string; email?: string }) => {
      const response = await apiRequest("POST", "/api/auth/register", data);
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({ 
        title: "Заявка отправлена!", 
        description: data.message || "Администратор должен подтвердить ваш аккаунт перед входом" 
      });
      setShowRegister(false);
    },
    onError: (error: any) => {
      const message = typeof error?.message === "string" && error.message.includes(":")
        ? error.message.split(":").slice(1).join(":").trim()
        : error?.message || "Не удалось отправить заявку на регистрацию";
      toast({ title: "Ошибка", description: message, variant: "destructive" });
    },
  });

  const telegramLoginMutation = useMutation({
    mutationFn: async (telegramData: any) => {
      console.log("[Telegram Auth] Received Telegram data:", telegramData);
      const response = await apiRequest("POST", "/api/auth/telegram/login", telegramData);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Ошибка авторизации через Telegram" }));
        throw new Error(errorData.message || "Ошибка авторизации через Telegram");
      }
      return response.json();
    },
    onSuccess: (data: any) => {
      console.log("[Telegram Auth] Login successful, user data:", data);
      if (!data || !data.user) {
        toast({
          title: "Ошибка",
          description: "Неверный формат ответа от сервера",
          variant: "destructive"
        });
        return;
      }
      
      try {
        setIsAnimating(true);
        localStorage.setItem('streamstudio_user', JSON.stringify(data.user));
        toast({ 
          title: "Добро пожаловать!", 
          description: `Вы вошли через Telegram как ${data.user.name}`,
          duration: 1500
        });
        setTimeout(() => {
          onLogin(data.user);
        }, 1500);
      } catch (error: any) {
        console.error("[Telegram Auth] Error saving user:", error);
        toast({
          title: "Ошибка",
          description: "Не удалось сохранить данные пользователя: " + error.message,
          variant: "destructive"
        });
      }
    },
    onError: (error: any) => {
      console.error("[Telegram Auth] Login error:", error);
      toast({ 
        title: "Ошибка", 
        description: error.message || "Не удалось войти через Telegram", 
        variant: "destructive" 
      });
    },
  });

  useEffect(() => {
    const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME;
    
    if (botUsername && typeof window !== 'undefined') {
      // Глобальная функция для обработки авторизации Telegram
      (window as any).onTelegramAuth = (user: any) => {
        console.log("[Telegram Widget] Auth callback received:", user);
        if (user && user.id) {
          telegramLoginMutation.mutate(user);
        } else {
          toast({
            title: "Ошибка",
            description: "Неверные данные от Telegram",
            variant: "destructive"
          });
        }
      };

      // Создаем скрипт Telegram Login Widget
      const script = document.createElement('script');
      script.src = 'https://telegram.org/js/telegram-widget.js?22';
      script.setAttribute('data-telegram-login', botUsername);
      script.setAttribute('data-size', 'large');
      script.setAttribute('data-radius', '10');
      script.setAttribute('data-onauth', 'onTelegramAuth(user)');
      script.setAttribute('data-request-access', 'write');
      script.setAttribute('data-userpic', 'true');
      script.async = true;

      const container = document.getElementById('telegram-login-container');
      if (container) {
        container.innerHTML = '';
        container.appendChild(script);
      }

      return () => {
        // Cleanup
        if (container) {
          container.innerHTML = '';
        }
        delete (window as any).onTelegramAuth;
      };
    }
  }, [telegramLoginMutation]);

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
    <div className="fixed inset-0 bg-gradient-to-br from-gray-950 via-gray-900 to-black flex items-center justify-center p-4 overflow-auto relative">
      {/* Неоновый фон с множеством анимированных элементов */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Большие неоновые круги */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
        
        {/* Средние неоновые элементы */}
        <div className="absolute top-0 left-0 w-64 h-64 bg-blue-500/15 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '0.5s' }} />
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-indigo-500/15 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '1.5s' }} />
        <div className="absolute top-1/3 right-1/3 w-80 h-80 bg-violet-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2.5s' }} />
        
        {/* Маленькие неоновые точки */}
        <div className="absolute top-1/5 left-1/5 w-32 h-32 bg-cyan-400/30 rounded-full blur-xl animate-pulse" style={{ animationDelay: '0.3s' }} />
        <div className="absolute bottom-1/5 right-1/5 w-32 h-32 bg-purple-400/30 rounded-full blur-xl animate-pulse" style={{ animationDelay: '1.3s' }} />
        <div className="absolute top-2/3 left-2/3 w-40 h-40 bg-pink-400/20 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '2.3s' }} />
        <div className="absolute top-3/4 left-1/4 w-28 h-28 bg-blue-400/25 rounded-full blur-xl animate-pulse" style={{ animationDelay: '0.7s' }} />
        <div className="absolute bottom-1/3 right-1/4 w-36 h-36 bg-indigo-400/20 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '1.7s' }} />
        
        {/* Дополнительные неоновые элементы */}
        <div className="absolute top-0 right-1/4 w-48 h-48 bg-cyan-500/10 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '0.9s' }} />
        <div className="absolute bottom-1/4 left-0 w-56 h-56 bg-purple-500/10 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '1.9s' }} />
        <div className="absolute top-1/2 left-0 w-44 h-44 bg-pink-500/15 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '2.9s' }} />
        
        {/* Градиентные линии */}
        <div className="absolute top-0 left-1/2 w-px h-full bg-gradient-to-b from-transparent via-cyan-500/20 to-transparent animate-pulse" />
        <div className="absolute top-1/2 left-0 w-full h-px bg-gradient-to-r from-transparent via-purple-500/20 to-transparent animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* Анимация успешного входа */}
      {isAnimating && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="text-center space-y-6">
            <div className="relative">
              <div className="w-32 h-32 mx-auto rounded-full bg-gradient-to-br from-cyan-400 via-purple-500 to-pink-500 flex items-center justify-center animate-pulse shadow-2xl shadow-cyan-500/50">
                <Sparkles className="w-16 h-16 text-white animate-spin" />
              </div>
              <div className="absolute inset-0 w-32 h-32 mx-auto rounded-full bg-gradient-to-br from-cyan-400 via-purple-500 to-pink-500 animate-ping opacity-20" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 bg-clip-text text-transparent animate-pulse">
                Добро пожаловать!
              </h2>
              <p className="text-gray-300 text-lg">Выполняется вход в систему...</p>
            </div>
          </div>
        </div>
      )}

      <div className={cn(
        "w-full max-w-md relative z-10 transition-all duration-500",
        isAnimating && "scale-95 opacity-0"
      )}>
        {/* Logo с неоновым эффектом */}
        <div className="text-center mb-8">
          <div className="relative inline-block mb-4">
            {/* Множественные неоновые свечения вокруг логотипа */}
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 rounded-2xl blur-xl opacity-50 animate-pulse" />
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 rounded-2xl blur-2xl opacity-30 animate-pulse" style={{ animationDelay: '0.5s' }} />
            <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500 via-purple-500 to-pink-500 shadow-2xl shadow-cyan-500/50 ring-4 ring-cyan-500/20">
              <Tv className="w-10 h-10 text-white drop-shadow-lg" />
            </div>
            {/* Вращающееся неоновое кольцо */}
            <div className="absolute inset-0 rounded-2xl border-2 border-cyan-500/30 animate-spin" style={{ animationDuration: '3s' }} />
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2 drop-shadow-lg dark:animate-pulse dark:drop-shadow-[0_0_20px_rgba(6,182,212,0.6)]">
            StreamDesk
          </h1>
          <p className="text-gray-400 text-sm">Управление с чего угодно</p>
        </div>

        <Card className="border border-cyan-500/30 bg-gray-900/90 backdrop-blur-xl shadow-2xl shadow-cyan-500/20 ring-1 ring-cyan-500/10">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl text-white">Вход в систему</CardTitle>
            <CardDescription className="text-gray-400">
              Войдите через Telegram или используйте логин и пароль
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Telegram Gateway Login */}
            <div className="space-y-3">
              {!showTelegramGateway ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-12 bg-[#0088cc] hover:bg-[#0077b5] text-white border-0 shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-all rounded-full"
                  onClick={() => setShowTelegramGateway(true)}
                  data-testid="button-telegram-gateway"
                >
                  <MessageCircle className="w-5 h-5 mr-2" />
                  Войти через Telegram Gateway
                </Button>
              ) : (
                <div className="space-y-3 p-4 bg-gray-800/50 rounded-xl border border-cyan-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-white">Telegram Gateway</h3>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowTelegramGateway(false);
                        setPhoneNumber("");
                        setAuthCode("");
                        setCodeTimestamp(null);
                      }}
                      className="h-6 w-6 p-0 text-gray-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="phone-number" className="text-gray-300 text-xs">
                      Номер телефона (код придет через официальный канал Telegram)
                    </Label>
                    <Input
                      id="phone-number"
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => {
                        // Форматируем номер телефона
                        const value = e.target.value.replace(/\D/g, "");
                        if (value.length <= 11) {
                          const formatted = value.length > 0 ? `+7${value}` : "";
                          setPhoneNumber(formatted);
                        }
                      }}
                      placeholder="+79001234567"
                      className="bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500 focus:border-cyan-500"
                    />
                    <p className="text-xs text-gray-500">
                      Код будет отправлен через официальный канал Telegram (~1-2 рубля за сообщение)
                    </p>
                  </div>

                  {!codeTimestamp ? (
                    <Button
                      type="button"
                      className="w-full h-10 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white rounded-full"
                      onClick={() => {
                        if (!phoneNumber.trim() || phoneNumber.length < 12) {
                          toast({
                            title: "Ошибка",
                            description: "Введите корректный номер телефона",
                            variant: "destructive",
                          });
                          return;
                        }
                        setIsRequestingCode(true);
                        requestCodeMutation.mutate(
                          {
                            phoneNumber: phoneNumber.trim(),
                          },
                          {
                            onSettled: () => setIsRequestingCode(false),
                          }
                        );
                      }}
                      disabled={isRequestingCode || requestCodeMutation.isPending || phoneNumber.length < 12}
                    >
                      {isRequestingCode || requestCodeMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Отправка кода...
                        </>
                      ) : (
                        <>
                          <MessageCircle className="w-4 h-4 mr-2" />
                          Получить код через Telegram Gateway
                        </>
                      )}
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="auth-code" className="text-gray-300 text-xs">
                        Введите код из Telegram
                      </Label>
                      <Input
                        id="auth-code"
                        type="text"
                        value={authCode}
                        onChange={(e) => setAuthCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="000000"
                        maxLength={6}
                        className="bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500 focus:border-cyan-500 text-center text-2xl font-mono tracking-widest"
                      />
                      <Button
                        type="button"
                        className="w-full h-10 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-full"
                        onClick={() => {
                          if (!authCode || authCode.length !== 6) {
                            toast({
                              title: "Ошибка",
                              description: "Введите 6-значный код",
                              variant: "destructive",
                            });
                            return;
                          }
                          verifyCodeMutation.mutate({
                            code: authCode,
                            phoneNumber: phoneNumber.trim(),
                            timestamp: codeTimestamp,
                          });
                        }}
                        disabled={verifyCodeMutation.isPending || authCode.length !== 6}
                      >
                        {verifyCodeMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Проверка...
                          </>
                        ) : (
                          <>
                            <LogIn className="w-4 h-4 mr-2" />
                            Войти
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs text-gray-400 hover:text-white"
                        onClick={() => {
                          setCodeTimestamp(null);
                          setAuthCode("");
                        }}
                      >
                        Запросить новый код
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="relative">
              <Separator className="bg-gray-700" />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-900 px-3 text-xs text-gray-400">
                или
              </span>
            </div>

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-gray-300">Логин</Label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Введите логин"
                  required
                  className="bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500 focus:border-cyan-500 focus:ring-cyan-500/50"
                  data-testid="input-username"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-gray-300">Пароль</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Введите пароль"
                  required
                  className="bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500 focus:border-cyan-500 focus:ring-cyan-500/50"
                  data-testid="input-password"
                />
              </div>

              <Button
                type="submit"
                className="w-full h-12 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 hover:from-cyan-600 hover:via-purple-600 hover:to-pink-600 text-white border-0 shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 transition-all font-semibold relative overflow-hidden group"
                disabled={loginMutation.isPending}
                data-testid="button-login"
              >
                {/* Неоновое свечение при наведении */}
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 opacity-0 group-hover:opacity-20 blur-xl transition-opacity" />
                {loginMutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin relative z-10" />
                    <span className="relative z-10">Вход...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-5 h-5 mr-2 relative z-10" />
                    <span className="relative z-10">Войти</span>
                  </>
                )}
              </Button>
            </form>

            {/* Registration section */}
            <div className="pt-4 border-t border-gray-700">
              {!showRegister ? (
                <div className="text-center space-y-3">
                  <p className="text-sm font-medium text-gray-400">Нет аккаунта?</p>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
                    onClick={() => setShowRegister(true)}
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Зарегистрироваться
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-white">Регистрация</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowRegister(false)}
                      className="h-6 w-6 p-0 text-gray-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const formData = new FormData(e.currentTarget);
                      registerMutation.mutate({
                        username: String(formData.get("reg_username") || ""),
                        password: String(formData.get("reg_password") || ""),
                        name: String(formData.get("reg_name") || ""),
                        email: String(formData.get("reg_email") || "") || undefined,
                      });
                    }}
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <Input 
                        name="reg_name" 
                        placeholder="Имя *" 
                        required 
                        className="bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500"
                      />
                      <Input 
                        name="reg_username" 
                        placeholder="Логин *" 
                        required 
                        className="bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500"
                      />
                    </div>
                    <Input 
                      name="reg_email" 
                      type="email" 
                      placeholder="Email (необязательно)" 
                      className="bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500"
                    />
                    <Input 
                      name="reg_password" 
                      type="password" 
                      placeholder="Пароль *" 
                      required 
                      className="bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500"
                    />
                    <Button
                      type="submit"
                      className="w-full bg-gray-800 hover:bg-gray-700 text-white border-gray-700"
                      disabled={registerMutation.isPending}
                    >
                      {registerMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <UserPlus className="w-4 h-4 mr-2" />
                      )}
                      Отправить заявку на регистрацию
                    </Button>
                  </form>
                  <p className="text-xs text-center text-gray-500">
                    После регистрации администратор проверит и подтвердит ваш аккаунт
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-gray-500 text-sm mt-6">
          StreamDesk Management System
        </p>
      </div>
    </div>
  );
}
