import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import StatusCards from "@/components/dashboard/status-cards";
import CurrentActivity from "@/components/dashboard/current-activity";
import QuickCalendar from "@/components/dashboard/quick-calendar";
import SystemStatus from "@/components/dashboard/system-status";
import EquipmentStatus from "@/components/dashboard/equipment-status";
import StreamingStats from "@/components/dashboard/streaming-stats";
import VmixScheduler from "@/components/dashboard/vmix-scheduler";
import DashboardProfileCard from "@/components/dashboard/dashboard-profile-card";
import DashboardCountdownWidget from "@/components/dashboard/dashboard-countdown-widget";
import DashboardServicesSection from "@/components/dashboard/dashboard-services-section";
import { useWebSocket } from "@/hooks/use-websocket";
import { tabPermission } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

function getCurrentUser() {
  try {
    const raw = localStorage.getItem("streamstudio_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function canAccessTab(user: any, tabKey: string): boolean {
  if (!user) return true;
  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  const hasTabPermissions = permissions.some((permission: string) => permission.startsWith("tab:"));
  if (hasTabPermissions) return permissions.includes(tabPermission(tabKey));
  return true;
}

export default function Dashboard() {
  const currentUser = getCurrentUser();
  const { data: stats, isLoading: statsLoading, isError: statsError } = useQuery<any>({
    queryKey: ["/api/dashboard/stats"],
    retry: 1,
    retryDelay: 1000,
  });

  const { data: events = [], isLoading: eventsLoading, isError: eventsError } = useQuery<any[]>({
    queryKey: ["/api/events"],
    retry: 1,
    retryDelay: 1000,
  });

  const { data: systems = [], isLoading: systemsLoading, isError: systemsError } = useQuery<any[]>({
    queryKey: ["/api/systems"],
    retry: 1,
    retryDelay: 1000,
  });

  const { data: equipment = [], isLoading: equipmentLoading, isError: equipmentError } = useQuery<any[]>({
    queryKey: ["/api/equipment"],
    retry: 1,
    retryDelay: 1000,
  });

  const { data: streams = [], isLoading: streamsLoading, isError: streamsError } = useQuery<any[]>({
    queryKey: ["/api/streams", "active=true"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/streams?active=true");
      return response.json();
    },
    retry: 1,
    retryDelay: 1000,
  });

  // Connect to WebSocket for real-time updates (опционально)
  // WebSocket не критичен - приложение должно работать без него
  useWebSocket();

  const isLoading = statsLoading || eventsLoading || systemsLoading || equipmentLoading || streamsLoading;
  const hasError = statsError || eventsError || systemsError || equipmentError || streamsError;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Если есть ошибки, все равно показываем контент, но с пустыми данными
  if (hasError) {
    console.warn("[Dashboard] Some data failed to load, showing dashboard with available data");
  }

  const nextEvent = (events as any[])
    ?.filter((e: any) => e.startTime && new Date(e.startTime) > new Date())
    ?.sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0];

  return (
    <div className="space-y-1.5 sm:space-y-2 w-full min-w-0 max-w-full overflow-hidden pt-0 sm:pt-0">
      {/* Верхний ряд: профиль + ближайшее событие */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2 w-full min-w-0">
        <DashboardProfileCard />
        <DashboardCountdownWidget nextEvent={nextEvent} />
      </div>

      <StatusCards stats={stats} user={currentUser} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-1.5 w-full min-w-0">
        <div className="lg:col-span-2 space-y-1 sm:space-y-1.5 min-w-0">
          {(canAccessTab(currentUser, "streams") || canAccessTab(currentUser, "calendar")) && (
            <CurrentActivity
              streams={canAccessTab(currentUser, "streams") ? streams : []}
              events={canAccessTab(currentUser, "calendar") ? events : []}
            />
          )}
          {canAccessTab(currentUser, "vmix-scheduler") && <VmixScheduler />}
          {canAccessTab(currentUser, "calendar") && <QuickCalendar events={events} />}
        </div>
        <div className="space-y-1 sm:space-y-1.5 min-w-0">
          {canAccessTab(currentUser, "streams") && <StreamingStats />}
          {canAccessTab(currentUser, "monitoring") && <SystemStatus systems={systems} />}
          {canAccessTab(currentUser, "equipment") && <EquipmentStatus equipment={equipment} />}
        </div>
      </div>

      <DashboardServicesSection user={currentUser} />
    </div>
  );
}
