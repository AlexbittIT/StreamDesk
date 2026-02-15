import { useQuery } from "@tanstack/react-query";
import StatusCards from "@/components/dashboard/status-cards";
import CurrentActivity from "@/components/dashboard/current-activity";
import QuickCalendar from "@/components/dashboard/quick-calendar";
import SystemStatus from "@/components/dashboard/system-status";
import EquipmentStatus from "@/components/dashboard/equipment-status";
import StreamingStats from "@/components/dashboard/streaming-stats";
import VmixScheduler from "@/components/dashboard/vmix-scheduler";
import QuickActions from "@/components/dashboard/quick-actions";
import { useWebSocket } from "@/hooks/use-websocket";

export default function Dashboard() {
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

  return (
    <div className="space-y-6">
      {/* Status Cards */}
      <StatusCards stats={stats} />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          <CurrentActivity streams={streams} events={events} />
          <VmixScheduler />
          <QuickCalendar events={events} />
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <StreamingStats />
          <SystemStatus systems={systems} />
          <EquipmentStatus equipment={equipment} />
        </div>
      </div>

      {/* Quick Actions */}
      <QuickActions />
    </div>
  );
}
