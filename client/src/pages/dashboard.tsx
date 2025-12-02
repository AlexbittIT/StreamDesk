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
  const { data: stats, isLoading: statsLoading } = useQuery<any>({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: events } = useQuery<any[]>({
    queryKey: ["/api/events"],
  });

  const { data: systems } = useQuery<any[]>({
    queryKey: ["/api/systems"],
  });

  const { data: equipment } = useQuery<any[]>({
    queryKey: ["/api/equipment"],
  });

  const { data: streams } = useQuery<any[]>({
    queryKey: ["/api/streams", "active=true"],
  });

  // Connect to WebSocket for real-time updates
  useWebSocket();

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Панель управления</h2>
      </div>

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
