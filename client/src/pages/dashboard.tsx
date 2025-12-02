import { useQuery } from "@tanstack/react-query";
import StatusCards from "@/components/dashboard/status-cards";
import CurrentActivity from "@/components/dashboard/current-activity";
import QuickCalendar from "@/components/dashboard/quick-calendar";
import SystemStatus from "@/components/dashboard/system-status";
import EquipmentStatus from "@/components/dashboard/equipment-status";
import StreamingStats from "@/components/dashboard/streaming-stats";
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
    return <div>Loading dashboard...</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">Панель управления</h2>
      </div>

      {/* Status Cards */}
      <StatusCards stats={stats} />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-8">
          <CurrentActivity streams={streams} events={events} />
          <QuickCalendar events={events} />
        </div>

        {/* Right Column */}
        <div className="space-y-8">
          <SystemStatus systems={systems} />
          <EquipmentStatus equipment={equipment} />
          <StreamingStats />
        </div>
      </div>

      {/* Quick Actions */}
      <QuickActions />
    </div>
  );
}
