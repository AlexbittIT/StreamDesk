import { useEffect, useState, useRef } from "react";
import { queryClient } from "@/lib/queryClient";

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const isConnectingRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !localStorage.getItem("streamstudio_user")) {
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const connect = () => {
      if (isConnectingRef.current) return;
      if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) return;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (reconnectAttemptsRef.current >= maxReconnectAttempts) return;

      isConnectingRef.current = true;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
          isConnectingRef.current = false;
          reconnectAttemptsRef.current = 0;
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            switch (data.type) {
              case "systems_update":
                queryClient.setQueryData(["/api/systems"], data.data);
                break;
              case "streams_update":
                queryClient.setQueryData(["/api/streams", "active=true"], data.data);
                break;
              case "youtube_stats":
                queryClient.setQueryData(["/api/integrations/youtube/stats"], data.data);
                break;
              case "vk_stats":
                queryClient.setQueryData(["/api/integrations/vk/stats"], data.data);
                break;
              default:
                break;
            }
          } catch {
            /* ignore */
          }
        };

        ws.onclose = () => {
          setIsConnected(false);
          isConnectingRef.current = false;
          reconnectAttemptsRef.current++;
          // Переподключение только через 15–30 сек и не более 5 попыток — не мигает
          const delay = Math.min(15000 + reconnectAttemptsRef.current * 3000, 30000);
          if (reconnectAttemptsRef.current < maxReconnectAttempts) {
            reconnectTimeoutRef.current = setTimeout(() => {
              if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) connect();
            }, delay);
          }
        };

        ws.onerror = () => {
          setIsConnected(false);
          isConnectingRef.current = false;
        };
      } catch {
        setIsConnected(false);
        isConnectingRef.current = false;
        reconnectAttemptsRef.current++;
        const delay = 20000;
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectTimeoutRef.current = setTimeout(() => connect(), delay);
        }
      }
    };

    connect();

    return () => {
      // Очищаем таймаут переподключения
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      // Закрываем соединение
      if (wsRef.current) {
        try {
          if (wsRef.current.readyState === WebSocket.OPEN || 
              wsRef.current.readyState === WebSocket.CONNECTING) {
            wsRef.current.close();
          }
        } catch {
          // игнор при размонтировании
        }
        wsRef.current = null;
      }
      
      isConnectingRef.current = false;
    };
  }, []);

  return { isConnected };
}
