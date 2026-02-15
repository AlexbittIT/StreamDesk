// Telegram Bot API Service для авторизации через Gateway
import crypto from "crypto";

const TELEGRAM_API_URL = "https://api.telegram.org/bot";

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

export class TelegramBotService {
  private botToken: string;
  private apiUrl: string;

  constructor(botToken?: string) {
    this.botToken = botToken || process.env.TELEGRAM_BOT_TOKEN || "";
    this.apiUrl = `${TELEGRAM_API_URL}${this.botToken}`;
  }

  /**
   * Проверяет, настроен ли бот
   */
  isConfigured(): boolean {
    return !!this.botToken;
  }

  /**
   * Отправляет сообщение пользователю через Telegram Bot API
   */
  async sendMessage(chatId: string | number, text: string, options?: {
    parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
    reply_markup?: any;
  }): Promise<boolean> {
    if (!this.isConfigured()) {
      console.warn("[Telegram Bot] Bot token not configured");
      return false;
    }

    try {
      const response = await fetch(`${this.apiUrl}/sendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          ...options,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ description: "Unknown error" }));
        console.error("[Telegram Bot] Failed to send message:", error);
        return false;
      }

      return true;
    } catch (error) {
      console.error("[Telegram Bot] Error sending message:", error);
      return false;
    }
  }

  /**
   * Получает информацию о пользователе по chat_id
   */
  async getUserInfo(chatId: string | number): Promise<TelegramUser | null> {
    if (!this.isConfigured()) {
      return null;
    }

    try {
      const response = await fetch(`${this.apiUrl}/getChat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
        }),
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      if (data.ok && data.result) {
        return {
          id: data.result.id,
          first_name: data.result.first_name,
          last_name: data.result.last_name,
          username: data.result.username,
        };
      }

      return null;
    } catch (error) {
      console.error("[Telegram Bot] Error getting user info:", error);
      return null;
    }
  }

  /**
   * Проверяет webhook (для будущего использования)
   */
  async setWebhook(url: string): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      const response = await fetch(`${this.apiUrl}/setWebhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
        }),
      });

      return response.ok;
    } catch (error) {
      console.error("[Telegram Bot] Error setting webhook:", error);
      return false;
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
  createCodeHash(code: string, telegramId: string, timestamp: number): string {
    const data = `${code}:${telegramId}:${timestamp}`;
    return crypto.createHash("sha256").update(data).digest("hex");
  }
}

// Экспортируем singleton
export const telegramBot = new TelegramBotService();

