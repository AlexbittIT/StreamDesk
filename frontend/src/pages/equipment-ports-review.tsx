import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Inbox } from "lucide-react";
import {
  listUnmapped,
  resolveUnmapped,
  useConnectorTypes,
  type UnmappedTerm,
} from "@/lib/equipment-ports";

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "pending", label: "Ожидают" },
  { value: "added", label: "Добавлены" },
  { value: "dismissed", label: "Отклонены" },
  { value: "", label: "Все" },
];

/**
 * Очередь разъёмов, не найденных в справочнике (Task 2). Человек сопоставляет код
 * и помечает «добавлено» (фактическая правка connector_types.json — ручной шаг) или
 * отклоняет. Без «веб-морды» — простой список.
 */
export default function EquipmentPortsReview() {
  const { toast } = useToast();
  const [status, setStatus] = useState<string>("pending");
  const { types: connectorTypes } = useConnectorTypes();

  const { data: terms = [], isLoading, refetch } = useQuery<UnmappedTerm[]>({
    queryKey: ["unmapped-terms", status],
    queryFn: () => listUnmapped(status || undefined),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, action, code }: { id: string; action: "add" | "dismiss"; code?: string }) =>
      resolveUnmapped(id, action, code),
    onSuccess: (_d, vars) => {
      toast({ title: vars.action === "add" ? "Помечено как добавленное" : "Отклонено" });
      refetch();
    },
    onError: (e: any) => {
      toast({ title: "Ошибка", description: e?.message, variant: "destructive" });
    },
  });

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Очередь разъёмов</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Разъёмы из спеков, которых нет в справочнике. Сопоставьте код и пометьте «добавлено»
          (правка справочника connector_types.json — ручной шаг) либо отклоните.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <Button
            key={f.value || "all"}
            size="sm"
            variant={status === f.value ? "default" : "outline"}
            onClick={() => setStatus(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : terms.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Inbox className="w-8 h-8 mx-auto mb-2 opacity-60" />
            <p>Записей нет</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {terms.map((term) => (
            <UnmappedRow
              key={term.id}
              term={term}
              connectorTypes={connectorTypes}
              busy={resolveMutation.isPending}
              onResolve={(action, code) => resolveMutation.mutate({ id: term.id, action, code })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UnmappedRow({
  term,
  connectorTypes,
  busy,
  onResolve,
}: {
  term: UnmappedTerm;
  connectorTypes: { id: string; label: string }[];
  busy: boolean;
  onResolve: (action: "add" | "dismiss", code?: string) => void;
}) {
  const [code, setCode] = useState<string>(term.suggestedCode || connectorTypes[0]?.id || "");
  const deviceLine = [term.manufacturer, term.model].filter(Boolean).join(" ");
  const isPending = term.status === "pending";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">«{term.term}»</CardTitle>
            {deviceLine && <CardDescription className="mt-0.5">{deviceLine}</CardDescription>}
            {term.context?.portName && (
              <CardDescription className="mt-0.5">
                порт: {term.context.portName}
                {term.context.direction ? ` (${term.context.direction})` : ""}
              </CardDescription>
            )}
          </div>
          <Badge variant={isPending ? "secondary" : "outline"}>
            {term.status === "pending" ? "ожидает" : term.status === "added" ? "добавлен" : "отклонён"}
          </Badge>
        </div>
      </CardHeader>
      {isPending && (
        <CardContent className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Сопоставить с кодом:</span>
          <select
            className="flex h-9 w-44 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          >
            {connectorTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <Button size="sm" disabled={busy || !code} onClick={() => onResolve("add", code)}>
            Добавить в справочник
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onResolve("dismiss")}>
            Отклонить
          </Button>
        </CardContent>
      )}
      {!isPending && term.suggestedCode && (
        <CardContent className="text-sm text-muted-foreground">
          код: <span className="font-medium text-foreground">{term.suggestedCode}</span>
        </CardContent>
      )}
    </Card>
  );
}
