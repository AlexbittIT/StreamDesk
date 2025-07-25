import { Switch, Route } from "wouter";
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
import Settings from "@/pages/settings";
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
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [user, setUser] = useState<any>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    // Simple auth check - in real app would use proper session management
    const savedUser = localStorage.getItem('streamstudio_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    } else {
      // Auto-login as admin for demo
      const adminUser = { id: "1", username: "admin", name: "Администратор", role: "admin" };
      setUser(adminUser);
      localStorage.setItem('streamstudio_user', JSON.stringify(adminUser));
    }
  }, []);

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen bg-gray-50 font-inter">
          {/* Mobile nav overlay */}
          {mobileNavOpen && (
            <div 
              className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
              onClick={() => setMobileNavOpen(false)}
            />
          )}
          
          {/* Sidebar */}
          <Sidebar 
            user={user} 
            isOpen={mobileNavOpen}
            onClose={() => setMobileNavOpen(false)}
          />
          
          {/* Main content */}
          <div className="lg:ml-72">
            <Header 
              onMobileMenuClick={() => setMobileNavOpen(true)}
              user={user}
            />
            <main className="p-6">
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
