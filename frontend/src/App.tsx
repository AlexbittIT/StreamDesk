import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState, useEffect, useRef } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

import Dashboard from "@/pages/dashboard";
import Calendar from "@/pages/calendar";
import Equipment from "@/pages/equipment";
import Estimates from "@/pages/estimates";
import Monitoring from "@/pages/monitoring";
import Streams from "@/pages/streams";
import Servers from "@/pages/servers";
import Notifications from "@/pages/notifications";
import Settings from "@/pages/settings";
import Tasks from "@/pages/tasks";
import TasksYouGile from "@/pages/tasks-yougile";
import Admin from "@/pages/admin";
import PlatformAdmin from "@/pages/platform-admin";
import Login from "@/pages/login";
import Onboarding from "@/pages/onboarding";
import NotFound from "@/pages/not-found";
import Projects from "@/pages/projects";
import ChatGPT from "@/pages/chatgpt";
import VmixScheduler from "@/pages/vmix-scheduler";
import ManagerDashboard from "@/pages/manager-dashboard";
import Terminal from "@/pages/terminal";
import ConnectionSchemas from "@/pages/connection-schemas";
import OtisOnAir from "@/pages/otis-onair";
import Maps from "@/pages/maps";
import RoomBooking from "@/pages/room-booking";

import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { BottomNav } from "@/components/layout/bottom-nav";
import { useSidebar } from "@/hooks/use-sidebar";
import AuthWrapper from "@/components/auth-wrapper";
import { ProtectedRoute } from "@/components/protected-route";
import { ErrorBoundary } from "@/components/error-boundary";
import { PERMISSIONS } from "@shared/schema";

function StubModeBanner() {
  const { data } = useQuery({
    queryKey: ["/api/health"],
    retry: false,
    refetchInterval: false,
  });
  if (!data?.stubMode) return null;
  return (
    <div className="bg-amber-500/90 text-amber-950 text-center py-1 px-2 sm:px-3 text-xs font-medium flex items-center justify-center gap-1.5 shrink-0">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">Режим заглушки: данные в памяти. Для сохранения запустите PostgreSQL и укажите DATABASE_URL в .env</span>
    </div>
  );
}

function Router({ user }: { user: any }) {
  return (
    <Switch>
      <Route path="/login" component={AuthWrapper} />
      <Route path="/onboarding">
        <ProtectedRoute user={user}>
          <Onboarding />
        </ProtectedRoute>
      </Route>
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
      <Route path="/maps">
        <ProtectedRoute user={user}>
          <Maps />
        </ProtectedRoute>
      </Route>
      <Route path="/room-booking">
        <ProtectedRoute user={user}>
          <RoomBooking />
        </ProtectedRoute>
      </Route>
      <Route path="/equipment">
        <ProtectedRoute user={user}>
          <Equipment />
        </ProtectedRoute>
      </Route>
      <Route path="/estimates">
        <ProtectedRoute user={user}>
          <Estimates />
        </ProtectedRoute>
      </Route>
      <Route path="/computers">
        <ProtectedRoute user={user}>
          <Servers />
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
      <Route path="/otis-onair">
        <ProtectedRoute user={user}>
          <OtisOnAir />
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
      <Route path="/tasks/yougile">
        <ProtectedRoute user={user}>
          <ErrorBoundary>
            <TasksYouGile />
          </ErrorBoundary>
        </ProtectedRoute>
      </Route>
      <Route path="/admin">
        <ProtectedRoute user={user}>
          <Admin />
        </ProtectedRoute>
      </Route>
      <Route path="/platform-admin">
        <ProtectedRoute user={user} requiredRole="admin" requiredPermission={PERMISSIONS.PLATFORM_ADMIN}>
          <PlatformAdmin />
        </ProtectedRoute>
      </Route>
      <Route path="/terminal">
        <ProtectedRoute user={user}>
          <Terminal />
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

function getDefaultAuthenticatedPath(user: any): string {
  const isPlatformAdmin = Array.isArray(user?.permissions) && user.permissions.includes("platform:admin");
  if (isPlatformAdmin) return "/platform-admin";
  return "/";
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
  const [isLoading, setIsLoading] = useState(false);
  const sidebarCollapsed = useSidebar();
  const swipeStartX = useRef<number>(0);
  const swipeStartY = useRef<number>(0);
  const [location] = useLocation();

  useEffect(() => {
    const loadUser = () => {
      try {
        const savedUser = localStorage.getItem('streamstudio_user');
        if (savedUser) {
          const parsedUser = JSON.parse(savedUser);
          if (parsedUser && parsedUser.id) {
            setUser(parsedUser);
            setIsLoading(false);
            return true;
          }
          localStorage.removeItem('streamstudio_user');
        }
      } catch (error: any) {
        console.error("[App] Error loading user:", error);
        localStorage.removeItem('streamstudio_user');
      }
      setIsLoading(false);
      return false;
    };

    if (!user) {
      loadUser();
    }

    // Слушаем изменения localStorage (на случай, если пользователь вошел в другой вкладке)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'streamstudio_user') loadUser();
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
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

  useEffect(() => {
    if (user && typeof window !== "undefined" && window.location.pathname === "/login") {
      const nextPath = user.onboardingCompleted === false ? "/onboarding" : getDefaultAuthenticatedPath(user);
      const t = setTimeout(() => { window.location.href = nextPath; }, 100);
      return () => clearTimeout(t);
    }
  }, [user]);

  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    const path = window.location.pathname;
    if (user.onboardingCompleted === false && path !== "/onboarding" && path !== "/login") {
      const t = setTimeout(() => { window.location.href = "/onboarding"; }, 100);
      return () => clearTimeout(t);
    }
  }, [user]);

  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    const isPlatformAdminUser = Array.isArray(user?.permissions) && user.permissions.includes(PERMISSIONS.PLATFORM_ADMIN);
    if (!isPlatformAdminUser) return;
    const path = window.location.pathname;
    const allowedPaths = ["/platform-admin", "/settings", "/login", "/onboarding"];
    if (!allowedPaths.includes(path)) {
      const t = setTimeout(() => { window.location.href = "/platform-admin"; }, 100);
      return () => clearTimeout(t);
    }
  }, [user]);

  if (isLoading && user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
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

  // Если пользователь авторизован и URL /login — редирект на главную (без useLocation, т.к. на экране входа Router не смонтирован)
  if (!user || !user.id) {
    if (isLoading) {
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

  const isPlatformAdmin = Array.isArray(user?.permissions) && user.permissions.includes(PERMISSIONS.PLATFORM_ADMIN);
  const showWorkspaceChrome = user.onboardingCompleted !== false && location !== "/onboarding";
  const showBottomNav = showWorkspaceChrome && !isPlatformAdmin;
  const isFullWidthWorkspace = location === "/tasks";

  return (
    <ThemeProvider defaultTheme="system" storageKey="streamstudio-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <div className="app-layout min-h-screen bg-background font-sans antialiased transition-colors duration-300 overflow-x-hidden w-full max-w-[100vw] flex">
            {showWorkspaceChrome && mobileNavOpen && (
              <div
                className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
                onClick={() => setMobileNavOpen(false)}
                onTouchStart={(e) => {
                  swipeStartX.current = e.touches[0].clientX;
                  swipeStartY.current = e.touches[0].clientY;
                }}
                onTouchEnd={(e) => {
                  const dx = e.changedTouches[0].clientX - swipeStartX.current;
                  const dy = Math.abs(e.changedTouches[0].clientY - swipeStartY.current);
                  if (dx < -50 && dy < 80) setMobileNavOpen(false);
                }}
              />
            )}
            {/* Зона свайпа слева: потянуть вправо — открыть меню (только на мобильных) */}
            {showWorkspaceChrome && <div
              className="fixed left-0 top-0 bottom-0 w-6 z-30 lg:hidden touch-none"
              onTouchStart={(e) => {
                swipeStartX.current = e.touches[0].clientX;
                swipeStartY.current = e.touches[0].clientY;
              }}
              onTouchEnd={(e) => {
                const dx = e.changedTouches[0].clientX - swipeStartX.current;
                const dy = Math.abs(e.changedTouches[0].clientY - swipeStartY.current);
                if (dx > 50 && dy < 80 && !mobileNavOpen) setMobileNavOpen(true);
              }}
              aria-hidden
            />}
            
            {showWorkspaceChrome && <Sidebar
              user={user} 
              isOpen={mobileNavOpen}
              onClose={() => setMobileNavOpen(false)}
              onLogout={handleLogout}
            />}
            
            {/* Spacer под сайдбар: на lg+ занимает место, контент не уезжает */}
            {showWorkspaceChrome && <div
              className={cn(
                "hidden lg:block flex-shrink-0 transition-all duration-300",
                sidebarCollapsed ? "w-14 xl:w-16" : "w-[200px] xl:w-56"
              )}
              aria-hidden
            />}
            
            <div
              className="flex-1 min-w-0 min-h-screen flex flex-col overflow-x-hidden hide-scrollbar bg-starry w-full"
              id="main-content"
            >
              <StubModeBanner />
              {showWorkspaceChrome && (
                <Header
                  onMobileMenuClick={() => setMobileNavOpen(true)}
                  user={user}
                  onLogout={handleLogout}
                />
              )}
              <main className={cn(
                "flex-1 min-h-0 overflow-x-hidden overflow-y-auto hide-scrollbar page-content w-full max-w-full safe-area-bottom",
                showWorkspaceChrome ? "safe-area-top pb-24 md:pb-0" : "py-0"
              )}>
                <div
                  className={cn(
                    "w-full min-w-0 mx-auto flex flex-col min-h-full",
                    isFullWidthWorkspace ? "max-w-none" : "max-w-[1400px]"
                  )}
                >
                  <Router user={user} />
                </div>
              </main>
              {showWorkspaceChrome && <Footer />}
              {showBottomNav && <BottomNav user={user} onOpenMenu={() => setMobileNavOpen(true)} />}
            </div>
          </div>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
