import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  FolderPlus,
  Folder,
  FileText,
  Upload,
  RefreshCw,
  ChevronRight,
  HardDrive,
  Trash2,
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
  const [expandedFolderPath, setExpandedFolderPath] = useState<string | null>(null);
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
      const res = await apiRequest(
        "GET",
        `/api/transcriptions/podcasts/${encodeURIComponent(selectedPodcast!)}/contents${params}`
      );
      return res.json();
    },
  });

  const { data: expandedContents, isLoading: expandedLoading } = useQuery<{ folders: FolderItem[]; files: FolderItem[] }>({
    queryKey: ["/api/transcriptions/podcasts", selectedPodcast, "expanded", expandedFolderPath],
    enabled: !!selectedPodcast && !!expandedFolderPath,
    queryFn: async () => {
      const params = expandedFolderPath ? `?path=${encodeURIComponent(expandedFolderPath)}` : "";
      const res = await apiRequest(
        "GET",
        `/api/transcriptions/podcasts/${encodeURIComponent(selectedPodcast!)}/contents${params}`
      );
      return res.json();
    },
  });

  const createPodcastMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/transcriptions/podcasts", { name });
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

  const deletePodcastMutation = useMutation({
    mutationFn: async (podcastName: string) => {
      await apiRequest("DELETE", `/api/transcriptions/podcasts/${encodeURIComponent(podcastName)}`);
    },
    onSuccess: (_, podcastName) => {
      queryClient.invalidateQueries({ queryKey: ["/api/transcriptions/podcasts"] });
      if (selectedPodcast === podcastName) {
        setSelectedPodcast(null);
        setCurrentPath("");
        setExpandedFolderPath(null);
      }
      toast({ title: "Удалено", description: "Подкаст удалён" });
    },
    onError: (error: any) => {
      toast({ title: "Ошибка", description: error.message || "Не удалось удалить подкаст", variant: "destructive" });
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!selectedPodcast) throw new Error("Выберите подкаст");
      const res = await apiRequest(
        "POST",
        `/api/transcriptions/podcasts/${encodeURIComponent(selectedPodcast)}/folders`,
        { parentPath: currentPath, name }
      );
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
      formData.append("podcast", selectedPodcast);
      formData.append("path", currentPath);
      formData.append("file", file);

      await apiRequest("POST", "/api/transcriptions/upload", formData, true);

      toast({ title: "Файл загружен", description: file.name });
      queryClient.invalidateQueries({
        queryKey: ["/api/transcriptions/podcasts", selectedPodcast, currentPath],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/transcriptions/podcasts", selectedPodcast, "expanded", expandedFolderPath],
      });
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

  const deleteItemMutation = useMutation({
    mutationFn: async ({ itemPath }: { itemPath: string; isFolder: boolean }) => {
      const deleteUrl = `/api/transcriptions/podcasts/${encodeURIComponent(selectedPodcast!)}/contents?path=${encodeURIComponent(itemPath)}`;
      await apiRequest("DELETE", deleteUrl);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transcriptions/podcasts", selectedPodcast, currentPath] });
      queryClient.invalidateQueries({ queryKey: ["/api/transcriptions/podcasts", selectedPodcast, "expanded", expandedFolderPath] });
      toast({ title: "Удалено" });
    },
    onError: (error: any) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  const handleDelete = (itemName: string, isFolder: boolean) => {
    if (!selectedPodcast) return;
    const itemPath = currentPath ? `${currentPath}/${itemName}` : itemName;
    if (!confirm(isFolder ? `Удалить папку «${itemName}» и всё её содержимое?` : `Удалить файл «${itemName}»?`)) return;
    deleteItemMutation.mutate({ itemPath, isFolder });
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
                <div
                  key={podcast.name}
                  className={cn(
                    "w-full flex items-center gap-1 group rounded-md text-sm",
                    selectedPodcast === podcast.name && "bg-primary/10 text-primary"
                  )}
                >
                  <button
                    className={cn(
                      "flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted text-left min-w-0"
                    )}
                    onClick={() => {
                      setSelectedPodcast(podcast.name);
                      setCurrentPath("");
                    }}
                  >
                    <Folder className="w-4 h-4 shrink-0" />
                    <span className="truncate">{podcast.name}</span>
                  </button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 opacity-70 hover:opacity-100 hover:text-destructive"
                    title="Удалить подкаст"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!confirm(`Удалить подкаст «${podcast.name}» и всё его содержимое?`)) return;
                      deletePodcastMutation.mutate(podcast.name);
                    }}
                    disabled={deletePodcastMutation.isPending}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
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

              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Папки — нажмите, чтобы открыть файлы</div>
                <div className="space-y-0">
                  {contents?.folders.length === 0 && contents?.files.length === 0 && (
                    <div className="text-sm text-muted-foreground py-2">Нет папок и файлов</div>
                  )}
                  {contents?.folders.map((folder) => {
                    const fullPath = currentPath ? `${currentPath}/${folder.name}` : folder.name;
                    const isExpanded = expandedFolderPath === fullPath;
                    return (
                      <div key={folder.name} className="rounded-md overflow-hidden group">
                        <div className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left hover:bg-muted transition-colors",
                          isExpanded && "bg-muted/70"
                        )}>
                          <button
                            type="button"
                            className="flex items-center gap-2 flex-1 min-w-0"
                            onClick={() => setExpandedFolderPath(isExpanded ? null : fullPath)}
                          >
                            <ChevronRight className={cn("w-4 h-4 shrink-0 text-amber-500 transition-transform", isExpanded && "rotate-90")} />
                            <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                            <span className="truncate">{folder.name}</span>
                          </button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 opacity-70 hover:opacity-100 hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); handleDelete(folder.name, true); }}
                            disabled={deleteItemMutation.isPending}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        {isExpanded && (
                          <div className="pl-6 pr-2 py-2 bg-muted/30 border-l-2 border-amber-500/40 ml-2 mb-2 rounded-r space-y-1">
                            {expandedLoading ? (
                              <div className="text-xs text-muted-foreground">Загрузка...</div>
                            ) : (
                              <>
                                {expandedContents?.files.map((file) => (
                                  <div key={file.name} className="flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-background/50 group/item">
                                    <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                                    <span className="truncate flex-1">{file.name}</span>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 shrink-0 opacity-70 hover:opacity-100 hover:text-destructive"
                                      onClick={() => handleDelete(`${fullPath}/${file.name}`, false)}
                                      disabled={deleteItemMutation.isPending}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </div>
                                ))}
                                {expandedContents?.folders?.map((sub) => (
                                  <div key={sub.name} className="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-muted-foreground group/item">
                                    <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                                    <span className="truncate flex-1">{sub.name}</span>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 shrink-0 opacity-70 hover:opacity-100 hover:text-destructive"
                                      onClick={() => handleDelete(`${fullPath}/${sub.name}`, true)}
                                      disabled={deleteItemMutation.isPending}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </div>
                                ))}
                                {!expandedLoading && (!expandedContents?.files?.length && !expandedContents?.folders?.length) && (
                                  <div className="text-xs text-muted-foreground">Пусто</div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="text-xs font-medium text-muted-foreground pt-2">Файлы в текущей папке</div>
                <div className="space-y-1">
                  {contents?.files.length === 0 && (
                    <div className="text-sm text-muted-foreground">Нет файлов</div>
                  )}
                  {contents?.files.map((file) => (
                    <div key={file.name} className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border border-transparent hover:border-muted group">
                      <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                      <span className="truncate flex-1">{file.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 opacity-70 hover:opacity-100 hover:text-destructive"
                        onClick={() => handleDelete(currentPath ? `${currentPath}/${file.name}` : file.name, false)}
                        disabled={deleteItemMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


