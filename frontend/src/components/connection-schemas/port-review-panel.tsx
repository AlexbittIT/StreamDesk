import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, X, Check, AlertTriangle, Sparkles } from "lucide-react";
import type { ConnectorType, PortDef } from "@/lib/equipment-ports";

interface PortReviewPanelProps {
  title?: string;
  device: { name?: string; manufacturer?: string; model?: string; type?: string };
  initialPortsIn: PortDef[];
  initialPortsOut: PortDef[];
  connectorTypes: ConnectorType[];
  status?: string;
  confidence?: number | null;
  configurablePorts?: boolean;
  unmappedTerms?: string[];
  approveLabel?: string;
  busy?: boolean;
  onApprove: (portsIn: PortDef[], portsOut: PortDef[]) => void;
  onCancel: () => void;
}

/**
 * Инлайн-ревью портов, найденных ИИ (Task 2). Человек проверяет и правит, затем
 * одобряет — после чего устройство уходит на холст. Без отдельной веб-морды.
 */
export function PortReviewPanel({
  title = "Проверьте порты, найденные ИИ",
  device,
  initialPortsIn,
  initialPortsOut,
  connectorTypes,
  status,
  confidence,
  configurablePorts,
  unmappedTerms = [],
  approveLabel = "Одобрить и добавить",
  busy = false,
  onApprove,
  onCancel,
}: PortReviewPanelProps) {
  const [portsIn, setPortsIn] = useState<PortDef[]>(initialPortsIn);
  const [portsOut, setPortsOut] = useState<PortDef[]>(initialPortsOut);

  const setters = {
    in: { list: portsIn, set: setPortsIn },
    out: { list: portsOut, set: setPortsOut },
  } as const;

  const addPort = (dir: "in" | "out") => {
    const { list, set } = setters[dir];
    const fallback = connectorTypes[0]?.id || "HDMI";
    set([
      ...list,
      { id: `${dir}-${Date.now()}`, name: fallback, type: dir, portType: fallback },
    ]);
  };

  const removePort = (dir: "in" | "out", id: string) => {
    const { list, set } = setters[dir];
    set(list.filter((p) => p.id !== id));
  };

  const updatePort = (dir: "in" | "out", id: string, patch: Partial<PortDef>) => {
    const { list, set } = setters[dir];
    set(list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const renderPorts = (dir: "in" | "out") => {
    const { list } = setters[dir];
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>{dir === "in" ? "Входы (IN)" : "Выходы (OUT)"}</Label>
          <Button size="sm" variant="outline" type="button" onClick={() => addPort(dir)}>
            <Plus className="w-4 h-4 mr-1" />
            Порт
          </Button>
        </div>
        <div className="space-y-2">
          {list.length === 0 && (
            <p className="text-xs text-muted-foreground">Нет портов</p>
          )}
          {list.map((port) => (
            <div key={port.id} className="flex gap-2 items-center">
              <Input
                value={port.name}
                onChange={(e) => updatePort(dir, port.id, { name: e.target.value })}
                placeholder="Название порта"
                className="flex-1"
              />
              <select
                className="flex h-10 w-36 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={port.portType || ""}
                onChange={(e) => updatePort(dir, port.id, { portType: e.target.value })}
              >
                {connectorTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="ghost" type="button" onClick={() => removePort(dir, port.id)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const deviceLine = [device.manufacturer, device.model].filter(Boolean).join(" ");
  const confidencePct = typeof confidence === "number" ? Math.round(confidence * 100) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary shrink-0" />
            <h3 className="font-semibold truncate">{title}</h3>
          </div>
          {device.name && <p className="text-sm text-foreground mt-1 truncate">{device.name}</p>}
          {deviceLine && <p className="text-xs text-muted-foreground truncate">{deviceLine}</p>}
        </div>
        <div className="flex flex-wrap gap-1.5 justify-end shrink-0">
          {status === "pending_review" && <Badge variant="secondary">на проверке</Badge>}
          {status === "confirmed" && <Badge>подтверждено</Badge>}
          {confidencePct !== null && (
            <Badge variant="outline">уверенность {confidencePct}%</Badge>
          )}
          {device.type && <Badge variant="outline">{device.type}</Badge>}
        </div>
      </div>

      {configurablePorts && (
        <div className="rounded-md border border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 p-2.5 text-xs flex gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>
            Модульное оборудование (слоты/карты): состав портов слотов ИИ не угадывал —
            добавьте их вручную.
          </span>
        </div>
      )}

      {unmappedTerms.length > 0 && (
        <div className="rounded-md border border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 p-2.5 text-xs flex gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>
            Разъёмы не из справочника (отправлены на ручное добавление):{" "}
            <span className="font-medium">{unmappedTerms.join(", ")}</span>
          </span>
        </div>
      )}

      <ScrollArea className="max-h-[40vh]">
        <div className="space-y-4 pr-3">
          {renderPorts("in")}
          {renderPorts("out")}
        </div>
      </ScrollArea>

      <div className="flex gap-2 pt-2">
        <Button className="flex-1" disabled={busy} onClick={() => onApprove(portsIn, portsOut)}>
          <Check className="w-4 h-4 mr-1" />
          {approveLabel}
        </Button>
        <Button variant="outline" disabled={busy} onClick={onCancel}>
          Отклонить
        </Button>
      </div>
    </div>
  );
}
