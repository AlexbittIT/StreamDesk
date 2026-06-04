import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Volume2, VolumeX, Settings2, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function formatTimecode(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
}

export default function OtisOnAir() {
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [timecode, setTimecode] = useState("00:00:00.00");
  const [muted, setMuted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [streamUrlInput, setStreamUrlInput] = useState("");
  const [srtInputUrl, setSrtInputUrl] = useState("");
  const [timecodeSourceInput, setTimecodeSourceInput] = useState<"local" | "vmix">("local");
  const [vmixHostInput, setVmixHostInput] = useState("localhost");
  const [vmixPortInput, setVmixPortInput] = useState("8088");
  const startTimeRef = useRef<number>(Date.now() / 1000);

  const { data: settings, isLoading: settingsLoading, isError: settingsError } = useQuery({
    queryKey: ["/api/otis"],
    retry: 1,
  });

  const updateOtis = useMutation({
    mutationFn: async (body: {
      streamUrl?: string; streamUrlBackup?: string; showTimecode?: boolean; withSound?: boolean;
      timecodeSource?: string; vmixHost?: string; vmixPort?: number;
    }) => {
      const res = await fetch("/api/otis", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/otis"] }),
  });

  useEffect(() => {
    startTimeRef.current = Date.now() / 1000;
  }, []);

  const timecodeSource = settings?.timecodeSource || "local";
  const vmixHost = settings?.vmixHost || "localhost";
  const vmixPort = settings?.vmixPort ?? 8088;

  useEffect(() => {
    if (settings) {
      setTimecodeSourceInput((settings.timecodeSource as "local" | "vmix") || "local");
      setVmixHostInput(settings.vmixHost || "localhost");
      setVmixPortInput(String(settings.vmixPort ?? 8088));
      setSrtInputUrl(settings.streamUrlBackup || "");
    }
  }, [settings]);

  const { data: vmixTimecodeData } = useQuery({
    queryKey: ["/api/vmix/timecode", vmixHost, vmixPort],
    enabled: timecodeSource === "vmix",
    refetchInterval: 500,
    queryFn: async () => {
      const res = await fetch(`/api/vmix/timecode?host=${encodeURIComponent(vmixHost)}&port=${vmixPort}`);
      return res.json();
    },
  });

  useEffect(() => {
    if (timecodeSource === "vmix") {
      setTimecode(vmixTimecodeData?.timecode || "— нет сигнала vMix");
      return;
    }
    const tick = () => {
      const elapsed = Date.now() / 1000 - startTimeRef.current;
      setTimecode(formatTimecode(elapsed));
    };
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [timecodeSource, vmixTimecodeData?.timecode]);

  const streamUrl = settings?.streamUrl || streamUrlInput || "";
  const withSound = settings?.withSound !== false;

  const handleSaveUrl = () => {
    const url = streamUrlInput.trim() || (settings?.streamUrl ?? "");
    updateOtis.mutate({
      streamUrl: url || undefined,
      streamUrlBackup: srtInputUrl.trim() || undefined,
      showTimecode: settings?.showTimecode !== false,
      withSound: settings?.withSound !== false,
      timecodeSource: timecodeSourceInput,
      vmixHost: timecodeSourceInput === "vmix" ? vmixHostInput : undefined,
      vmixPort: timecodeSourceInput === "vmix" ? parseInt(vmixPortInput, 10) : undefined,
    });
    setShowSettings(false);
  };

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (settingsError) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Эфир ОТИС</h1>
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              Не удалось загрузить настройки. Проверьте, что сервер запущен и доступен по адресу из настроек.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
              Обновить страницу
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Эфир ОТИС</h1>
        <p className="text-muted-foreground mt-1">
          Просмотр выведенного эфира с таймкодом. При необходимости — со звуком.
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          Источник таймкода: локальный (с открытия страницы) или от vMix (режиссёр задаёт в vMix). Выбор — в настройках справа.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-0">
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                {streamUrl ? (
                  <>
                    <video
                      ref={videoRef}
                      src={streamUrl}
                      className="w-full h-full object-contain"
                      controls
                      muted={muted || !withSound}
                      playsInline
                      onError={(e) => console.error("Video error", e)}
                    />
                    {settings?.showTimecode !== false && (
                      <div
                        className="absolute bottom-2 left-2 font-mono text-white text-lg bg-black/70 px-2 py-1 rounded"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {timecode}
                      </div>
                    )}
                    <div className="absolute bottom-2 right-2 flex gap-2">
                      <Button
                        variant="secondary"
                        size="icon"
                        onClick={() => setMuted(!muted)}
                        title={muted ? "Включить звук" : "Выключить звук"}
                      >
                        {muted || !withSound ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground p-4">
                    <p className="text-center">URL потока не задан.</p>
                    <p className="text-sm mt-2">Укажите HLS/поток в настройках (после конвертации SRT в HLS на сервере).</p>
                    {settings?.streamUrlBackup && (
                      <p className="text-xs mt-3 text-center">
                        SRT-вход сохранён: {settings.streamUrlBackup}
                      </p>
                    )}
                    <Button variant="outline" className="mt-4 gap-2" onClick={() => setShowSettings(true)}>
                      <Settings2 className="h-4 w-4" />
                      Настройки
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Таймкод</CardTitle>
              <CardDescription>
              {timecodeSource === "vmix" ? "Таймкод от vMix (режиссёр)." : "Локальный таймкод с открытия страницы."}
            </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-2xl tabular-nums">{timecode}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                Настройки
                <Button variant="ghost" size="icon" onClick={() => setShowSettings(!showSettings)}>
                  <Settings2 className="h-4 w-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            {showSettings && (
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>URL потока (HLS / MP4)</Label>
                  <Input
                    placeholder="https://..."
                    value={streamUrlInput || settings?.streamUrl || ""}
                    onChange={(e) => setStreamUrlInput(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>SRT-вход</Label>
                  <Input
                    placeholder="srt://0.0.0.0:9000?mode=listener"
                    value={srtInputUrl}
                    onChange={(e) => setSrtInputUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Это адрес для приёма SRT. Для просмотра в браузере всё равно нужен HLS/HTTP поток в поле выше.
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <Label>Показывать таймкод</Label>
                  <Switch
                    checked={settings?.showTimecode !== false}
                    onCheckedChange={(v) => updateOtis.mutate({ showTimecode: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Звук по умолчанию</Label>
                  <Switch
                    checked={settings?.withSound !== false}
                    onCheckedChange={(v) => updateOtis.mutate({ withSound: v })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Источник таймкода</Label>
                  <Select value={timecodeSourceInput} onValueChange={(v: "local" | "vmix") => setTimecodeSourceInput(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="local">Локальный (с открытия страницы)</SelectItem>
                      <SelectItem value="vmix">vMix (режиссёр задаёт в vMix)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {timecodeSourceInput === "vmix" && (
                  <>
                    <div className="space-y-2">
                      <Label>vMix хост</Label>
                      <Input value={vmixHostInput} onChange={(e) => setVmixHostInput(e.target.value)} placeholder="localhost" />
                    </div>
                    <div className="space-y-2">
                      <Label>vMix порт</Label>
                      <Input type="number" value={vmixPortInput} onChange={(e) => setVmixPortInput(e.target.value)} placeholder="8088" />
                    </div>
                  </>
                )}
                <Button onClick={handleSaveUrl} disabled={updateOtis.isPending}>
                  {updateOtis.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить"}
                </Button>
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
