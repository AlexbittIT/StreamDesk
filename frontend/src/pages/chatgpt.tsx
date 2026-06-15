import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Send, Loader2, Bot, User as UserIcon, AlertCircle, 
  Plus, Paperclip, X, FileIcon, Music, Image as ImageIcon, FileText, Download, Menu, MessageSquare
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiUrl } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  attachments?: Attachment[];
}

interface Attachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  transcription?: string; // для аудио файлов
}

interface ChatSession {
  id: string;
  title: string;
  modelId?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface LocalModel {
  id: string;
  name: string;
  description: string;
  status: "online" | "offline";
  endpoint: string;
}

export default function ChatGPT() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [newChatTitle, setNewChatTitle] = useState("");
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Загружаем пользователя из localStorage
  useEffect(() => {
    const userStr = localStorage.getItem('streamstudio_user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user && user.id) {
          setCurrentUser(user);
        } else {
          toast({
            title: "Ошибка авторизации",
            description: "Пожалуйста, войдите в систему",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error("Failed to parse user:", error);
        toast({
          title: "Ошибка",
          description: "Не удалось загрузить данные пользователя",
          variant: "destructive",
        });
      }
    } else {
      toast({
        title: "Требуется авторизация",
        description: "Пожалуйста, войдите в систему",
        variant: "destructive",
      });
    }
  }, []);

  const [models, setModels] = useState<LocalModel[]>([
    // Облачные модели Hugging Face Inference Providers (через router.huggingface.co)
    {
      id: "openai/gpt-oss-120b:fastest",
      name: "HF GPT-OSS 120B (fastest)",
      description: "Облачная модель Hugging Face (policy: fastest) через router.huggingface.co. Нужен HF_TOKEN / HUGGINGFACE_API_KEY.",
      status: "online",
      endpoint: "https://router.huggingface.co/v1/chat/completions",
    },
    {
      id: "openai/gpt-oss-120b:cheapest",
      name: "HF GPT-OSS 120B (cheapest)",
      description: "Та же модель GPT-OSS 120B, но с policy: cheapest — дешевле, может быть медленнее.",
      status: "online",
      endpoint: "https://router.huggingface.co/v1/chat/completions",
    },
    // Примеры локальных моделей (можно настроить свои TGI / Ollama / LM Studio и т.п.)
    {
      id: "local-llama",
      name: "Llama 3.1 (локально)",
      description: "Пример локальной модели Llama 3.1 (нужно запустить свой сервер /v1/chat/completions).",
      status: "offline",
      endpoint: "http://localhost:8080/v1/chat/completions",
    },
    {
      id: "local-mistral",
      name: "Mistral 7B (локально)",
      description: "Пример локальной модели Mistral 7B.",
      status: "offline",
      endpoint: "http://localhost:8081/v1/chat/completions",
    },
  ]);

  // Загрузка списка чатов
  const { data: chats = [], isLoading: chatsLoading } = useQuery<ChatSession[]>({
    queryKey: ["/api/chat/sessions", currentUser?.id],
    enabled: !!currentUser?.id,
    queryFn: async () => {
      if (!currentUser?.id) return [];
      try {
        const response = await apiRequest("GET", `/api/chat/sessions?userId=${currentUser.id}`);
        if (!response.ok) {
          throw new Error("Failed to fetch chats");
        }
        return response.json();
      } catch (error: any) {
        console.error("Error fetching chats:", error);
        toast({
          title: "Ошибка",
          description: "Не удалось загрузить список чатов",
          variant: "destructive",
        });
        return [];
      }
    },
  });

  // Загрузка сообщений выбранного чата (fetch вручную, чтобы при 404 не ломать UI и сбросить выбор)
  const { data: chatMessages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ["/api/chat/sessions", selectedChatId, "messages"],
    enabled: !!selectedChatId && !!currentUser?.id,
    retry: false,
    queryFn: async () => {
      if (!selectedChatId || !currentUser?.id) return [];
      const url = apiUrl(`/api/chat/sessions/${selectedChatId}/messages?userId=${currentUser.id}`);
      const response = await fetch(url, { method: "GET", credentials: "include" });
      if (response.status === 404) {
        setSelectedChatId(null);
        toast({
          title: "Чат не найден",
          description: "Сессия могла быть удалена. Выберите другой чат или создайте новый.",
          variant: "destructive",
        });
        return [];
      }
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Не удалось загрузить сообщения");
      }
      const data = await response.json();
      return (Array.isArray(data) ? data : []).map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp || msg.createdAt),
        attachments: msg.attachments || [],
      }));
    },
  });

  useEffect(() => {
    if (chatMessages.length > 0) {
      setMessages(chatMessages);
      setTimeout(scrollToBottom, 150);
    } else if (!selectedChatId) {
      setMessages([{
        id: "1",
        role: "assistant",
        content: "Привет! Я AI-ассистент. Создайте новый чат или выберите существующий, затем выберите модель и начните общение.",
        timestamp: new Date(),
      }]);
    }
  }, [chatMessages, selectedChatId]);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    });
  };

  const checkModelsStatus = async () => {
    const updatedModels = await Promise.all(
      models.map(async (model) => {
        // Для Hugging Face router health-конечная точка не используется — считаем модель доступной,
        // а ошибки покажем уже при реальном запросе.
        if (model.endpoint.includes("router.huggingface.co")) {
          return { ...model, status: "online" as const };
        }
        try {
          const response = await fetch(`${model.endpoint.replace('/v1/chat/completions', '/health')}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          });
          return { ...model, status: response.ok ? "online" : "offline" as const };
        } catch {
          return { ...model, status: "offline" as const };
        }
      })
    );
    setModels(updatedModels);
  };

  const createChatMutation = useMutation({
    mutationFn: async (title: string) => {
      if (!currentUser?.id) {
        throw new Error("Пользователь не авторизован");
      }
      const response = await apiRequest("POST", "/api/chat/sessions", { 
        userId: currentUser.id,
        title, 
        modelId: selectedModel 
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Не удалось создать чат" }));
        throw new Error(errorData.message || "Не удалось создать чат");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions", currentUser?.id] });
      setSelectedChatId(data.id);
      setMessages([]);
      setIsCreatingChat(false);
      setNewChatTitle("");
      toast({ title: "Чат создан", description: `Чат "${data.title}" успешно создан` });
    },
    onError: (error: any) => {
      toast({ 
        title: "Ошибка", 
        description: error.message || "Не удалось создать чат", 
        variant: "destructive" 
      });
    },
  });


  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachedFiles(prev => [...prev, ...files]);
    if (e.target) e.target.value = "";
  };

  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const getFileIcon = (file: File) => {
    const type = file.type;
    if (type.startsWith("image/")) return <ImageIcon className="w-4 h-4" />;
    if (type.startsWith("audio/")) return <Music className="w-4 h-4" />;
    if (type.startsWith("video/")) return <FileIcon className="w-4 h-4" />;
    return <FileText className="w-4 h-4" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const handleSend = async () => {
    if ((!input.trim() && attachedFiles.length === 0) || isLoading) return;
    if (!selectedModel) {
      toast({
        title: "Выберите модель",
        description: "Пожалуйста, выберите модель для общения",
        variant: "destructive",
      });
      return;
    }

    // Проверяем авторизацию
    if (!currentUser?.id) {
      toast({
        title: "Ошибка",
        description: "Пожалуйста, войдите в систему",
        variant: "destructive",
      });
      return;
    }

    // Создаём чат, если его нет
    let chatId = selectedChatId;
    if (!chatId) {
      // Используем первые 50 символов сообщения как название, или дефолтное название
      const messagePreview = input.trim().slice(0, 50);
      const title = messagePreview || `Чат ${new Date().toLocaleDateString('ru-RU', { 
        day: '2-digit', 
        month: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit' 
      })}`;
      
      try {
        const response = await apiRequest("POST", "/api/chat/sessions", { 
          userId: currentUser.id,
          title, 
          modelId: selectedModel 
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: "Не удалось создать чат" }));
          throw new Error(errorData.message || "Не удалось создать чат");
        }
        const newChat = await response.json();
        chatId = newChat.id;
        setSelectedChatId(chatId);
        queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions", currentUser.id] });
        toast({ 
          title: "Чат создан", 
          description: `Чат "${newChat.title}" успешно создан` 
        });
      } catch (error: any) {
        toast({
          title: "Ошибка",
          description: error.message || "Не удалось создать чат",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }
    }

    // Загружаем файлы, если есть
    const uploadedAttachments: Attachment[] = [];
    for (const file of attachedFiles) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("sessionId", chatId!);
        formData.append("userId", currentUser?.id || "");

        const uploadResponse = await apiRequest("POST", "/api/chat/upload", formData, true);
        const uploadData = await uploadResponse.json();
        uploadedAttachments.push({
          id: uploadData.id,
          name: file.name,
          url: uploadData.url,
          type: file.type,
          size: file.size,
          transcription: uploadData.transcription,
        });
      } catch (error: any) {
        toast({
          title: "Ошибка загрузки файла",
          description: `Не удалось загрузить ${file.name}: ${error.message}`,
          variant: "destructive",
        });
      }
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
      attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setAttachedFiles([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = '52px';
    }
    setIsLoading(true);
    setTimeout(scrollToBottom, 50);

    try {
      // Сохраняем сообщение пользователя
      await apiRequest("POST", `/api/chat/sessions/${chatId}/messages`, {
        userId: currentUser?.id,
        role: "user",
        content: input,
        attachments: uploadedAttachments,
      });

      const model = models.find((m) => m.id === selectedModel);
      if (!model || model.status === "offline") {
        throw new Error("Модель недоступна");
      }

      // Формируем контекст для модели
      const messagesForModel = [
        ...messages.map((m) => ({
          role: m.role,
          content: m.content + (m.attachments?.length ? `\n[Прикреплено файлов: ${m.attachments.length}]` : ""),
        })),
        {
          role: "user",
          content: input + (uploadedAttachments.length ? `\n[Прикреплено файлов: ${uploadedAttachments.length}]` : ""),
        },
      ];

      // Отправка запроса к локальной модели через API
      const response = await apiRequest("POST", "/api/chat/completions", {
        model: selectedModel,
        messages: messagesForModel,
        endpoint: model.endpoint,
      });

      const data = await response.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.content || data.message || "Извините, не удалось получить ответ",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setTimeout(scrollToBottom, 50);

      // Сохраняем ответ ассистента
      await apiRequest("POST", `/api/chat/sessions/${chatId}/messages`, {
        userId: currentUser?.id,
        role: "assistant",
        content: assistantMessage.content,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions", chatId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions", currentUser?.id] });
    } catch (error: any) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Ошибка: ${error.message || "Не удалось подключиться к модели. Убедитесь, что локальная модель запущена."}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      setTimeout(scrollToBottom, 50);
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось получить ответ от модели",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChatSelect = (chatId: string) => {
    setSelectedChatId(chatId);
    setAttachedFiles([]);
    setInput("");
  };

  const handleCreateChat = () => {
    if (newChatTitle.trim()) {
      createChatMutation.mutate(newChatTitle.trim());
    } else if (isCreatingChat) {
      // Если поле ввода открыто, но название не введено, создаем с дефолтным названием
      const defaultTitle = `Чат ${new Date().toLocaleDateString('ru-RU', { 
        day: '2-digit', 
        month: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit' 
      })}`;
      createChatMutation.mutate(defaultTitle);
    } else {
      // Открываем поле ввода
      setIsCreatingChat(true);
    }
  };

  // Если пользователь не загружен, показываем сообщение
  if (!currentUser?.id) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-xl border-2">
          <CardContent className="pt-8 pb-8 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-amber-500" />
            <h3 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">Требуется авторизация</h3>
            <p className="text-muted-foreground mb-6">
              Пожалуйста, войдите в систему для использования AI Ассистента.
            </p>
            <Button onClick={() => window.location.href = "/login"} className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white">
              Войти
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <div className="container max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        {/* Заголовок в стиле приложения */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent flex items-center gap-2">
              <MessageSquare className="w-8 h-8 text-purple-500" />
              AI Ассистент
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">
              Локальные модели и чаты — общение с AI в едином стиле
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row h-[calc(100vh-11rem)] min-h-[320px] rounded-xl overflow-hidden shadow-xl border border-slate-200/80 dark:border-slate-700/80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm relative flex-1">
      {/* Боковая панель с чатами */}
      <div className={`${sidebarOpen ? 'block' : 'hidden'} sm:block absolute sm:relative z-50 sm:z-auto w-full sm:w-72 flex-shrink-0 flex flex-col border-r border-slate-200/80 dark:border-slate-700/80 bg-slate-50/80 dark:bg-slate-900/80 h-full min-h-0`}>
        <div className="p-3 sm:p-4 border-b border-slate-200/80 dark:border-slate-700/80 flex flex-nowrap items-center gap-2 min-w-0">
          <Button
            size="sm"
            onClick={handleCreateChat}
            className="flex-1 min-w-0 justify-center sm:justify-start gap-2 h-9 sm:h-10 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-md hover:shadow-lg transition-all duration-200 border-0 text-sm font-medium shrink-0"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span className="truncate">Новый чат</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(false)}
            className="sm:hidden h-9 w-9 p-0 shrink-0 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {isCreatingChat && (
          <div className="p-3 sm:p-4 border-b border-slate-200/80 dark:border-slate-800/80 space-y-3 bg-white dark:bg-slate-900">
            <Input
              placeholder="Введите название чата..."
              value={newChatTitle}
              onChange={(e) => setNewChatTitle(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  handleCreateChat();
                }
                if (e.key === "Escape") {
                  setIsCreatingChat(false);
                  setNewChatTitle("");
                }
              }}
              className="h-9 text-sm border-slate-300 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 w-full"
              autoFocus
            />
            <div className="flex flex-nowrap gap-2">
              <Button
                size="sm"
                onClick={handleCreateChat}
                className="h-9 flex-1 min-w-0 text-sm bg-blue-600 hover:bg-blue-700 text-white shrink-0"
                disabled={createChatMutation.isPending}
              >
                {createChatMutation.isPending ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-2 animate-spin shrink-0" />
                    <span className="truncate">Создание...</span>
                  </>
                ) : (
                  "Создать"
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsCreatingChat(false);
                  setNewChatTitle("");
                }}
                className="h-9 shrink-0 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                disabled={createChatMutation.isPending}
              >
                Отмена
              </Button>
            </div>
          </div>
        )}

        <ScrollArea className="flex-1">
          <div className="p-2 sm:p-3">
            {chatsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : chats.length === 0 ? (
              <div className="text-center py-12 px-4">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <FileText className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Нет чатов
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-500">
                  Создайте новый чат для начала общения
                </p>
              </div>
            ) : (
              chats.map((chat) => (
                <div
                  key={chat.id}
                  className={cn(
                    "flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer group mb-1.5 transition-all duration-200",
                    selectedChatId === chat.id
                      ? "bg-gradient-to-r from-blue-50 to-blue-100/50 dark:from-blue-900/30 dark:to-blue-800/20 border border-blue-200 dark:border-blue-800 shadow-sm"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent"
                  )}
                  onClick={() => {
                    handleChatSelect(chat.id);
                    setSidebarOpen(false);
                  }}
                >
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <div className={cn(
                      "w-2 h-2 rounded-full flex-shrink-0",
                      selectedChatId === chat.id ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"
                    )} />
                    <p className="text-sm text-slate-900 dark:text-slate-100 truncate font-medium">
                      {chat.title.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim() || chat.title}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-opacity flex-shrink-0"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!currentUser?.id) {
                        toast({
                          title: "Ошибка",
                          description: "Пользователь не авторизован",
                          variant: "destructive",
                        });
                        return;
                      }
                      try {
                        await apiRequest("DELETE", `/api/chat/sessions/${chat.id}?userId=${currentUser.id}`);
                        queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions", currentUser.id] });
                        if (selectedChatId === chat.id) {
                          setSelectedChatId(null);
                          setMessages([]);
                        }
                        toast({ title: "Чат удалён" });
                      } catch (error: any) {
                        toast({ 
                          title: "Ошибка", 
                          description: error.message || "Не удалось удалить чат", 
                          variant: "destructive" 
                        });
                      }
                    }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Основная область чата */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-white dark:bg-slate-900/50">
        {/* Header с выбором модели */}
        <div className="border-b border-slate-200/80 dark:border-slate-700/80 px-3 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-2 sm:gap-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="sm:hidden h-9 w-9 p-0 shrink-0 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Menu className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <div className="w-9 h-9 shrink-0 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-md">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 block truncate">AI Ассистент</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 block">Готов к общению</span>
              </div>
            </div>
          </div>
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger className="w-full min-w-[140px] max-w-[200px] sm:w-[200px] h-9 text-sm border-slate-300 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 shrink-0">
              <SelectValue placeholder="Выберите модель" />
            </SelectTrigger>
            <SelectContent>
              {models.map((model) => (
                <SelectItem 
                  key={model.id} 
                  value={model.id} 
                  disabled={model.status === "offline"}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={cn(
                      "w-2.5 h-2.5 rounded-full",
                      model.status === "online" ? "bg-green-500 shadow-sm shadow-green-500/50" : "bg-gray-400"
                    )} />
                    <span className="text-sm font-medium">{model.name}</span>
                    {model.status === "offline" && (
                      <span className="text-xs text-slate-400 ml-auto">Недоступна</span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Чат */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden hide-scrollbar bg-gradient-to-b from-white via-slate-50/50 to-white dark:from-slate-900 dark:via-slate-950/50 dark:to-slate-900 overscroll-contain">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8">
            {messagesLoading ? (
              <div className="flex items-center justify-center py-16">
                  <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">Загрузка сообщений...</p>
                </div>
              </div>
            ) : (
              <>
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex gap-4 sm:gap-5 group",
                      message.role === "user" ? "flex-row-reverse" : ""
                    )}
                  >
                    {/* Аватар */}
                    <div className={cn(
                      "flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shadow-md",
                      message.role === "user" 
                        ? "bg-gradient-to-br from-blue-500 to-blue-600" 
                        : "bg-gradient-to-br from-slate-700 to-slate-800 dark:from-slate-600 dark:to-slate-700"
                    )}>
                      {message.role === "user" ? (
                        <UserIcon className="w-5 h-5 text-white" />
                      ) : (
                        <Bot className="w-5 h-5 text-white" />
                      )}
                    </div>
                    
                    {/* Сообщение */}
                    <div className="flex-1 min-w-0">
                      {/* Файлы */}
                      {message.attachments && message.attachments.length > 0 && (
                        <div className="mb-2 sm:mb-3 space-y-2">
                          {message.attachments.map((attachment) => (
                            <div
                              key={attachment.id}
                              className="flex items-center gap-2 p-1.5 sm:p-2 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750 transition-colors"
                            >
                              <div className="text-slate-500 dark:text-slate-400">
                                {getFileIcon({ type: attachment.type } as File)}
                              </div>
                              <a
                                href={attachment.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                download={attachment.name}
                                className="flex-1 text-xs sm:text-sm text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 truncate"
                              >
                                {attachment.name}
                              </a>
                              <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                                {formatFileSize(attachment.size)}
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-5 w-5 sm:h-6 sm:w-6 p-0"
                                onClick={() => {
                                  const link = document.createElement('a');
                                  link.href = attachment.url;
                                  link.download = attachment.name;
                                  link.click();
                                }}
                                title="Скачать файл"
                              >
                                <Download className="w-3 h-3" />
                              </Button>
                            </div>
                          ))}
                          {message.attachments.some(a => a.transcription) && (
                            <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 flex items-center gap-1.5">
                                <FileText className="w-3.5 h-3.5" />
                                Транскрипция:
                              </p>
                              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                                {message.attachments.find(a => a.transcription)?.transcription}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Текст сообщения */}
                    <div className={cn(
                      "leading-relaxed whitespace-pre-wrap text-sm sm:text-base break-words rounded-2xl px-4 py-3 shadow-sm",
                      message.role === "user"
                          ? "bg-gradient-to-br from-blue-500 to-purple-600 text-white"
                          : "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700"
                      )}>
                        {message.content.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim() || message.content}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
            {isLoading && (
              <div className="flex gap-4 sm:gap-5">
                <div className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-800 dark:from-slate-600 dark:to-slate-700 shadow-md">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 bg-white dark:bg-slate-800 rounded-2xl px-4 py-3 border border-slate-200 dark:border-slate-700 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                    <span className="text-sm text-slate-500 dark:text-slate-400">Печатает...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-slate-200/80 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-lg">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-5">
            {attachedFiles.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {attachedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs border border-slate-200 dark:border-slate-700 shadow-sm"
                  >
                    <div className="text-slate-500 dark:text-slate-400">
                      {getFileIcon(file)}
                    </div>
                    <span className="text-slate-700 dark:text-slate-300 truncate max-w-[120px] sm:max-w-[150px] font-medium">{file.name}</span>
                    <span className="text-slate-500 dark:text-slate-400 text-[10px]">
                      {formatFileSize(file.size)}
                    </span>
                    <button
                      onClick={() => removeFile(index)}
                      className="text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors ml-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-nowrap items-end gap-2 min-w-0">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading || !selectedModel}
                className="p-2.5 shrink-0 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Прикрепить файл"
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <div className="flex-1 min-w-0 flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    if (textareaRef.current) {
                      textareaRef.current.style.height = 'auto';
                      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Напишите сообщение..."
                  disabled={isLoading || !selectedModel}
                  rows={1}
                  className="flex-1 min-w-0 w-full px-4 py-3 text-sm sm:text-base border-2 border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  style={{ minHeight: '52px', maxHeight: '200px' }}
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={isLoading || (!input.trim() && attachedFiles.length === 0) || !selectedModel}
                  className="shrink-0 p-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 h-[52px] w-[52px] flex items-center justify-center"
                  title="Отправить"
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 text-center">
              AI может делать ошибки. Проверяйте важную информацию.
            </p>
          </div>
        </div>
      </div>
        </div>
      </div>
    </div>
  );
}
