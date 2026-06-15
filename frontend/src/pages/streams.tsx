import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Activity,
  ExternalLink,
  Gauge,
  Link as LinkIcon,
  MessageSquare,
  Plus,
  Radio,
  ShieldAlert,
  Trash2,
  Users,
  Video,
  Youtube,
} from "lucide-react";
import { SiVk } from "react-icons/si";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type StreamComment = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
};

const PROFANITY_PATTERNS = [
  /бля/i,
  /сука/i,
  /хуй/i,
  /пизд/i,
  /еба/i,
  /ёба/i,
  /fuck/i,
  /shit/i,
];

function detectPlatform(url: string) {
  const value = url.toLowerCase();
  if (value.includes("youtube.com") || value.includes("youtu.be")) return "youtube";
  if (value.includes("vk.com") || value.includes("vkvideo.ru")) return "vk";
  if (value.includes("twitch.tv")) return "twitch";
  return "custom";
}

function getStreamUrl(stream: any) {
  const metadata = stream?.metadata && typeof stream.metadata === "object" ? stream.metadata : {};
  return String(metadata.url || metadata.streamUrl || "");
}

function getComments(stream: any): StreamComment[] {
  const metadata = stream?.metadata && typeof stream.metadata === "object" ? stream.metadata : {};
  return Array.isArray(metadata.comments) ? metadata.comments : [];
}

function hasProfanity(text: string) {
  return PROFANITY_PATTERNS.some((pattern) => pattern.test(text));
}

function getStatusText(status: string) {
  switch (status) {
    case "live":
    case "active":
      return "В эфире";
    case "preparing":
      return "Подготовка";
    case "ended":
      return "Завершён";
    case "offline":
      return "Нет данных";
    default:
      return status || "Нет данных";
  }
}

function getStatusClass(status: string) {
  switch (status) {
    case "live":
    case "active":
      return "bg-red-500/15 text-red-600 border-red-500/30";
    case "preparing":
      return "bg-amber-500/15 text-amber-600 border-amber-500/30";
    case "ended":
      return "bg-slate-500/15 text-slate-600 border-slate-500/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function getPlatformIcon(platform: string) {
  switch (platform.toLowerCase()) {
    case "youtube":
      return <Youtube className="h-5 w-5 text-red-600" />;
    case "vk":
      return <SiVk className="h-5 w-5 text-blue-600" />;
    default:
      return <Video className="h-5 w-5 text-primary" />;
  }
}

function formatMetric(value: unknown, suffix = "") {
  if (value === null || value === undefined || value === "") return "нет данных";
  return `${value}${suffix}`;
}

export default function Streams() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [streamUrl, setStreamUrl] = useState("");
  const [streamTitle, setStreamTitle] = useState("");
  const [selectedStreamId, setSelectedStreamId] = useState<string>("");
  const [commentAuthor, setCommentAuthor] = useState("Модератор");
  const [commentText, setCommentText] = useState("");

  const { data: streams = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/streams"],
    refetchInterval: 15000,
  });

  const { data: youtubeStats } = useQuery<any>({
    queryKey: ["/api/integrations/youtube/stats"],
    refetchInterval: 15000,
  });

  const { data: vkStats } = useQuery<any>({
    queryKey: ["/api/integrations/vk/stats"],
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (!selectedStreamId && streams[0]?.id) {
      setSelectedStreamId(streams[0].id);
    }
  }, [streams, selectedStreamId]);

  const selectedStream = streams.find((stream: any) => stream.id === selectedStreamId) || streams[0];
  const selectedComments = getComments(selectedStream);
  const flaggedComments = selectedComments.filter((comment) => hasProfanity(comment.text));

  const createStreamMutation = useMutation({
    mutationFn: async () => {
      const url = streamUrl.trim();
      if (!url) throw new Error("Вставьте ссылку на стрим");
      const platform = detectPlatform(url);
      const title = streamTitle.trim() || new URL(url).hostname.replace(/^www\./, "");
      const response = await apiRequest("POST", "/api/streams", {
        title,
        platform,
        status: "offline",
        viewerCount: 0,
        metadata: {
          url,
          monitorMode: "link",
          comments: [],
        },
      });
      return response.json();
    },
    onSuccess: (stream: any) => {
      setStreamUrl("");
      setStreamTitle("");
      setSelectedStreamId(stream.id);
      queryClient.invalidateQueries({ queryKey: ["/api/streams"] });
      toast({ title: "Стрим добавлен", description: "Мониторинг будет показывать только реальные поступившие метрики." });
    },
    onError: (error: any) => {
      toast({ title: "Не удалось добавить стрим", description: error.message, variant: "destructive" });
    },
  });

  const updateCommentsMutation = useMutation({
    mutationFn: async (comments: StreamComment[]) => {
      if (!selectedStream?.id) throw new Error("Выберите стрим");
      const metadata = selectedStream.metadata && typeof selectedStream.metadata === "object" ? selectedStream.metadata : {};
      const response = await apiRequest("PUT", `/api/streams/${selectedStream.id}`, {
        metadata: {
          ...metadata,
          comments,
        },
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/streams"] });
    },
    onError: (error: any) => {
      toast({ title: "Комментарии", description: error.message || "Не удалось обновить комментарии", variant: "destructive" });
    },
  });

  const addComment = () => {
    const text = commentText.trim();
    if (!text) return;
    updateCommentsMutation.mutate([
      {
        id: crypto.randomUUID(),
        author: commentAuthor.trim() || "Гость",
        text,
        createdAt: new Date().toISOString(),
      },
      ...selectedComments,
    ]);
    setCommentText("");
  };

  const removeComment = (id: string) => {
    updateCommentsMutation.mutate(selectedComments.filter((comment) => comment.id !== id));
  };

  const totals = useMemo(() => {
    const active = streams.filter((stream: any) => ["live", "active"].includes(String(stream.status)));
    const viewers = streams.reduce((sum: number, stream: any) => sum + (Number(stream.viewerCount) || 0), 0);
    return { active: active.length, viewers };
  }, [streams]);

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Загрузка стримов...</div>;
  }

  return (
    <div className="space-y-5 w-full min-w-0 max-w-full">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="grid gap-3 p-4 lg:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-2">
            <Label htmlFor="stream-url">Ссылка на стрим</Label>
            <div className="relative">
              <LinkIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="stream-url"
                value={streamUrl}
                onChange={(event) => setStreamUrl(event.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="stream-title">Название</Label>
            <Input
              id="stream-title"
              value={streamTitle}
              onChange={(event) => setStreamTitle(event.target.value)}
              placeholder="Например: Главный эфир"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={() => createStreamMutation.mutate()} disabled={createStreamMutation.isPending} className="w-full lg:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Добавить
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Стримов</p>
              <p className="mt-1 text-2xl font-semibold">{streams.length}</p>
            </div>
            <Video className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">В эфире</p>
              <p className="mt-1 text-2xl font-semibold">{totals.active}</p>
            </div>
            <Radio className="h-5 w-5 text-red-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Зрители</p>
              <p className="mt-1 text-2xl font-semibold">{totals.viewers.toLocaleString("ru-RU")}</p>
            </div>
            <Users className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Флаги чата</p>
              <p className="mt-1 text-2xl font-semibold text-red-600">{flaggedComments.length}</p>
            </div>
            <ShieldAlert className="h-5 w-5 text-red-500" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-5 w-5" />
              Мониторинг ссылок
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {streams.length === 0 ? (
              <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                Вставьте первую ссылку выше. Случайные показатели больше не подставляются.
              </div>
            ) : (
              streams.map((stream: any) => {
                const selected = stream.id === selectedStream?.id;
                return (
                  <button
                    key={stream.id}
                    type="button"
                    onClick={() => setSelectedStreamId(stream.id)}
                    className={cn(
                      "w-full rounded-lg border p-3 text-left transition-colors",
                      selected ? "border-primary bg-primary/5 ring-2 ring-primary/25" : "border-border hover:bg-muted/40",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {getPlatformIcon(stream.platform)}
                          <span className="truncate font-medium">{stream.title}</span>
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{getStreamUrl(stream) || stream.platform}</p>
                      </div>
                      <Badge variant="outline" className={cn("shrink-0", getStatusClass(stream.status))}>
                        {getStatusText(stream.status)}
                      </Badge>
                    </div>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {selectedStream ? (
            <>
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {getPlatformIcon(selectedStream.platform)}
                        {selectedStream.title}
                      </CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">{getStreamUrl(selectedStream) || "Ссылка не указана"}</p>
                    </div>
                    {getStreamUrl(selectedStream) && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={getStreamUrl(selectedStream)} target="_blank" rel="noreferrer">
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Открыть
                        </a>
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    ["Статус", getStatusText(selectedStream.status), Radio],
                    ["Зрители", formatMetric(selectedStream.viewerCount), Users],
                    ["Битрейт", formatMetric(selectedStream.bitrate, selectedStream.bitrate ? " kbps" : ""), Gauge],
                    ["FPS", formatMetric(selectedStream.fps), Activity],
                  ].map(([label, value, Icon]: any) => (
                    <div key={label} className="rounded-lg border bg-background/60 p-3">
                      <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                        <Icon className="h-4 w-4" />
                        {label}
                      </div>
                      <div className="text-lg font-semibold">{value}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MessageSquare className="h-5 w-5" />
                    Комментарии и модерация
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
                    <Input value={commentAuthor} onChange={(event) => setCommentAuthor(event.target.value)} placeholder="Автор" />
                    <Textarea
                      value={commentText}
                      onChange={(event) => setCommentText(event.target.value)}
                      placeholder="Комментарий из чата"
                      className="min-h-[42px]"
                    />
                    <Button type="button" onClick={addComment} disabled={!commentText.trim() || updateCommentsMutation.isPending}>
                      Добавить
                    </Button>
                  </div>

                  {selectedComments.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                      Комментариев пока нет. Когда будет подключён сбор комментариев платформы, они будут попадать сюда; пока можно вставлять спорные сообщения вручную.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedComments.map((comment) => {
                        const flagged = hasProfanity(comment.text);
                        return (
                          <div
                            key={comment.id}
                            className={cn(
                              "rounded-lg border p-3",
                              flagged ? "border-red-500/40 bg-red-500/10" : "border-border bg-background/60",
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium">{comment.author}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(comment.createdAt).toLocaleString("ru-RU")}
                                  </span>
                                  {flagged && <Badge variant="destructive">без цензуры</Badge>}
                                </div>
                                <p className="mt-1 whitespace-pre-wrap text-sm">{comment.text}</p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="shrink-0 text-muted-foreground hover:text-destructive"
                                onClick={() => removeComment(comment.id)}
                                disabled={updateCommentsMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Добавьте ссылку, чтобы открыть мониторинг стрима.
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Youtube className="h-5 w-5 text-red-600" />
              YouTube из сохранённых стримов
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Статус</span><span>{getStatusText(youtubeStats?.status)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Зрители</span><span>{youtubeStats?.viewers ?? 0}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Битрейт</span><span>{youtubeStats?.bitrate || "нет данных"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">FPS</span><span>{youtubeStats?.fps || "нет данных"}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SiVk className="h-5 w-5 text-blue-600" />
              VK из сохранённых стримов
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Статус</span><span>{getStatusText(vkStats?.status)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Зрители</span><span>{vkStats?.viewers ?? 0}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Битрейт</span><span>{vkStats?.bitrate || "нет данных"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">FPS</span><span>{vkStats?.fps || "нет данных"}</span></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
