import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";

interface SystemStatusProps {
  systems?: any[];
}

export default function SystemStatus({ systems }: SystemStatusProps) {
  const { data: activeStreams } = useQuery({
    queryKey: ["/api/streams", "active=true"],
  });

  // Mock stream parameters for active streams
  const streamParams = {
    bitrate: Math.floor(Math.random() * 1000) + 5000,
    fps: 60,
    quality: "Отличное"
  };

  return (
    <Card className="card-shadow">
      <CardHeader>
        <CardTitle>Статус системы</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {systems?.map((system) => (
            <div key={system.id} className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`w-3 h-3 rounded-full ${
                  system.status === 'online' 
                    ? 'bg-green-500 status-online' 
                    : 'bg-red-500 status-offline'
                }`}></div>
                <span className="text-sm text-gray-900">{system.name}</span>
              </div>
              <span className={`text-xs ${
                system.status === 'online' ? 'text-gray-500' : 'text-red-600'
              }`}>
                {system.status === 'online' ? 'Онлайн' : 'Офлайн'}
              </span>
            </div>
          ))}
        </div>
        
        {activeStreams && activeStreams.length > 0 && (
          <div className="mt-6 pt-4 border-t border-gray-100">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Параметры стрима</h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Битрейт</span>
                <span className="text-sm font-medium text-gray-900">{streamParams.bitrate} kbps</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">FPS</span>
                <span className="text-sm font-medium text-gray-900">{streamParams.fps}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Качество</span>
                <span className="text-sm font-medium text-green-600">{streamParams.quality}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
