import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Hls from "hls.js";
import {
  AlertTriangle, ChevronDown, Copy, Link2, Loader2, Plus, Radio, Trash2, Users, Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

type Reader = { type: string; id: string };
type StreamUrls = { publish?: Record<string, string>; read?: Record<string, string>; hls?: string };
type VmixParams = { srt?: string; rtmp?: string; rtsp?: string; hls?: string; hint?: string };

type MtxStream = {
  name: string;
  ready: boolean;
  sourceType: string;
  sourceId: string;
  uptimeSeconds: number | null;
  tracks: string[];
  videoCodec: string | null;
  audioCodec: string | null;
  bytesReceived: number;
  bytesSent: number;
  bitrateInKbps: number | null;
  bitrateOutKbps: number | null;
  rttMs: number | null;
  readers: Reader[];
  readerCount: number;
  urls: StreamUrls;
  vmix: VmixParams;
};

// --- форматтеры ---

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "0 MB";
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  return `${(bytes / 1e6).toFixed(2)} MB`;
}

function formatGb(bytes: number): string {
  return `${((bytes || 0) / 1e9).toFixed(2)} GB`;
}

function formatUptime(seconds: number | null): string {
  if (seconds == null || seconds < 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}ч ${String(m).padStart(2, "0")}м`;
  if (m > 0) return `${m}м ${String(s).padStart(2, "0")}с`;
  return `${s}с`;
}

function formatKbps(value: number | null): string {
  if (value == null) return "—";
  return `${Math.round(value)} kbps`;
}

// --- WebRTC WHEP helper ---

function waitIceGathering(pc: RTCPeerConnection, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const onChange = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", onChange);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", onChange);
    setTimeout(() => {
      pc.removeEventListener("icegatheringstatechange", onChange);
      resolve();
    }, timeoutMs);
  });
}

/**
 * Плеер потока: сначала WebRTC (WHEP, <1с задержки), при сбое — авто-откат на HLS (hls.js).
 * Источник переинициализируется только при смене URL, поэтому частые обновления статистики
 * не перезапускают воспроизведение (несколько потоков идут без лагов).
 */
function StreamPlayer({
  whepUrl,
  hlsUrl,
  muted,
  onResolution,
}: {
  whepUrl?: string;
  hlsUrl?: string;
  muted: boolean;
  onResolution?: (w: number, h: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<"connecting" | "webrtc" | "hls" | "error">("connecting");

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let pc: RTCPeerConnection | null = null;
    let hls: Hls | null = null;
    let cancelled = false;

    const cleanup = () => {
      if (pc) { try { pc.close(); } catch { /* ignore */ } pc = null; }
      if (hls) { try { hls.destroy(); } catch { /* ignore */ } hls = null; }
      try {
        video.srcObject = null;
        video.removeAttribute("src");
        video.load();
      } catch { /* ignore */ }
    };

    const startHls = () => {
      if (cancelled || !hlsUrl) { setMode("error"); return; }
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = hlsUrl;
        setMode("hls");
        return;
      }
      if (Hls.isSupported()) {
        hls = new Hls({ lowLatencyMode: true, backBufferLength: 10, maxBufferLength: 8, liveSyncDurationCount: 2 });
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal && !cancelled) setMode("error");
        });
        hls.loadSource(hlsUrl);
        hls.attachMedia(video);
        setMode("hls");
        return;
      }
      video.src = hlsUrl;
      setMode("hls");
    };

    const startWhep = async () => {
      try {
        pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        pc.addTransceiver("video", { direction: "recvonly" });
        pc.addTransceiver("audio", { direction: "recvonly" });
        pc.ontrack = (e) => {
          if (e.streams[0] && video.srcObject !== e.streams[0]) {
            video.srcObject = e.streams[0];
          }
        };
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await waitIceGathering(pc, 1200);
        if (cancelled) return;
        const res = await fetch(whepUrl as string, {
          method: "POST",
          headers: { "Content-Type": "application/sdp" },
          body: pc.localDescription?.sdp || "",
        });
        if (!res.ok) throw new Error(`WHEP ${res.status}`);
        const answer = await res.text();
        if (cancelled) return;
        await pc.setRemoteDescription({ type: "answer", sdp: answer });
        setMode("webrtc");
      } catch {
        if (cancelled) return;
        if (pc) { try { pc.close(); } catch { /* ignore */ } pc = null; }
        startHls();
      }
    };

    setMode("connecting");
    if (whepUrl) startWhep();
    else startHls();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [whepUrl, hlsUrl]);

  return (
    <div className="relative h-full w-full">
      <video
        ref={videoRef}
        className="h-full w-full bg-black object-contain"
        autoPlay
        playsInline
        muted={muted}
        onLoadedMetadata={(e) => onResolution?.(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
      />
      {mode === "connecting" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}
      {mode === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 px-3 text-center text-xs text-white/80">
          <Video className="mb-1 h-5 w-5" />
          Нет сигнала / поток недоступен в браузере
        </div>
      )}
      {(mode === "webrtc" || mode === "hls") && (
        <Badge className="absolute right-2 top-2 bg-black/60 text-[10px] uppercase">
          {mode === "webrtc" ? "WebRTC" : "HLS"}
        </Badge>
      )}
    </div>
  );
}

// --- сворачиваемый блок ссылок ---

function CopyRow({ label, value, onCopy }: { label: string; value?: string; onCopy: (v?: string) => void }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[11px] uppercase text-slate-400">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded bg-slate-950/40 px-2 py-1 text-[11px] text-slate-200">{value}</code>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => onCopy(value)}>
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function Collapsible({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-slate-700/60 bg-slate-900/40">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-sm text-slate-200"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-2">{icon}{title}</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="space-y-1.5 border-t border-slate-700/60 px-3 py-2">{children}</div>}
    </div>
  );
}

// --- плитка потока ---

function StreamTile({
  stream,
  isAdmin,
  muted,
  onDelete,
  onKick,
}: {
  stream: MtxStream;
  isAdmin: boolean;
  muted: boolean;
  onDelete: (name: string) => void;
  onKick: (reader: Reader) => void;
}) {
  const { toast } = useToast();
  const [resolution, setResolution] = useState<string | null>(null);

  const handleResolution = useCallback((w: number, h: number) => {
    if (w && h) setResolution(`${w}x${h}`);
  }, []);

  const copy = useCallback((value?: string) => {
    if (!value) return;
    navigator.clipboard?.writeText(value)
      .then(() => toast({ title: "Скопировано" }))
      .catch(() => toast({ title: "Не удалось скопировать", variant: "destructive" }));
  }, [toast]);

  const read = stream.urls?.read || {};
  const publish = stream.urls?.publish || {};

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900 text-slate-100 shadow-sm">
      {/* превью */}
      <div className="relative aspect-video bg-black">
        <StreamPlayer whepUrl={read.whep} hlsUrl={read.hls || stream.urls?.hls} muted={muted} onResolution={handleResolution} />
        <Badge className={cn("absolute left-2 top-2 gap-1", stream.ready ? "bg-emerald-600" : "bg-slate-600")}>
          <span className={cn("h-1.5 w-1.5 rounded-full", stream.ready ? "bg-white" : "bg-slate-300")} />
          {stream.ready ? "Online" : "Offline"}
        </Badge>
      </div>

      {/* заголовок */}
      <div className="flex items-start justify-between gap-2 p-3">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold">{stream.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
            {stream.sourceType && <span>{stream.sourceType}</span>}
            {stream.videoCodec && <span className="text-slate-300">{stream.videoCodec}</span>}
            <span>· {formatUptime(stream.uptimeSeconds)}</span>
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {formatBytes(stream.bytesReceived)} / {formatBytes(stream.bytesSent)}
          </div>
        </div>
        {isAdmin && (
          <Button type="button" variant="destructive" size="sm" className="h-8 shrink-0" onClick={() => onDelete(stream.name)}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Удалить
          </Button>
        )}
      </div>

      {/* статистика */}
      <div className="space-y-1.5 border-t border-slate-700/60 px-3 py-2.5 text-sm">
        <Stat label="Разрешение" value={resolution || "—"} />
        <Stat label="Кодек аудио" value={stream.audioCodec || "—"} />
        <Stat label="Входящий трафик" value={formatKbps(stream.bitrateInKbps)} />
        <Stat label="Исходящий трафик" value={formatKbps(stream.bitrateOutKbps)} />
        <Stat label="Задержка (RTT)" value={stream.rttMs != null ? `${stream.rttMs.toFixed(0)} ms` : "—"} />
      </div>

      <div className="space-y-1.5 border-t border-slate-700/60 px-3 py-2.5 text-sm">
        <Stat label="⤓ Входящие данные (всего)" value={formatGb(stream.bytesReceived)} bold />
        <Stat label="⤒ Исходящие данные (всего)" value={formatGb(stream.bytesSent)} bold />
      </div>

      {/* раскрывающиеся блоки */}
      <div className="space-y-2 px-3 pb-3 pt-1">
        <Collapsible icon={<Video className="h-4 w-4" />} title="Параметры для vMix">
          <CopyRow label="SRT" value={stream.vmix?.srt} onCopy={copy} />
          <CopyRow label="RTMP" value={stream.vmix?.rtmp} onCopy={copy} />
          <CopyRow label="RTSP" value={stream.vmix?.rtsp} onCopy={copy} />
          <CopyRow label="HLS" value={stream.vmix?.hls} onCopy={copy} />
          {stream.vmix?.hint && <p className="pt-1 text-[11px] text-slate-400">{stream.vmix.hint}</p>}
        </Collapsible>

        <Collapsible icon={<Link2 className="h-4 w-4" />} title="Ссылки для подключения">
          <p className="text-[11px] uppercase text-slate-500">Публикация</p>
          <CopyRow label="SRT" value={publish.srt} onCopy={copy} />
          <CopyRow label="RTMP" value={publish.rtmp} onCopy={copy} />
          <CopyRow label="RTSP" value={publish.rtsp} onCopy={copy} />
          <p className="pt-1 text-[11px] uppercase text-slate-500">Просмотр</p>
          <CopyRow label="HLS" value={read.hls} onCopy={copy} />
          <CopyRow label="WebRTC" value={read.webrtc} onCopy={copy} />
          <CopyRow label="SRT" value={read.srt} onCopy={copy} />
          <CopyRow label="RTMP" value={read.rtmp} onCopy={copy} />
          <CopyRow label="RTSP" value={read.rtsp} onCopy={copy} />
        </Collapsible>
      </div>

      {/* читатели */}
      <div className="border-t border-slate-700/60 px-3 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
          <Users className="h-4 w-4" />
          Читатели ({stream.readerCount})
        </div>
        {stream.readers.length > 0 ? (
          <ul className="mt-1.5 space-y-1">
            {stream.readers.map((reader, index) => (
              <li key={`${reader.type}-${reader.id}-${index}`} className="flex items-center justify-between gap-2 text-xs text-slate-400">
                <span className="min-w-0 truncate">• {reader.type}{reader.id ? ` (${reader.id.slice(0, 8)})` : ""}</span>
                {isAdmin && (
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px] text-red-400 hover:text-red-300" onClick={() => onKick(reader)}>
                    Отключить
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-slate-500">Нет активных читателей.</p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-400">{label}:</span>
      <span className={cn("text-slate-200", bold && "font-semibold")}>{value}</span>
    </div>
  );
}

// --- страница ---

export default function MediaMtxPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [muted, setMuted] = useState(true);
  const [newName, setNewName] = useState("");
  const [newSource, setNewSource] = useState("");

  const { data: health } = useQuery<{ reachable: boolean; status: string }>({
    queryKey: ["/api/mediamtx/health"],
    refetchInterval: 10000,
    retry: 0,
  });

  const { data: streams = [], isLoading, isError } = useQuery<MtxStream[]>({
    queryKey: ["/api/mediamtx/streams"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/mediamtx/streams");
      return res.json();
    },
    refetchInterval: 1500,
    retry: 0,
  });

  const addPath = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/mediamtx/paths", {
        name: newName.trim(),
        source: newSource.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Путь создан", description: `«${newName.trim()}» добавлен в MediaMTX.` });
      setNewName("");
      setNewSource("");
      queryClient.invalidateQueries({ queryKey: ["/api/mediamtx/streams"] });
    },
    onError: (e: any) => toast({ title: "Не удалось создать путь", description: e?.message, variant: "destructive" }),
  });

  const deletePath = useMutation({
    mutationFn: async (name: string) => apiRequest("DELETE", `/api/mediamtx/paths/${encodeURIComponent(name)}`),
    onSuccess: () => {
      toast({ title: "Путь удалён" });
      queryClient.invalidateQueries({ queryKey: ["/api/mediamtx/streams"] });
    },
    onError: (e: any) => toast({ title: "Не удалось удалить", description: e?.message, variant: "destructive" }),
  });

  const kick = useMutation({
    mutationFn: async (reader: Reader) => apiRequest("POST", "/api/mediamtx/kick", { type: reader.type, id: reader.id }),
    onSuccess: () => {
      toast({ title: "Соединение отключено" });
      queryClient.invalidateQueries({ queryKey: ["/api/mediamtx/streams"] });
    },
    onError: (e: any) => toast({ title: "Не удалось отключить", description: e?.message, variant: "destructive" }),
  });

  return (
    <div className="w-full max-w-full space-y-4 p-3 sm:p-4 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            <Radio className="h-6 w-6 text-primary" />
            MediaMTX
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Живой мониторинг потоков MediaMTX: предпросмотр (WebRTC с откатом на HLS), битрейт, трафик, читатели.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={health?.reachable ? "default" : "destructive"} className="gap-1">
            <span className={cn("h-2 w-2 rounded-full", health?.reachable ? "bg-emerald-400" : "bg-red-400")} />
            MediaMTX {health?.reachable ? "online" : "offline"}
          </Badge>
          <Button type="button" variant="outline" size="sm" onClick={() => setMuted((v) => !v)}>
            {muted ? "Включить звук" : "Выключить звук"}
          </Button>
        </div>
      </div>

      {health && !health.reachable && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Control API MediaMTX недоступен. Проверьте, что MediaMTX запущен и переменные
            <code className="mx-1">MEDIAMTX_API_URL</code>/<code className="mx-1">MEDIAMTX_HOST</code> указывают на сервер.
          </span>
        </div>
      )}

      {isAdmin && (
        <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <label className="text-xs text-slate-500 dark:text-slate-400">Имя пути</label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="moii" className="h-9" />
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-xs text-slate-500 dark:text-slate-400">Источник (необязательно)</label>
            <Input value={newSource} onChange={(e) => setNewSource(e.target.value)} placeholder="srt://... | rtsp://... (пусто = приём публикации)" className="h-9" />
          </div>
          <Button type="button" disabled={!newName.trim() || addPath.isPending} onClick={() => addPath.mutate()} className="h-9 shrink-0">
            {addPath.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Добавить путь
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Загрузка потоков…
        </div>
      ) : isError ? (
        <div className="rounded-md border border-dashed border-slate-300 px-3 py-12 text-center text-sm text-slate-500 dark:border-slate-700">
          Не удалось получить потоки от MediaMTX.
        </div>
      ) : streams.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 px-3 py-12 text-center text-sm text-slate-500 dark:border-slate-700">
          Активных потоков нет. Опубликуйте поток в MediaMTX{isAdmin ? " или добавьте путь выше" : ""}.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {streams.map((stream) => (
            <StreamTile
              key={stream.name}
              stream={stream}
              isAdmin={isAdmin}
              muted={muted}
              onDelete={(name) => deletePath.mutate(name)}
              onKick={(reader) => kick.mutate(reader)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
