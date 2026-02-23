import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation } from "@tanstack/react-query";
import { LogIn, Loader2, Tv, UserPlus, X } from "lucide-react";
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
  const { toast } = useToast();

  const loginMutation = useMutation({
    mutationFn: async (data: { username: string; password: string }) => {
      const isAdmin = data.username === "admin" && data.password === "admin123";
      const timeoutMs = isAdmin ? 5000 : 60000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          credentials: "include",
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: "Ошибка авторизации" }));
          throw new Error(errorData.message || "Ошибка авторизации");
        }
        return response.json();
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === "AbortError") {
          throw new Error("Превышено время ожидания. Попробуйте снова.");
        }
        throw error;
      }
    },
    onSuccess: (data: any) => {
      if (!data?.user) {
        toast({ title: "Ошибка", description: "Неверный формат ответа от сервера", variant: "destructive" });
        return;
      }
      try {
        localStorage.setItem("streamstudio_user", JSON.stringify(data.user));
        setIsAnimating(true);
        toast({ title: "Добро пожаловать!", description: `Вы вошли как ${data.user.name}`, duration: 1500 });
        setTimeout(() => onLogin(data.user), 1500);
      } catch (error: any) {
        toast({ title: "Ошибка", description: "Не удалось сохранить данные пользователя: " + error.message, variant: "destructive" });
      }
    },
    onError: (error: any) => {
      let message = "Неверные учётные данные";
      if (error.message) {
        if (error.message.includes("timeout") || error.message.includes("время ожидания")) message = "Превышено время ожидания. Проверьте подключение к серверу.";
        else if (error.message.includes("500")) message = "Ошибка сервера. Попробуйте позже.";
        else message = error.message;
      }
      toast({ title: "Ошибка", description: message, variant: "destructive" });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: { username: string; password: string; name: string; email?: string }) => {
      const response = await apiRequest("POST", "/api/auth/register", data);
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Заявка отправлена!", description: data.message || "Администратор должен подтвердить ваш аккаунт перед входом" });
      setShowRegister(false);
    },
    onError: (error: any) => {
      const message = typeof error?.message === "string" && error.message.includes(":") ? error.message.split(":").slice(1).join(":").trim() : error?.message || "Не удалось отправить заявку на регистрацию";
      toast({ title: "Ошибка", description: message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ username, password });
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-950 via-gray-900 to-black flex items-center justify-center p-3 sm:p-4 overflow-auto relative min-h-screen safe-area-top safe-area-bottom">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "2s" }} />
        <div className="absolute top-0 left-0 w-64 h-64 bg-blue-500/15 rounded-full blur-2xl animate-pulse" style={{ animationDelay: "0.5s" }} />
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-indigo-500/15 rounded-full blur-2xl animate-pulse" style={{ animationDelay: "1.5s" }} />
        <div className="absolute top-1/3 right-1/3 w-80 h-80 bg-violet-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "2.5s" }} />
        <div className="absolute top-1/5 left-1/5 w-32 h-32 bg-cyan-400/30 rounded-full blur-xl animate-pulse" style={{ animationDelay: "0.3s" }} />
        <div className="absolute bottom-1/5 right-1/5 w-32 h-32 bg-purple-400/30 rounded-full blur-xl animate-pulse" style={{ animationDelay: "1.3s" }} />
        <div className="absolute top-0 right-1/4 w-48 h-48 bg-cyan-500/10 rounded-full blur-2xl animate-pulse" style={{ animationDelay: "0.9s" }} />
        <div className="absolute bottom-1/4 left-0 w-56 h-56 bg-purple-500/10 rounded-full blur-2xl animate-pulse" style={{ animationDelay: "1.9s" }} />
      </div>

      {isAnimating && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/95 backdrop-blur-md animate-in fade-in duration-300">
          {/* Рамка монитора с подсветкой */}
          <div className="relative animate-in zoom-in-95 duration-500">
            <div className="absolute -inset-4 bg-gradient-to-r from-cyan-500/30 via-purple-500/30 to-pink-500/30 rounded-3xl blur-2xl animate-pulse" aria-hidden />
            <div className="relative rounded-2xl overflow-hidden shadow-[0_0_40px_rgba(6,182,212,0.25),0_0_80px_rgba(139,92,246,0.15)] border-[12px] sm:border-[16px] border-gray-800 bg-gray-900">
              {/* Экран с color bars (SMPTE-style) + лёгкая сканлайн-анимация */}
              <div className="relative w-[300px] h-[180px] sm:w-[380px] sm:h-[228px] md:w-[440px] md:h-[264px] overflow-hidden">
                <div
                  className="absolute inset-0"
                  style={{
                    background: "linear-gradient(to right, #fff 0%, #fff 12.5%, #c4b000 12.5%, #c4b000 25%, #00c4b0 25%, #00c4b0 37.5%, #00c400 37.5%, #00c400 50%, #c400c4 50%, #c400c4 62.5%, #c40000 62.5%, #c40000 75%, #0000c4 75%, #0000c4 87.5%, #000 87.5%, #000 100%)",
                  }}
                />
                <div className="absolute inset-0 opacity-[0.06] pointer-events-none bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(255,255,255,0.04)_2px,rgba(255,255,255,0.04)_4px)]" style={{ animation: "scanline 8s linear infinite" }} aria-hidden />
              </div>
              {/* Подставка */}
              <div className="h-5 sm:h-6 bg-gradient-to-b from-gray-800 to-gray-900" />
              <div className="w-28 h-4 sm:w-36 sm:h-5 mx-auto -mt-0.5 bg-gray-700/90 rounded-b-full shadow-inner" />
            </div>
          </div>
          <p className="mt-8 text-gray-400 text-base font-medium animate-pulse">Загрузка...</p>
        </div>
      )}

      <div className={cn("w-full max-w-md relative z-10 transition-all duration-500", isAnimating && "scale-95 opacity-0")}>
        <div className="text-center mb-6 sm:mb-8">
          <div className="relative inline-block mb-4">
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 rounded-2xl blur-xl opacity-50 animate-pulse" />
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 rounded-2xl blur-2xl opacity-30 animate-pulse" style={{ animationDelay: "0.5s" }} />
            <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500 via-purple-500 to-pink-500 shadow-2xl shadow-cyan-500/50 ring-4 ring-cyan-500/20">
              <Tv className="w-10 h-10 text-white drop-shadow-lg" />
            </div>
            <div className="absolute inset-0 rounded-2xl border-2 border-cyan-500/30 animate-spin" style={{ animationDuration: "3s" }} />
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2 drop-shadow-lg dark:drop-shadow-[0_0_20px_rgba(6,182,212,0.6)]">
            StreamDesk
          </h1>
          <p className="text-gray-400 text-sm">Управление с чего угодно</p>
        </div>

        <Card className="border border-cyan-500/30 bg-gray-900/90 backdrop-blur-xl shadow-2xl shadow-cyan-500/20 ring-1 ring-cyan-500/10">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl text-white">Вход в систему</CardTitle>
            <CardDescription className="text-gray-400">Введите логин и пароль</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-gray-300">Логин</Label>
                <Input
                  id="username"
                  type="text"
                  autoComplete="username"
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
                  autoComplete="current-password"
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
                className="w-full h-12 min-h-[48px] touch-target font-semibold bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 hover:from-cyan-600 hover:via-purple-600 hover:to-pink-600 text-white border-0 shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 transition-all relative overflow-hidden group"
                disabled={loginMutation.isPending}
                data-testid="button-login"
              >
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

            <div className="pt-4 border-t border-gray-700">
              {!showRegister ? (
                <div className="text-center space-y-3">
                  <p className="text-sm font-medium text-gray-400">Нет аккаунта?</p>
                  <Button type="button" variant="outline" className="w-full border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white" onClick={() => setShowRegister(true)}>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Зарегистрироваться
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-white">Регистрация</p>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowRegister(false)} className="h-6 w-6 p-0 text-gray-400 hover:text-white">
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
                      <Input name="reg_name" placeholder="Имя *" required className="bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500" />
                      <Input name="reg_username" placeholder="Логин *" required className="bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500" />
                    </div>
                    <Input name="reg_email" type="email" placeholder="Email (необязательно)" className="bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500" />
                    <Input name="reg_password" type="password" placeholder="Пароль *" required className="bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500" />
                    <Button type="submit" className="w-full bg-gray-800 hover:bg-gray-700 text-white border-gray-700" disabled={registerMutation.isPending}>
                      {registerMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
                      Отправить заявку на регистрацию
                    </Button>
                  </form>
                  <p className="text-xs text-center text-gray-500">После регистрации администратор проверит и подтвердит ваш аккаунт</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-gray-500 text-sm mt-6">StreamDesk Management System</p>
      </div>
    </div>
  );
}
