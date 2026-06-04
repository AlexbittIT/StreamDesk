import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Loader2, Plus, ExternalLink, Radio, Signal } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Equipment } from "@shared/schema";

/** Нормализация для поиска: нижний регистр, похожие кириллица/латиница к одному виду, двойные буквы убрать */
function normalizeForSearch(s: string): string {
  let t = s.toLowerCase().trim();
  const toLatin: [string, string][] = [
    ["ё", "e"], ["й", "i"], ["ы", "i"], ["ъ", ""], ["ь", ""],
    ["а", "a"], ["о", "o"], ["е", "e"], ["р", "p"], ["х", "x"], ["у", "y"], ["к", "k"], ["м", "m"], ["н", "n"], ["т", "t"], ["с", "c"], ["в", "b"], ["и", "i"],
  ];
  for (const [a, b] of toLatin) t = t.split(a).join(b);
  return t.replace(/(.)\1+/g, "$1");
}

/** Оценка совпадения: 0 = нет, >0 чем выше — тем лучше. Учитывает вхождение подстроки и подпоследовательность (для опечаток). */
function fuzzyScore(search: string, str: string): number {
  const s = normalizeForSearch(search);
  const t = normalizeForSearch(str);
  if (!s.length) return 0;
  const idx = t.indexOf(s);
  if (idx !== -1) return 1000 - idx;
  let j = 0;
  for (let i = 0; i < t.length && j < s.length; i++) {
    if (t[i] === s[j]) j++;
  }
  if (j === s.length) return 100;
  j = 0;
  for (let i = 0; i < t.length && j < s.length; i++) {
    if (t[i] === s[j] || (s[j] === "о" && t[i] === "а") || (s[j] === "а" && t[i] === "о")) j++;
  }
  return j === s.length ? 50 : 0;
}

interface Port {
  id: string;
  name: string;
  type: "in" | "out";
  portType?: string;
}

interface EquipmentTemplate {
  id?: string;
  name: string;
  manufacturer?: string;
  model?: string;
  type: string;
  portsIn: Port[];
  portsOut: Port[];
  specifications?: Record<string, any>;
}

interface AddEquipmentDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (equipment: EquipmentTemplate) => void;
}

export function AddEquipmentDialog({ open, onClose, onAdd }: AddEquipmentDialogProps) {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [libraryFilter, setLibraryFilter] = useState<"my" | "team" | "community">("my");
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [customEquipment, setCustomEquipment] = useState<Partial<EquipmentTemplate>>({
    name: "",
    manufacturer: "",
    model: "",
    type: "computer",
    portsIn: [],
    portsOut: [],
  });
  const [stockDropdownOpen, setStockDropdownOpen] = useState(false);
  const [searchSuggestionsOpen, setSearchSuggestionsOpen] = useState(false);
  const stockInputRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLDivElement>(null);

  // Получение оборудования со склада
  const { data: equipment = [], isLoading: isLoadingEquipment } = useQuery<Equipment[]>({
    queryKey: ["/api/equipment"],
    enabled: open,
  });

  // Поиск только по Enter или кнопке — один запрос, один список результатов
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  const searchEquipmentOnline = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setSearchSuggestionsOpen(false);
      return;
    }

    setIsSearching(true);
    setSearchResults([]);
    setSearchSuggestionsOpen(false);
    try {
      const response = await apiRequest("POST", "/api/equipment/search", { query });
      if (response.ok) {
        const data = await response.json();
        const results = data.results || [];
        setSearchResults(results);
        if (results.length > 0) {
          setSearchHistory((prev) => {
            const q = query.trim();
            if (prev.includes(q)) return prev;
            return [q, ...prev.filter((p) => p !== q)].slice(0, 10);
          });
        }
      } else {
        const parsed = parseEquipmentFromName(query);
        setSearchResults(parsed ? [parsed] : []);
      }
    } catch (error) {
      console.error("Search error:", error);
      const parsed = parseEquipmentFromName(query);
      setSearchResults(parsed ? [parsed] : []);
    } finally {
      setIsSearching(false);
    }
  };

  // Подсказки для вкладки «Поиск в интернете»: история + со склада, с учётом опечаток
  const searchSuggestions = useMemo(() => {
    const term = searchTerm.trim();
    if (!term) return [];
    const fromHistory = searchHistory
      .filter((q) => fuzzyScore(term, q) > 0)
      .sort((a, b) => fuzzyScore(term, b) - fuzzyScore(term, a))
      .slice(0, 5);
    const fromStock = equipment
      .map((e) => e.name)
      .filter((name) => fuzzyScore(term, name) > 0)
      .sort((a, b) => fuzzyScore(term, b) - fuzzyScore(term, a))
      .slice(0, 5);
    const merged = Array.from(new Set([...fromHistory, ...fromStock]));
    return merged.slice(0, 10);
  }, [searchTerm, searchHistory, equipment]);

  // Выпадающий список для «Мой склад»: при вводе от одной буквы — оборудование со склада (нечёткий поиск)
  const stockDropdownSuggestions = useMemo(() => {
    const term = searchTerm.trim();
    if (!term) return [];
    return equipment
      .map((item) => ({
        item,
        score:
          fuzzyScore(term, item.name) * 2 +
          fuzzyScore(term, item.model || "") +
          fuzzyScore(term, item.type || ""),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((x) => x.item);
  }, [searchTerm, equipment]);

  // Парсинг оборудования из названия: с учётом опечаток (нормализация + нечёткие ключевые слова)
  const parseEquipmentFromName = (name: string): EquipmentTemplate | null => {
    const raw = name.trim();
    if (!raw) return null;
    const nameNorm = normalizeForSearch(name);
    
    const match = (keywords: string[]) =>
      keywords.some((kw) => nameNorm.includes(normalizeForSearch(kw)));

    let type = "computer";
    if (match(["камер", "camera", "cam", "видео"])) type = "camera";
    else if (match(["микрофон", "mic", "мк", "петлич"])) type = "mic";
    else if (match(["микшер", "mixer", "консоль", "аудио"])) type = "audio";
    else if (match(["роутер", "router", "switch", "свитч", "коммутатор", "lan", "сеть"])) type = "network";
    else if (match(["монитор", "monitor", "телевизор", "tv", "дисплей", "экран"])) type = "display";

    const parts = name.split(/\s+/);
    let manufacturer = "";
    let model = "";
    const manufacturers = ["Sony", "Canon", "Panasonic", "Blackmagic", "ATEM", "Elgato", "Behringer", "TP-Link", "D-Link", "LG", "Samsung", "Black Magic", "BMD"];
    for (const part of parts) {
      const pNorm = normalizeForSearch(part);
      const found = manufacturers.find((m) => pNorm.includes(normalizeForSearch(m)) || normalizeForSearch(m).includes(pNorm));
      if (found) {
        manufacturer = part;
        break;
      }
    }

    // Определяем порты на основе типа
    const portsIn: Port[] = [];
    const portsOut: Port[] = [];

    if (type === "camera") {
      portsOut.push({ id: "1", name: "HDMI", type: "out", portType: "HDMI" });
      portsOut.push({ id: "2", name: "SDI", type: "out", portType: "SDI" });
      portsIn.push({ id: "1", name: "DC", type: "in", portType: "DC" });
    } else if (type === "computer") {
      portsOut.push({ id: "1", name: "HDMI", type: "out", portType: "HDMI" });
      portsOut.push({ id: "2", name: "USB", type: "out", portType: "USB" });
      portsIn.push({ id: "1", name: "ETH", type: "in", portType: "ETH" });
      portsIn.push({ id: "2", name: "USB", type: "in", portType: "USB" });
    } else if (type === "network") {
      for (let i = 1; i <= 8; i++) {
        portsIn.push({ id: `in${i}`, name: `LAN${i}`, type: "in", portType: "LAN" });
      }
      portsIn.push({ id: "power", name: "DC", type: "in", portType: "DC" });
    } else if (type === "display") {
      portsIn.push({ id: "1", name: "HDMI1", type: "in", portType: "HDMI" });
      portsIn.push({ id: "2", name: "HDMI2", type: "in", portType: "HDMI" });
      portsIn.push({ id: "3", name: "USB", type: "in", portType: "USB" });
    }

    return {
      name: name.trim(),
      manufacturer: manufacturer || undefined,
      model: model || undefined,
      type,
      portsIn,
      portsOut,
    };
  };

  const filteredEquipment = useMemo(() => {
    const term = searchTerm.trim();
    if (!term)
      return equipment.filter((item) => typeFilters.length === 0 || typeFilters.includes(item.type));
    return equipment
      .filter((item) => typeFilters.length === 0 || typeFilters.includes(item.type))
      .map((item) => ({
        item,
        score:
          fuzzyScore(term, item.name) * 2 +
          fuzzyScore(term, item.model || "") +
          fuzzyScore(term, item.type || ""),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.item);
  }, [equipment, searchTerm, typeFilters]);

  const handleAddFromStock = (item: Equipment) => {
    const template: EquipmentTemplate = {
      id: item.id,
      name: item.name,
      manufacturer: item.specifications?.manufacturer as string || undefined,
      model: item.model || undefined,
      type: item.type,
      portsIn: (item.specifications?.portsIn as Port[]) || [],
      portsOut: (item.specifications?.portsOut as Port[]) || [],
      specifications: item.specifications as Record<string, any> || {},
    };
    onAdd(template);
    onClose();
  };

  const handleAddFromSearch = (result: EquipmentTemplate) => {
    onAdd(result);
    setSearchTerm("");
    setSearchResults([]);
    setSearchSuggestionsOpen(false);
    onClose();
  };

  const handleAddCustom = () => {
    if (!customEquipment.name) {
      toast({
        title: "Ошибка",
        description: "Введите название оборудования",
        variant: "destructive",
      });
      return;
    }

    onAdd(customEquipment as EquipmentTemplate);
    setCustomEquipment({
      name: "",
      manufacturer: "",
      model: "",
      type: "computer",
      portsIn: [],
      portsOut: [],
    });
    onClose();
  };

  const addPort = (type: "in" | "out") => {
    const ports = type === "in" ? customEquipment.portsIn || [] : customEquipment.portsOut || [];
    const newPort: Port = {
      id: `${type}-${Date.now()}`,
      name: `Port ${ports.length + 1}`,
      type,
      portType: "HDMI",
    };
    
    if (type === "in") {
      setCustomEquipment({ ...customEquipment, portsIn: [...ports, newPort] });
    } else {
      setCustomEquipment({ ...customEquipment, portsOut: [...ports, newPort] });
    }
  };

  const removePort = (type: "in" | "out", portId: string) => {
    if (type === "in") {
      setCustomEquipment({
        ...customEquipment,
        portsIn: (customEquipment.portsIn || []).filter(p => p.id !== portId),
      });
    } else {
      setCustomEquipment({
        ...customEquipment,
        portsOut: (customEquipment.portsOut || []).filter(p => p.id !== portId),
      });
    }
  };

  const updatePort = (type: "in" | "out", portId: string, updates: Partial<Port>) => {
    if (type === "in") {
      setCustomEquipment({
        ...customEquipment,
        portsIn: (customEquipment.portsIn || []).map(p => p.id === portId ? { ...p, ...updates } : p),
      });
    } else {
      setCustomEquipment({
        ...customEquipment,
        portsOut: (customEquipment.portsOut || []).map(p => p.id === portId ? { ...p, ...updates } : p),
      });
    }
  };

  const uniqueTypes = Array.from(new Set(equipment.map(e => e.type)));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Добавить оборудование</DialogTitle>
          <DialogDescription>
            Выберите оборудование со склада, найдите в интернете или создайте свое
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="stock" className="flex-1 flex flex-col min-h-0">
          <TabsList>
            <TabsTrigger value="stock">Мой склад</TabsTrigger>
            <TabsTrigger value="search">Поиск в интернете</TabsTrigger>
            <TabsTrigger value="custom">Создать свое</TabsTrigger>
          </TabsList>

          <TabsContent value="stock" className="flex-1 flex flex-col min-h-0 mt-4">
            <div className="space-y-4">
              {/* Быстрое добавление: беспроводные блоки */}
              <div className="rounded-lg border bg-muted/40 p-3">
                <Label className="text-xs font-medium text-muted-foreground mb-2 block">Беспроводная связь</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      onAdd({
                        name: "Wireless TX",
                        type: "wireless_sender",
                        portsIn: [],
                        portsOut: [{ id: "tx", name: "RF", type: "out", portType: "Wireless" }],
                      });
                      onClose();
                    }}
                  >
                    <Radio className="w-4 h-4 mr-2" />
                    Wireless TX (передатчик)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      onAdd({
                        name: "Wireless RX",
                        type: "wireless_receiver",
                        portsIn: [{ id: "rx", name: "RF", type: "in", portType: "Wireless" }],
                        portsOut: [],
                      });
                      onClose();
                    }}
                  >
                    <Signal className="w-4 h-4 mr-2" />
                    Wireless RX (приёмник)
                  </Button>
                </div>
              </div>
              <div ref={stockInputRef} className="relative mb-4">
                <Input
                  placeholder="Начните вводить название — появится список (например: камера, Sony, ATEM...)"
                  value={searchTerm}
                  autoComplete="off"
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setStockDropdownOpen(true);
                  }}
                  onFocus={() => searchTerm.trim().length >= 1 && setStockDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setStockDropdownOpen(false), 150)}
                  className="w-full"
                />
                {stockDropdownOpen && stockDropdownSuggestions.length > 0 && (
                  <div
                    className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md max-h-[280px] overflow-auto"
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    {stockDropdownSuggestions.map((item) => {
                      const portsIn = (item.specifications?.portsIn as Port[]) || [];
                      const portsOut = (item.specifications?.portsOut as Port[]) || [];
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className="w-full px-3 py-2.5 text-left hover:bg-muted focus:bg-muted focus:outline-none flex items-center justify-between gap-2 border-b last:border-b-0"
                          onClick={() => {
                            handleAddFromStock(item);
                            setSearchTerm("");
                            setStockDropdownOpen(false);
                          }}
                        >
                          <span className="font-medium truncate">{item.name}</span>
                          {item.model && (
                            <span className="text-xs text-muted-foreground truncate shrink-0">{item.model}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex gap-4">
                <div className="w-48 space-y-4">
                  <div>
                    <Label className="mb-2 block">Библиотека</Label>
                    <RadioGroup value={libraryFilter} onValueChange={(v) => setLibraryFilter(v as any)}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="my" id="my" />
                        <Label htmlFor="my">Мой склад</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="team" id="team" />
                        <Label htmlFor="team">Команда</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="community" id="community" />
                        <Label htmlFor="community">Сообщество</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div>
                    <Label className="mb-2 block">Тип</Label>
                    <div className="space-y-2">
                      {uniqueTypes.map(type => (
                        <div key={type} className="flex items-center space-x-2">
                          <Checkbox
                            id={type}
                            checked={typeFilters.includes(type)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setTypeFilters([...typeFilters, type]);
                              } else {
                                setTypeFilters(typeFilters.filter(t => t !== type));
                              }
                            }}
                          />
                          <Label htmlFor={type} className="text-sm">
                            {type} ({equipment.filter(e => e.type === type).length})
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <ScrollArea className="flex-1 h-[500px]">
                  {isLoadingEquipment ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  ) : filteredEquipment.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>Оборудование не найдено</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredEquipment.map(item => {
                        const portsIn = (item.specifications?.portsIn as Port[]) || [];
                        const portsOut = (item.specifications?.portsOut as Port[]) || [];
                        return (
                          <div
                            key={item.id}
                            className="p-4 border rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer bg-card"
                            onClick={() => handleAddFromStock(item)}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-foreground">{item.name}</h4>
                                {item.model && <p className="text-sm text-muted-foreground mt-0.5">{item.model}</p>}
                                <div className="flex flex-wrap gap-2 mt-2">
                                  <Badge variant="secondary">{item.type}</Badge>
                                </div>
                                {(portsIn.length > 0 || portsOut.length > 0) && (
                                  <div className="mt-3 space-y-1.5 text-xs">
                                    {portsIn.length > 0 && (
                                      <div>
                                        <span className="font-medium text-muted-foreground">Входы (IN):</span>
                                        <span className="ml-1.5 text-foreground">
                                          {portsIn.map((p: Port) => p.portType || p.name || "—").join(", ")}
                                        </span>
                                      </div>
                                    )}
                                    {portsOut.length > 0 && (
                                      <div>
                                        <span className="font-medium text-muted-foreground">Выходы (OUT):</span>
                                        <span className="ml-1.5 text-foreground">
                                          {portsOut.map((p: Port) => p.portType || p.name || "—").join(", ")}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                              <Button size="sm" onClick={(e) => { e.stopPropagation(); handleAddFromStock(item); }} className="shrink-0">
                                <Plus className="w-4 h-4 mr-1" />
                                Добавить
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="search" className="flex-1 flex flex-col min-h-0 mt-4">
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Введите хотя бы одну букву — появится выпадающий список. Выберите подсказку или нажмите «Поиск» / Enter.
              </p>
              <div ref={searchInputRef} className="flex gap-2 relative">
                <div className="flex-1 relative">
                <Input
                    placeholder="Например: Sony FX3, камера, ATEM, Behringer..."
                    value={searchTerm}
                    autoComplete="off"
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setSearchSuggestionsOpen(e.target.value.trim().length >= 1);
                    }}
                    onFocus={() => searchTerm.trim().length >= 1 && setSearchSuggestionsOpen(true)}
                    onBlur={() => setTimeout(() => setSearchSuggestionsOpen(false), 150)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        searchEquipmentOnline(searchTerm);
                      }
                    }}
                  />
                  {searchSuggestionsOpen && searchTerm.trim().length >= 1 && searchSuggestions.length > 0 && (
                    <div
                      className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md max-h-[240px] overflow-auto"
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      {searchSuggestions.map((s, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className="w-full px-3 py-2 text-left hover:bg-muted focus:bg-muted focus:outline-none text-sm border-b last:border-b-0"
                          onClick={() => {
                            setSearchTerm(s);
                            setSearchSuggestionsOpen(false);
                          }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Button onClick={() => searchEquipmentOnline(searchTerm)} disabled={isSearching} className="shrink-0">
                  {isSearching ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                  Поиск
                </Button>
              </div>

              <ScrollArea className="h-[500px]">
                {searchResults.length === 0 && !isSearching ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Введите название и нажмите «Поиск» — здесь появится список</p>
                  </div>
                ) : isSearching ? (
                  <div className="text-center py-8 text-muted-foreground flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Поиск…</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {searchResults.map((result, index) => (
                      <div
                        key={index}
                        className="p-4 border rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 bg-card"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-foreground">{result.name}</h4>
                            {(result.manufacturer || result.model) && (
                              <p className="text-sm text-muted-foreground mt-0.5">
                                {[result.manufacturer, result.model].filter(Boolean).join(" ")}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-2 mt-2">
                              <Badge variant="secondary">{result.type}</Badge>
                            </div>
                            <div className="mt-3 space-y-1.5 text-xs">
                              {result.portsIn && result.portsIn.length > 0 && (
                                <div>
                                  <span className="font-medium text-muted-foreground">Входы (IN):</span>
                                  <span className="ml-1.5 text-foreground">
                                    {result.portsIn.map((p: { name?: string; portType?: string }) => p.portType || p.name || "—").join(", ")}
                                  </span>
                                </div>
                              )}
                              {result.portsOut && result.portsOut.length > 0 && (
                                <div>
                                  <span className="font-medium text-muted-foreground">Выходы (OUT):</span>
                                  <span className="ml-1.5 text-foreground">
                                    {result.portsOut.map((p: { name?: string; portType?: string }) => p.portType || p.name || "—").join(", ")}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          <Button size="sm" onClick={() => handleAddFromSearch(result)} className="shrink-0">
                            <Plus className="w-4 h-4 mr-1" />
                            Добавить
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="custom" className="flex-1 flex flex-col min-h-0 mt-4 overflow-hidden">
            <ScrollArea className="flex-1 min-h-0 max-h-[65vh] overflow-y-auto pr-3">
              <div className="space-y-4 pb-4" onPointerDown={(e) => e.stopPropagation()}>
                <div>
                  <Label>Название *</Label>
                  <Input
                    value={customEquipment.name}
                    onChange={(e) => setCustomEquipment({ ...customEquipment, name: e.target.value })}
                    placeholder="Например: ECHO_1"
                    className="flex-1 min-w-[200px]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Производитель</Label>
                    <Input
                      value={customEquipment.manufacturer}
                      onChange={(e) => setCustomEquipment({ ...customEquipment, manufacturer: e.target.value })}
                      placeholder="Например: OTIS"
                    />
                  </div>
                  <div>
                    <Label>Модель</Label>
                    <Input
                      value={customEquipment.model}
                      onChange={(e) => setCustomEquipment({ ...customEquipment, model: e.target.value })}
                      placeholder="Например: ECHO_1"
                    />
                  </div>
                </div>

                <div>
                  <Label>Тип</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={customEquipment.type}
                    onChange={(e) => setCustomEquipment({ ...customEquipment, type: e.target.value })}
                  >
                    <option value="computer">Компьютер</option>
                    <option value="camera">Камера</option>
                    <option value="mic">Микрофон</option>
                    <option value="audio">Аудио</option>
                    <option value="network">Сеть</option>
                    <option value="display">Дисплей</option>
                    <option value="other">Другое</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Входные порты (IN)</Label>
                    <Button size="sm" variant="outline" onClick={() => addPort("in")}>
                      <Plus className="w-4 h-4 mr-1" />
                      Добавить порт
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {(customEquipment.portsIn || []).map((port) => (
                      <div key={port.id} className="flex gap-2 items-center">
                        <Input
                          value={port.name}
                          onChange={(e) => updatePort("in", port.id, { name: e.target.value })}
                          placeholder="Название порта"
                          className="flex-1"
                        />
                        <select
                          className="flex h-10 w-32 rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={port.portType || "HDMI"}
                          onChange={(e) => updatePort("in", port.id, { portType: e.target.value })}
                        >
                          <option value="HDMI">HDMI</option>
                          <option value="SDI">SDI</option>
                          <option value="USB">USB</option>
                          <option value="USB-C">USB-C</option>
                          <option value="ETH">Ethernet</option>
                          <option value="LAN">LAN</option>
                          <option value="BNC">BNC</option>
                          <option value="DC">DC</option>
                          <option value="XLR">XLR</option>
                          <option value="Wireless">Wireless</option>
                        </select>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removePort("in", port.id)}
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Выходные порты (OUT)</Label>
                    <Button size="sm" variant="outline" onClick={() => addPort("out")}>
                      <Plus className="w-4 h-4 mr-1" />
                      Добавить порт
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {(customEquipment.portsOut || []).map((port) => (
                      <div key={port.id} className="flex gap-2 items-center">
                        <Input
                          value={port.name}
                          onChange={(e) => updatePort("out", port.id, { name: e.target.value })}
                          placeholder="Название порта"
                          className="flex-1"
                        />
                        <select
                          className="flex h-10 w-32 rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={port.portType || "HDMI"}
                          onChange={(e) => updatePort("out", port.id, { portType: e.target.value })}
                        >
                          <option value="HDMI">HDMI</option>
                          <option value="SDI">SDI</option>
                          <option value="USB">USB</option>
                          <option value="USB-C">USB-C</option>
                          <option value="ETH">Ethernet</option>
                          <option value="LAN">LAN</option>
                          <option value="BNC">BNC</option>
                          <option value="DC">DC</option>
                          <option value="XLR">XLR</option>
                          <option value="Wireless">Wireless</option>
                        </select>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removePort("out", port.id)}
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button className="flex-1" onClick={handleAddCustom}>
                    Добавить на схему
                  </Button>
                  <Button variant="outline" onClick={onClose}>
                    Отмена
                  </Button>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

