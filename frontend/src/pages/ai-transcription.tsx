import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Mic,
  Download,
  Loader2,
  AlertCircle,
  CheckCircle2,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TranscriptionResult {
  success: boolean;
  transcription: string;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
    speaker?: string;
    speakerLabel?: string;
  }>;
  language?: string;
  format: string;
  speakerCount?: number;
  file?: {
    url: string;
    name: string;
    size: number;
    mimeType: string;
  };
  chatMessageId?: string; // ID сообщения в чате
}

export default function AITranscription() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [transcribing, setTranscribing] = useState(false);
  const [transcriptionFormat, setTranscriptionFormat] = useState<"txt" | "doc" | "pdf">("pdf");
  const [transcriptionLanguage, setTranscriptionLanguage] = useState("ru");
  const [numSpeakers, setNumSpeakers] = useState<string>("");
  const [enableDiarization, setEnableDiarization] = useState(true);
  const [transcriptionResult, setTranscriptionResult] = useState<TranscriptionResult | null>(null);
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);
  const [connectionChecked, setConnectionChecked] = useState(false);

  // Проверка подключения только по кнопке «Подключиться» — без авто-повторов
  const { refetch: checkHealth, isFetching: isChecking } = useQuery({
    queryKey: ["/api/ai-transcription/health"],
    queryFn: async () => {
      const res = await fetch("/api/ai-transcription/health");
      const data = await res.json().catch(() => ({}));
      return !!data?.available;
    },
    enabled: false,
    retry: false,
    staleTime: 60000,
  });

  const handleCheckConnection = async () => {
    setConnectionChecked(true);
    try {
      const result = await checkHealth();
      const available = result.data === true;
      setApiAvailable(available);
      if (available) {
        toast({ title: "Подключено", description: "Сервис транскрибации доступен" });
      } else {
        toast({ title: "Недоступно", description: "Whisper X API не настроен или не запущен", variant: "destructive" });
      }
    } catch {
      setApiAvailable(false);
      toast({ title: "Ошибка", description: "Не удалось проверить подключение", variant: "destructive" });
    }
  };

  async function handleTranscribe(file: File) {
    setTranscribing(true);
    setTranscriptionResult(null);

    try {
      // Получаем текущего пользователя и активный чат (если есть)
      const userStr = localStorage.getItem('streamstudio_user');
      const user = userStr ? JSON.parse(userStr) : null;
      const activeChatId = sessionStorage.getItem('active_chat_id');

      const formData = new FormData();
      formData.append("file", file);
      formData.append("format", transcriptionFormat);
      formData.append("language", transcriptionLanguage);
      formData.append("diarize", enableDiarization.toString());
      if (numSpeakers && numSpeakers.trim() !== "") {
        formData.append("numSpeakers", numSpeakers);
      }
      if (user?.id) {
        formData.append("userId", user.id);
      }
      if (activeChatId) {
        formData.append("chatSessionId", activeChatId);
      }

      const res = await fetch("/api/ai-transcription/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Не удалось транскрибировать файл");
      }

      const result = await res.json() as TranscriptionResult;
      setTranscriptionResult(result);

      toast({
        title: "Готово",
        description: `Транскрибация завершена. Файл сохранен в формате ${transcriptionFormat.toUpperCase()}.`,
      });
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось транскрибировать файл",
        variant: "destructive",
      });
    } finally {
      setTranscribing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Транскрибация через нейросеть</h1>
        <p className="text-muted-foreground mt-2">
          Загрузите аудио или видео файл для транскрибации с определением спикеров
        </p>
      </div>

      {/* Проверка подключения только по кнопке — без авто-повторов */}
      <Card className="border border-border">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-foreground">Сервис транскрибации (Whisper X)</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {connectionChecked
                  ? apiAvailable === true
                    ? "Подключено и готово к работе"
                    : "Недоступно — проверьте настройки сервера"
                  : "Нажмите «Подключиться», чтобы проверить доступность"}
              </p>
            </div>
            <Button
              variant={connectionChecked && apiAvailable ? "outline" : "default"}
              onClick={handleCheckConnection}
              disabled={isChecking}
            >
              {isChecking ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {connectionChecked && apiAvailable ? "Проверить снова" : "Подключиться"}
            </Button>
          </div>
          {connectionChecked && apiAvailable === false && (
            <p className="text-sm text-destructive mt-3">
              Whisper X API не подключен. Транскрибация недоступна.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Форма транскрибации */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mic className="w-5 h-5 text-primary" />
            <CardTitle>Транскрибация аудио/видео</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="transcription-file">Выберите файл</Label>
              <Input
                id="transcription-file"
                type="file"
                accept="audio/*,video/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleTranscribe(file);
                  }
                }}
                disabled={transcribing || (connectionChecked && apiAvailable === false)}
              />
              <p className="text-xs text-muted-foreground">
                Поддерживаются аудио и видео файлы
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="transcription-format">Формат вывода</Label>
              <Select
                value={transcriptionFormat}
                onValueChange={(value: "txt" | "doc" | "pdf") => setTranscriptionFormat(value)}
                disabled={transcribing || (connectionChecked && apiAvailable === false)}
              >
                <SelectTrigger id="transcription-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="doc">DOCX</SelectItem>
                  <SelectItem value="txt">TXT</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="transcription-language">Язык</Label>
              <Select
                value={transcriptionLanguage}
                onValueChange={setTranscriptionLanguage}
                disabled={transcribing || (connectionChecked && apiAvailable === false)}
              >
                <SelectTrigger id="transcription-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ru">Русский</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="auto">Автоопределение</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="enable-diarization">Диаризация спикеров</Label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="enable-diarization"
                  checked={enableDiarization}
                  onChange={(e) => setEnableDiarization(e.target.checked)}
                  disabled={transcribing || (connectionChecked && apiAvailable === false)}
                  className="w-4 h-4"
                />
                <label htmlFor="enable-diarization" className="text-sm text-muted-foreground">
                  Определять разных спикеров
                </label>
              </div>
            </div>

            {enableDiarization && (
              <div className="space-y-2">
                <Label htmlFor="num-speakers">Количество спикеров (опционально)</Label>
                <Input
                  id="num-speakers"
                  type="number"
                  min="1"
                  max="10"
                  placeholder="Автоопределение"
                  value={numSpeakers}
                  onChange={(e) => setNumSpeakers(e.target.value)}
                  disabled={transcribing || (connectionChecked && apiAvailable === false)}
                />
                <p className="text-xs text-muted-foreground">
                  Оставьте пустым для автоматического определения
                </p>
              </div>
            )}
          </div>

          {transcribing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Транскрибация в процессе... Это может занять несколько минут.</span>
            </div>
          )}

          {transcriptionResult && (
            <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Результат транскрибации</h3>
                <div className="flex gap-2">
                  {transcriptionResult.file && (
                    <Button
                      size="sm"
                      onClick={() => {
                        window.open(transcriptionResult.file!.url, "_blank");
                      }}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Скачать {transcriptionResult.format.toUpperCase()}
                    </Button>
                  )}
                  {transcriptionResult.chatMessageId && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        // Переход в чат с этим сообщением
                        window.location.href = `/chatgpt?message=${transcriptionResult.chatMessageId}`;
                      }}
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      Открыть в чате
                    </Button>
                  )}
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="text-sm">
                  <span className="font-medium">Язык:</span> {transcriptionResult.language}
                </div>
                <div className="text-sm">
                  <span className="font-medium">Формат:</span> {transcriptionResult.format.toUpperCase()}
                </div>
                {transcriptionResult.speakerCount && transcriptionResult.speakerCount > 0 && (
                  <div className="text-sm">
                    <span className="font-medium">Спикеров обнаружено:</span> {transcriptionResult.speakerCount}
                  </div>
                )}
                {transcriptionResult.file && (
                  <div className="text-sm">
                    <span className="font-medium">Размер файла:</span>{" "}
                    {(transcriptionResult.file.size / 1024).toFixed(2)} KB
                  </div>
                )}
              </div>

              {transcriptionResult.transcription && (
                <div className="mt-4 p-3 bg-background rounded border max-h-64 overflow-y-auto hide-scrollbar">
                  <p className="text-sm whitespace-pre-wrap">
                    {transcriptionResult.transcription}
                  </p>
                </div>
              )}

              {transcriptionResult.segments && transcriptionResult.segments.length > 0 && (
                <div className="mt-4 space-y-2">
                  <h4 className="font-semibold text-sm">Детальная транскрипция с спикерами:</h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto hide-scrollbar">
                    {transcriptionResult.segments.map((segment, index) => (
                      <div key={index} className="p-2 bg-background rounded border text-sm">
                        {segment.speakerLabel && (
                          <div className="font-semibold text-blue-600 mb-1">
                            {segment.speakerLabel}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground mb-1">
                          [{Math.floor(segment.start / 60)}:{(segment.start % 60).toFixed(1)} - {Math.floor(segment.end / 60)}:{(segment.end % 60).toFixed(1)}]
                        </div>
                        <div>{segment.text}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

