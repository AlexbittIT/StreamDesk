import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState, useEffect } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

import Dashboard from "@/pages/dashboard";
import Calendar from "@/pages/calendar";
import Equipment from "@/pages/equipment";
import Monitoring from "@/pages/monitoring";
import Streams from "@/pages/streams";
import Servers from "@/pages/servers";
import Notifications from "@/pages/notifications";
import Settings from "@/pages/settings";
import Tasks from "@/pages/tasks";
import Admin from "@/pages/admin";
import Login from "@/pages/login";
import NotFound from "@/pages/not-found";
import Computers from "@/pages/computers";
import Projects from "@/pages/projects";
import ChatGPT from "@/pages/chatgpt";
import Transcription from "@/pages/transcription";
import AITranscription from "@/pages/ai-transcription";
import VmixScheduler from "@/pages/vmix-scheduler";
import ManagerDashboard from "@/pages/manager-dashboard";
import ConnectionSchemas from "@/pages/connection-schemas";

import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { useSidebar } from "@/hooks/use-sidebar";
import AuthWrapper from "@/components/auth-wrapper";
import { ProtectedRoute } from "@/components/protected-route";
import { ErrorBoundary } from "@/components/error-boundary";

function Router({ user }: { user: any }) {
  return (
    <Switch>
      <Route path="/login" component={AuthWrapper} />
      <Route path="/">
        <ProtectedRoute user={user}>
          <Dashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/calendar">
        <ProtectedRoute user={user}>
          <Calendar />
        </ProtectedRoute>
      </Route>
      <Route path="/equipment">
        <ProtectedRoute user={user}>
          <Equipment />
        </ProtectedRoute>
      </Route>
      <Route path="/computers">
        <ProtectedRoute user={user}>
          <Computers />
        </ProtectedRoute>
      </Route>
      <Route path="/projects">
        <ProtectedRoute user={user}>
          <Projects />
        </ProtectedRoute>
      </Route>
      <Route path="/monitoring">
        <ProtectedRoute user={user}>
          <Monitoring />
        </ProtectedRoute>
      </Route>
      <Route path="/streams">
        <ProtectedRoute user={user}>
          <Streams />
        </ProtectedRoute>
      </Route>
      <Route path="/servers">
        <ProtectedRoute user={user}>
          <Servers />
        </ProtectedRoute>
      </Route>
      <Route path="/chatgpt">
        <ProtectedRoute user={user}>
          <ChatGPT />
        </ProtectedRoute>
      </Route>
      <Route path="/transcription">
        <ProtectedRoute user={user}>
          <Transcription />
        </ProtectedRoute>
      </Route>
      <Route path="/ai-transcription">
        <ProtectedRoute user={user}>
          <AITranscription />
        </ProtectedRoute>
      </Route>
      <Route path="/vmix-scheduler">
        <ProtectedRoute user={user}>
          <VmixScheduler />
        </ProtectedRoute>
      </Route>
      <Route path="/connection-schemas">
        <ProtectedRoute user={user}>
          <ConnectionSchemas />
        </ProtectedRoute>
      </Route>
      <Route path="/notifications">
        <ProtectedRoute user={user}>
          <Notifications />
        </ProtectedRoute>
      </Route>
      <Route path="/settings">
        <ProtectedRoute user={user}>
          <Settings />
        </ProtectedRoute>
      </Route>
      <Route path="/tasks">
        <ProtectedRoute user={user}>
          <ErrorBoundary>
            <Tasks />
          </ErrorBoundary>
        </ProtectedRoute>
      </Route>
      <Route path="/admin">
        <ProtectedRoute user={user} requiredRole="admin">
          <Admin />
        </ProtectedRoute>
      </Route>
      <Route path="/manager-dashboard">
        <ProtectedRoute user={user} requiredRole={["admin", "manager"]}>
          <ManagerDashboard />
        </ProtectedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Синхронная загрузка пользователя при инициализации
  const loadUserSync = () => {
    try {
      const savedUser = localStorage.getItem('streamstudio_user');
      if (savedUser) {
        const parsedUser = JSON.parse(savedUser);
        if (parsedUser && parsedUser.id) {
          console.log("[App] User loaded synchronously:", parsedUser.username || parsedUser.name);
          return parsedUser;
        }
      }
    } catch (error: any) {
      console.error("[App] Error loading user synchronously:", error);
      localStorage.removeItem('streamstudio_user');
    }
    return null;
  };

  const [user, setUser] = useState<any>(loadUserSync());
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(!user); // Если пользователь загружен синхронно, не показываем загрузку
  const [location] = useLocation();
  const sidebarCollapsed = useSidebar();

  useEffect(() => {
    const loadUser = () => {
      try {
        const savedUser = localStorage.getItem('streamstudio_user');
        console.log("[App] Loading user from localStorage:", savedUser ? "found" : "not found");
        if (savedUser) {
          const parsedUser = JSON.parse(savedUser);
          if (parsedUser && parsedUser.id) {
            console.log("[App] User loaded successfully:", parsedUser.username || parsedUser.name);
            setUser(parsedUser);
            setIsLoading(false);
            return true;
          } else {
            console.warn("[App] Invalid user data in localStorage:", parsedUser);
            localStorage.removeItem('streamstudio_user');
          }
        } else {
          console.log("[App] No user found in localStorage");
        }
      } catch (error: any) {
        console.error("[App] Error loading user:", error);
        localStorage.removeItem('streamstudio_user');
      }
      setIsLoading(false);
      return false;
    };

    // Если пользователь не загружен синхронно, загружаем асинхронно
    if (!user) {
      loadUser();
    }

    // Также проверяем через небольшую задержку на случай, если данные были сохранены только что
    const timeoutId = setTimeout(() => {
      const savedUser = localStorage.getItem('streamstudio_user');
      if (savedUser && !user) {
        try {
          const parsed = JSON.parse(savedUser);
          if (parsed && parsed.id) {
            console.log("[App] Retrying user load after delay - user found");
            setUser(parsed);
            setIsLoading(false);
          }
        } catch (e) {
          console.error("[App] Error parsing user on retry:", e);
        }
      }
    }, 300);

    // Слушаем изменения localStorage (на случай, если пользователь вошел в другой вкладке)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'streamstudio_user') {
        console.log("[App] Storage changed, reloading user");
        loadUser();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // Register service worker for push notifications
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.error('Service Worker registration failed:', error);
      });
    }

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const handleLogin = (userData: any) => {
    setUser(userData);
    localStorage.setItem('streamstudio_user', JSON.stringify(userData));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('streamstudio_user');
    // Перенаправляем на страницу логина
    window.location.href = '/login';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Если пользователь не авторизован, показываем только страницу логина (полноэкранную)
  if (!user) {
    console.log("[App] No user, showing login page");
    return (
      <ThemeProvider defaultTheme="system" storageKey="streamstudio-theme">
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <AuthWrapper />
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    );
  }

  console.log("[App] User is authenticated, rendering app. User:", user?.username || user?.name);

  // Если пользователь на странице логина и уже авторизован, перенаправляем на главную
  useEffect(() => {
    if (user && location === "/login") {
      const timer = setTimeout(() => {
        window.location.href = "/";
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [user, location]);

  // Если пользователь не загружен, показываем логин или загрузку
  if (!user || !user.id) {
    if (isLoading) {
      console.log("[App] Still loading user, showing loading screen");
      return (
        <ThemeProvider defaultTheme="system" storageKey="streamstudio-theme">
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-gray-600">Загрузка...</p>
                </div>
              </div>
              <Toaster />
            </TooltipProvider>
          </QueryClientProvider>
        </ThemeProvider>
      );
    }
    
    console.log("[App] User not loaded, showing login page");
    return (
      <ThemeProvider defaultTheme="system" storageKey="streamstudio-theme">
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <AuthWrapper />
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider defaultTheme="system" storageKey="streamstudio-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <div className="min-h-screen bg-background font-inter transition-colors duration-300">
            {mobileNavOpen && (
              <div 
                className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
                onClick={() => setMobileNavOpen(false)}
              />
            )}
            
            <Sidebar 
              user={user} 
              isOpen={mobileNavOpen}
              onClose={() => setMobileNavOpen(false)}
              onLogout={handleLogout}
            />
            
            <div 
              className={cn(
                "transition-all duration-300",
                sidebarCollapsed ? "lg:ml-20" : "lg:ml-72",
                "min-h-screen"
              )}
              id="main-content"
            >
              <Header 
                onMobileMenuClick={() => setMobileNavOpen(true)}
                user={user}
                onLogout={handleLogout}
              />
              <main className="p-4 sm:p-6">
                <Router user={user} />
              </main>
            </div>
          </div>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
