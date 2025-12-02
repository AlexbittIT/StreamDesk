import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState, useEffect } from "react";

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

import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/calendar" component={Calendar} />
      <Route path="/equipment" component={Equipment} />
      <Route path="/monitoring" component={Monitoring} />
      <Route path="/streams" component={Streams} />
      <Route path="/servers" component={Servers} />
      <Route path="/notifications" component={Notifications} />
      <Route path="/settings" component={Settings} />
      <Route path="/tasks" component={Tasks} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [user, setUser] = useState<any>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [location] = useLocation();

  useEffect(() => {
    const savedUser = localStorage.getItem('streamstudio_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setIsLoading(false);
  }, []);

  const handleLogin = (userData: any) => {
    setUser(userData);
    localStorage.setItem('streamstudio_user', JSON.stringify(userData));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('streamstudio_user');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Login onLogin={handleLogin} />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen bg-gray-50 font-inter">
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
          
          <div className="lg:ml-72">
            <Header 
              onMobileMenuClick={() => setMobileNavOpen(true)}
              user={user}
              onLogout={handleLogout}
            />
            <main className="p-4 sm:p-6">
              <Router />
            </main>
          </div>
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
