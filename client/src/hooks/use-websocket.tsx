import { useEffect, useState, useRef } from "react";
import { queryClient } from "@/lib/queryClient";

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 10;
  const isConnectingRef = useRef(false);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const connect = () => {
      // Предотвращаем множественные попытки подключения
      if (isConnectingRef.current) {
        return;
      }

      // Если уже подключены или подключаемся, не делаем ничего
      if (wsRef.current?.readyState === WebSocket.OPEN || 
          wsRef.current?.readyState === WebSocket.CONNECTING) {
        return;
      }

      // Очищаем предыдущий таймаут переподключения
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      // Если превышено максимальное количество попыток, прекращаем попытки
      if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
        console.warn("[WebSocket] Max reconnection attempts reached, stopping reconnection");
        return;
      }

      isConnectingRef.current = true;
      
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log("[WebSocket] Connected successfully");
          setIsConnected(true);
          isConnectingRef.current = false;
          reconnectAttemptsRef.current = 0; // Сбрасываем счетчик при успешном подключении
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
                console.log("[WebSocket] Unknown message type:", data.type);
            }
          } catch (error) {
            console.error("[WebSocket] Error parsing message:", error);
          }
        };

        ws.onclose = (event) => {
          console.log("[WebSocket] Disconnected", event.code, event.reason);
          setIsConnected(false);
          isConnectingRef.current = false;
          
          // Экспоненциальная задержка: 1s, 2s, 4s, 8s, 16s, 30s (макс)
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current++;
          
          console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (wsRef.current?.readyState === WebSocket.CLOSED || 
                wsRef.current?.readyState === WebSocket.CLOSING ||
                !wsRef.current) {
              connect();
            }
          }, delay);
        };

        ws.onerror = (error) => {
          console.error("[WebSocket] Connection error:", error);
          setIsConnected(false);
          isConnectingRef.current = false;
          // onclose будет вызван автоматически, там обработаем переподключение
        };

      } catch (error) {
        console.error("[WebSocket] Failed to create connection:", error);
        setIsConnected(false);
        isConnectingRef.current = false;
        
        // Повторная попытка через задержку
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current++;
        
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      }
    };

    // Начальное подключение
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
        } catch (error) {
          console.error("[WebSocket] Error closing connection:", error);
        }
        wsRef.current = null;
      }
      
      isConnectingRef.current = false;
    };
  }, []);

  return { isConnected };
}
