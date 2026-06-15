/**
 * Сервис для работы с удаленным Whisper X API
 * Поддерживает транскрибацию аудио и видео файлов
 */

interface WhisperXTranscriptionResponse {
  segments?: Array<{
    start: number;
    end: number;
    text: string;
    speaker?: string; // ID спикера (например, "SPEAKER_00", "SPEAKER_01")
  }>;
  text?: string;
  language?: string;
  speakers?: string[]; // Список ID спикеров
}

interface TranscriptionResult {
  text: string;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
    speaker?: string; // ID спикера
    speakerLabel?: string; // Человекочитаемый лейбл (Speaker 1, Speaker 2 и т.д.)
  }>;
  language?: string;
  speakers?: string[]; // Список ID спикеров
  speakerCount?: number; // Количество спикеров
}

export class WhisperXClient {
  private apiUrl: string;
  private apiKey?: string;
  private timeout: number;

  constructor() {
    // Не падаем если переменные окружения не установлены
    this.apiUrl = process.env.WHISPER_X_API_URL || "";
    this.apiKey = process.env.WHISPER_X_API_KEY;
    this.timeout = parseInt(process.env.WHISPER_X_TIMEOUT || "300000", 10); // 5 минут по умолчанию
  }

  /**
   * Проверяет, настроен ли API
   */
  isConfigured(): boolean {
    return !!this.apiUrl && this.apiUrl.trim() !== "";
  }

  /**
   * Транскрибирует аудио/видео файл через удаленный Whisper X API
   * @param filePath Путь к файлу на сервере
   * @param options Опции транскрибации
   * @returns Результат транскрибации
   */
  async transcribe(
    filePath: string,
    options: {
      language?: string;
      task?: "transcribe" | "translate";
      returnTimestamps?: boolean;
      numSpeakers?: number; // Количество спикеров для диаризации
      diarize?: boolean; // Включить диаризацию спикеров
    } = {}
  ): Promise<TranscriptionResult> {
    if (!this.isConfigured()) {
      throw new Error("Whisper X API не настроен. Установите переменную окружения WHISPER_X_API_URL.");
    }

    const FormData = (await import("form-data")).default;
    const fs = await import("fs/promises");

    try {
      // Читаем файл
      const fileBuffer = await fs.readFile(filePath);
      const fileName = filePath.split(/[/\\]/).pop() || "audio.mp3";

      // Создаем FormData
      const formData = new FormData();
      formData.append("file", fileBuffer, {
        filename: fileName,
        contentType: this.getContentType(fileName),
      });

      if (options.language) {
        formData.append("language", options.language);
      }

      if (options.task) {
        formData.append("task", options.task);
      }

      if (options.returnTimestamps !== undefined) {
        formData.append("return_timestamps", options.returnTimestamps.toString());
      }

      if (options.diarize !== undefined) {
        formData.append("diarize", options.diarize.toString());
      }

      if (options.numSpeakers !== undefined && options.numSpeakers > 0) {
        formData.append("num_speakers", options.numSpeakers.toString());
      }

      // Формируем URL API
      const url = `${this.apiUrl}/transcribe`;
      
      // Заголовки запроса
      const headers: Record<string, string> = {};
      if (this.apiKey) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
      }

      // Выполняем запрос с таймаутом
      // Используем node-fetch для Node.js
      const nodeFetch = (await import("node-fetch")).default;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await nodeFetch(url, {
          method: "POST",
          body: formData as any,
          headers: {
            ...headers,
            ...formData.getHeaders(),
          } as any,
          signal: controller.signal as any,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Whisper X API error: ${response.status} ${response.statusText} - ${errorText}`
          );
        }

        const data = (await response.json()) as WhisperXTranscriptionResponse;

        // Формируем результат
        const result: TranscriptionResult = {
          text: data.text || "",
          segments: data.segments?.map((seg) => {
            // Преобразуем ID спикера в человекочитаемый лейбл
            let speakerLabel: string | undefined;
            if (seg.speaker) {
              const speakerIndex = parseInt(seg.speaker.replace("SPEAKER_", "")) || 0;
              speakerLabel = `Спикер ${speakerIndex + 1}`;
            }
            
            return {
              start: seg.start,
              end: seg.end,
              text: seg.text,
              speaker: seg.speaker,
              speakerLabel,
            };
          }),
          language: data.language,
          speakers: data.speakers,
        };

        // Если есть сегменты, объединяем их в текст с указанием спикеров
        if (!result.text && data.segments && data.segments.length > 0) {
          if (options.diarize && data.segments.some(seg => seg.speaker)) {
            // Форматируем с указанием спикеров
            result.text = data.segments
              .map((seg) => {
                const speakerIndex = seg.speaker ? parseInt(seg.speaker.replace("SPEAKER_", "")) || 0 : null;
                const speakerLabel = speakerIndex !== null ? `Спикер ${speakerIndex + 1}` : "";
                return speakerLabel ? `[${speakerLabel}]: ${seg.text}` : seg.text;
              })
              .join(" ");
          } else {
            result.text = data.segments.map((seg) => seg.text).join(" ");
          }
        }

        // Подсчитываем количество уникальных спикеров
        if (data.segments) {
          const uniqueSpeakers = new Set(
            data.segments
              .map((seg) => seg.speaker)
              .filter((s): s is string => !!s)
          );
          result.speakerCount = uniqueSpeakers.size;
        }

        return result;
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === "AbortError") {
          throw new Error(
            `Whisper X API timeout after ${this.timeout}ms`
          );
        }
        throw error;
      }
    } catch (error: any) {
      console.error("[WhisperXClient] Transcription error:", error);
      throw new Error(
        `Failed to transcribe with Whisper X: ${error.message}`
      );
    }
  }

  /**
   * Определяет MIME тип по расширению файла
   */
  private getContentType(fileName: string): string {
    const ext = fileName.toLowerCase().split(".").pop();
    const mimeTypes: Record<string, string> = {
      mp3: "audio/mpeg",
      wav: "audio/wav",
      m4a: "audio/mp4",
      flac: "audio/flac",
      ogg: "audio/ogg",
      mp4: "video/mp4",
      avi: "video/x-msvideo",
      mov: "video/quicktime",
      mkv: "video/x-matroska",
      webm: "video/webm",
    };
    return mimeTypes[ext || ""] || "application/octet-stream";
  }

  /**
   * Проверяет доступность API
   */
  async healthCheck(): Promise<boolean> {
    try {
      const nodeFetch = (await import("node-fetch")).default;
      const url = `${this.apiUrl}/health`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await nodeFetch(url, {
          method: "GET",
          signal: controller.signal as any,
        } as any);

        clearTimeout(timeoutId);
        return response.ok;
      } catch (error: any) {
        clearTimeout(timeoutId);
        throw error;
      }
    } catch (error) {
      console.warn("[WhisperXClient] Health check failed:", error);
      return false;
    }
  }
}

// Экспортируем singleton instance
export const whisperXClient = new WhisperXClient();

