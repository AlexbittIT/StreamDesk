import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  FolderPlus,
  Folder,
  FileText,
  Upload,
  RefreshCw,
  ChevronRight,
  HardDrive,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PodcastFolder {
  name: string;
}

interface FolderItem {
  name: string;
  type: "folder" | "file";
}

export default function Transcription() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedPodcast, setSelectedPodcast] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [newPodcastName, setNewPodcastName] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [uploading, setUploading] = useState(false);

  const { data: podcasts = [], isLoading: podcastsLoading, isError: podcastsError } = useQuery<PodcastFolder[]>({
    queryKey: ["/api/transcriptions/podcasts"],
    staleTime: 1000 * 60,
  });

  const { data: contents, isLoading: contentsLoading, isError: contentsError } = useQuery<{ folders: FolderItem[]; files: FolderItem[] }>({
    queryKey: ["/api/transcriptions/podcasts", selectedPodcast, currentPath],
    enabled: !!selectedPodcast,
    queryFn: async () => {
      const params = currentPath ? `?path=${encodeURIComponent(currentPath)}` : "";
      const res = await fetch(
        `/api/transcriptions/podcasts/${encodeURIComponent(selectedPodcast!)}/contents${params}`
      );
      if (!res.ok) {
        throw new Error("Не удалось загрузить содержимое папки");
      }
      return res.json();
    },
  });

  const createPodcastMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/transcriptions/podcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        throw new Error("Не удалось создать подкаст");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transcriptions/podcasts"] });
      setNewPodcastName("");
      toast({ title: "Готово", description: "Папка подкаста создана" });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось создать папку подкаста",
        variant: "destructive",
      });
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!selectedPodcast) return;
      const res = await fetch(
        `/api/transcriptions/podcasts/${encodeURIComponent(selectedPodcast)}/folders`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parentPath: currentPath, name }),
        }
      );
      if (!res.ok) {
        throw new Error("Не удалось создать папку");
      }
      return res.json();
    },
    onSuccess: () => {
      if (selectedPodcast) {
        queryClient.invalidateQueries({
          queryKey: ["/api/transcriptions/podcasts", selectedPodcast, currentPath],
        });
      }
      setNewFolderName("");
      toast({ title: "Готово", description: "Папка создана" });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось создать папку",
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedPodcast) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("podcast", selectedPodcast);
      formData.append("path", currentPath);

      const res = await fetch("/api/transcriptions/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Не удалось загрузить файл");
      }

      toast({ title: "Файл загружен", description: file.name });
      if (selectedPodcast) {
        queryClient.invalidateQueries({
          queryKey: ["/api/transcriptions/podcasts", selectedPodcast, currentPath],
        });
      }
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось загрузить файл",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const breadcrumbs = [
    { label: selectedPodcast || "Не выбран", path: "" },
    ...currentPath
      .split("/")
      .filter(Boolean)
      .map((segment, index, arr) => ({
        label: segment,
        path: arr.slice(0, index + 1).join("/"),
      })),
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Left: Podcasts list */}
      <Card className="lg:col-span-1">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-primary" />
            <CardTitle className="text-sm font-medium">Подкасты</CardTitle>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() =>
              queryClient.invalidateQueries({ queryKey: ["/api/transcriptions/podcasts"] })
            }
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Новый подкаст"
              value={newPodcastName}
              onChange={(e) => setNewPodcastName(e.target.value)}
            />
            <Button
              size="icon"
              onClick={() => newPodcastName.trim() && createPodcastMutation.mutate(newPodcastName)}
              disabled={createPodcastMutation.isPending || !newPodcastName.trim()}
            >
              <FolderPlus className="w-4 h-4" />
            </Button>
          </div>

          <Separator />

          <ScrollArea className="h-[320px]">
            <div className="space-y-1">
              {podcastsLoading && (
                <div className="text-sm text-muted-foreground px-1 py-2">
                  Загрузка списка подкастов...
                </div>
              )}
              {podcastsError && !podcastsLoading && (
                <div className="text-sm text-red-500 px-1 py-2">
                  Не удалось загрузить список подкастов. Попробуйте обновить.
                </div>
              )}
              {!podcastsLoading && !podcastsError && podcasts.length === 0 && (
                <div className="text-sm text-muted-foreground px-1 py-2">
                  Пока нет ни одного подкаста
                </div>
              )}
              {podcasts.map((podcast) => (
                <button
                  key={podcast.name}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-muted",
                    selectedPodcast === podcast.name && "bg-primary/10 text-primary"
                  )}
                  onClick={() => {
                    setSelectedPodcast(podcast.name);
                    setCurrentPath("");
                  }}
                >
                  <Folder className="w-4 h-4" />
                  <span className="truncate">{podcast.name}</span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Right: Contents */}
      <Card className="lg:col-span-3">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">
              {selectedPodcast ? "Содержимое подкаста" : "Выберите подкаст слева"}
            </CardTitle>

            {selectedPodcast && (
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center">
                  <input
                    type="file"
                    className="hidden"
                    onChange={handleFileUpload}
                    accept=".pdf,.doc,.docx,.txt,.mp3,.wav,.m4a,.zip,.rar,.7z"
                    disabled={uploading}
                  />
                  <Button
                    size="sm"
                    className="flex items-center gap-2"
                    asChild
                    disabled={uploading}
                  >
                    <span>
                      <Upload className="w-4 h-4 mr-1 inline-block" />
                      {uploading ? "Загрузка..." : "Загрузить файл"}
                    </span>
                  </Button>
                </label>
              </div>
            )}
          </div>

          {selectedPodcast && (
            <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {breadcrumbs.map((crumb, index) => (
                <span key={crumb.path || index} className="flex items-center">
                  {index > 0 && <ChevronRight className="w-3 h-3 mx-1" />}
                  {index === breadcrumbs.length - 1 ? (
                    <span className="font-medium">{crumb.label}</span>
                  ) : (
                    <button
                      className="hover:underline"
                      onClick={() => {
                        if (index === 0) {
                          setCurrentPath("");
                        } else {
                          setCurrentPath(crumb.path);
                        }
                      }}
                    >
                      {crumb.label}
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {!selectedPodcast && (
            <div className="text-sm text-muted-foreground">
              Выберите или создайте подкаст в списке слева, чтобы управлять папками и файлами.
            </div>
          )}

          {selectedPodcast && (
            <>
              {contentsLoading && (
                <div className="text-sm text-muted-foreground">
                  Загрузка содержимого...
                </div>
              )}
              {contentsError && !contentsLoading && (
                <div className="text-sm text-red-500">
                  Не удалось загрузить содержимое. Попробуйте обновить страницу или выбрать подкаст заново.
                </div>
              )}

              <div className="flex gap-2">
                <Input
                  placeholder="Новая папка внутри текущей"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                />
                <Button
                  size="icon"
                  onClick={() => newFolderName.trim() && createFolderMutation.mutate(newFolderName)}
                  disabled={createFolderMutation.isPending || !newFolderName.trim()}
                >
                  <FolderPlus className="w-4 h-4" />
                </Button>
              </div>

              <Separator />

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">Папки</div>
                  <div className="space-y-1">
                    {contents?.folders.length === 0 && (
                      <div className="text-sm text-muted-foreground">Нет вложенных папок</div>
                    )}
                    {contents?.folders.map((folder) => (
                      <button
                        key={folder.name}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-muted"
                        onClick={() =>
                          setCurrentPath(
                            currentPath ? `${currentPath}/${folder.name}` : folder.name
                          )
                        }
                      >
                        <Folder className="w-4 h-4 text-amber-500" />
                        <span className="truncate">{folder.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">Файлы</div>
                  <div className="space-y-1">
                    {contents?.files.length === 0 && (
                      <div className="text-sm text-muted-foreground">Файлы не загружены</div>
                    )}
                    {contents?.files.map((file) => (
                      <div
                        key={file.name}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm border border-transparent hover:border-muted"
                      >
                        <FileText className="w-4 h-4 text-blue-500" />
                        <span className="truncate">{file.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


