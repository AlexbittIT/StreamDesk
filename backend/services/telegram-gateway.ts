// Telegram Gateway API Service - официальный сервис Telegram для отправки SMS
// Стоимость: ~$0.01 (1-2 рубля) за сообщение
// Документация: https://core.telegram.org/gateway

import crypto from "crypto";

const TELEGRAM_GATEWAY_API_URL = "https://api.telegram.org/gateway";

export interface TelegramGatewayConfig {
  apiKey: string;
  apiSecret?: string;
}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class TelegramGatewayService {
  private apiKey: string;
  private apiSecret?: string;
  private apiUrl: string;

  constructor(config?: TelegramGatewayConfig) {
    this.apiKey = config?.apiKey || process.env.TELEGRAM_GATEWAY_API_KEY || "";
    this.apiSecret = config?.apiSecret || process.env.TELEGRAM_GATEWAY_API_SECRET || "";
    this.apiUrl = TELEGRAM_GATEWAY_API_URL;
  }

  /**
   * Проверяет, настроен ли Gateway
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Отправляет код авторизации через Telegram Gateway
   * @param phoneNumber Номер телефона в формате +79001234567
   * @param code 6-значный код авторизации
   * @returns Результат отправки
   */
  async sendAuthCode(phoneNumber: string, code: string): Promise<SendMessageResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: "Telegram Gateway не настроен. Добавьте TELEGRAM_GATEWAY_API_KEY в .env",
      };
    }

    // Форматируем номер телефона (убираем пробелы, дефисы, скобки)
    const formattedPhone = phoneNumber.replace(/[\s\-\(\)]/g, "");
    
    // Проверяем формат номера
    if (!formattedPhone.match(/^\+?[1-9]\d{10,14}$/)) {
      return {
        success: false,
        error: "Неверный формат номера телефона. Используйте формат: +79001234567",
      };
    }

    // Формируем сообщение
    const message = `Ваш код авторизации для StreamDesk: ${code}\n\nКод действителен 10 минут.`;

    try {
      // Отправляем запрос в Telegram Gateway API
      const response = await fetch(`${this.apiUrl}/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
          ...(this.apiSecret && { "X-API-Secret": this.apiSecret }),
        },
        body: JSON.stringify({
          phone: formattedPhone,
          message: message,
          type: "auth_code", // Тип сообщения для статистики
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ 
          error: `HTTP ${response.status}: ${response.statusText}` 
        }));
        
        console.error("[Telegram Gateway] Failed to send message:", errorData);
        
        return {
          success: false,
          error: errorData.error || errorData.message || "Не удалось отправить сообщение",
        };
      }

      const data = await response.json();
      
      return {
        success: true,
        messageId: data.message_id || data.id,
      };
    } catch (error: any) {
      console.error("[Telegram Gateway] Error sending message:", error);
      return {
        success: false,
        error: error.message || "Ошибка при отправке сообщения",
      };
    }
  }

  /**
   * Проверяет статус отправленного сообщения
   */
  async checkMessageStatus(messageId: string): Promise<{
    status: "sent" | "delivered" | "failed" | "unknown";
    error?: string;
  }> {
    if (!this.isConfigured()) {
      return { status: "unknown", error: "Gateway не настроен" };
    }

    try {
      const response = await fetch(`${this.apiUrl}/status/${messageId}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          ...(this.apiSecret && { "X-API-Secret": this.apiSecret }),
        },
      });

      if (!response.ok) {
        return { status: "unknown", error: "Не удалось проверить статус" };
      }

      const data = await response.json();
      return {
        status: data.status || "unknown",
      };
    } catch (error: any) {
      console.error("[Telegram Gateway] Error checking status:", error);
      return { status: "unknown", error: error.message };
    }
  }

  /**
   * Генерирует безопасный код авторизации
   */
  generateAuthCode(): string {
    // Генерируем 6-значный код
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Создает hash для проверки кода
   */
  createCodeHash(code: string, phoneNumber: string, timestamp: number): string {
    const data = `${code}:${phoneNumber}:${timestamp}`;
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  /**
   * Получает баланс аккаунта (если API поддерживает)
   */
  async getBalance(): Promise<{ balance?: number; currency?: string; error?: string }> {
    if (!this.isConfigured()) {
      return { error: "Gateway не настроен" };
    }

    try {
      const response = await fetch(`${this.apiUrl}/balance`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          ...(this.apiSecret && { "X-API-Secret": this.apiSecret }),
        },
      });

      if (!response.ok) {
        return { error: "Не удалось получить баланс" };
      }

      const data = await response.json();
      return {
        balance: data.balance,
        currency: data.currency || "USD",
      };
    } catch (error: any) {
      console.error("[Telegram Gateway] Error getting balance:", error);
      return { error: error.message };
    }
  }
}

// Экспортируем singleton
export const telegramGateway = new TelegramGatewayService();

