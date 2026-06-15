import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true);
      checkSubscription();
    }
  }, []);

  const checkSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      setSubscription(sub);
      setIsSubscribed(!!sub);
    } catch (error) {
      console.error('Error checking subscription:', error);
    }
  };

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      toast({
        title: "Не поддерживается",
        description: "Ваш браузер не поддерживает push-уведомления",
        variant: "destructive",
      });
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        return true;
      } else if (permission === 'denied') {
        toast({
          title: "Доступ запрещён",
          description: "Разрешите уведомления в настройках браузера",
          variant: "destructive",
        });
        return false;
      }
      return false;
    } catch (error) {
      console.error('Error requesting permission:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось запросить разрешение",
        variant: "destructive",
      });
      return false;
    }
  }, [isSupported, toast]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      return false;
    }

    try {
      // Request permission first
      const hasPermission = await requestPermission();
      if (!hasPermission) {
        return false;
      }

      // Register service worker if not already registered
      let registration: ServiceWorkerRegistration;
      if (navigator.serviceWorker.controller) {
        registration = await navigator.serviceWorker.ready;
      } else {
        registration = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
      }

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          'BMzPJQpGkQZhKQj4WxLj3jF6XqN7YcT5rVbN8mK9pL0zA1sD2fG3hH4jJ5kK6lL7mM8nN9oO0pP1qQ2rR3sS4tT5uU6vV7wW8xX9yY0zZ'
        ),
      });

      setSubscription(subscription);
      setIsSubscribed(true);

      // Send subscription to server
      const subscriptionData: PushSubscriptionData = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: arrayBufferToBase64(subscription.getKey('p256dh')!),
          auth: arrayBufferToBase64(subscription.getKey('auth')!),
        },
      };

      // Save subscription to server
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(subscriptionData),
      });

      if (response.ok) {
        toast({
          title: "Успешно",
          description: "Push-уведомления включены",
        });
        return true;
      } else {
        throw new Error('Failed to save subscription');
      }
    } catch (error: any) {
      console.error('Error subscribing to push:', error);
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось подписаться на уведомления",
        variant: "destructive",
      });
      return false;
    }
  }, [isSupported, requestPermission, toast]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!subscription) {
      return false;
    }

    try {
      await subscription.unsubscribe();
      setSubscription(null);
      setIsSubscribed(false);

      // Remove subscription from server
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });

      toast({
        title: "Успешно",
        description: "Push-уведомления отключены",
      });
      return true;
    } catch (error: any) {
      console.error('Error unsubscribing from push:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось отписаться от уведомлений",
        variant: "destructive",
      });
      return false;
    }
  }, [subscription, toast]);

  return {
    isSupported,
    isSubscribed,
    subscribe,
    unsubscribe,
    requestPermission,
  };
}

// Helper functions
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

