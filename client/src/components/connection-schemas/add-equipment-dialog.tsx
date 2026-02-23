import { useState, useEffect } from "react";
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

  // Получение оборудования со склада
  const { data: equipment = [], isLoading: isLoadingEquipment } = useQuery<Equipment[]>({
    queryKey: ["/api/equipment"],
    enabled: open,
  });

  // Поиск оборудования в интернете
  const searchEquipmentOnline = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      // Здесь можно использовать API для поиска оборудования
      // Пока используем заглушку с парсингом через поиск
      const response = await apiRequest("POST", "/api/equipment/search", { query });
      
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.results || []);
      } else {
        // Fallback: пытаемся парсить из названия
        const parsed = parseEquipmentFromName(query);
        if (parsed) {
          setSearchResults([parsed]);
        }
      }
    } catch (error) {
      console.error("Search error:", error);
      // Fallback: парсинг из названия
      const parsed = parseEquipmentFromName(query);
      if (parsed) {
        setSearchResults([parsed]);
      }
    } finally {
      setIsSearching(false);
    }
  };

  // Парсинг оборудования из названия (базовая логика)
  const parseEquipmentFromName = (name: string): EquipmentTemplate | null => {
    const nameLower = name.toLowerCase();
    
    // Определяем тип оборудования
    let type = "computer";
    if (nameLower.includes("камера") || nameLower.includes("camera")) type = "camera";
    else if (nameLower.includes("микрофон") || nameLower.includes("mic")) type = "mic";
    else if (nameLower.includes("микшер") || nameLower.includes("mixer")) type = "audio";
    else if (nameLower.includes("роутер") || nameLower.includes("router") || nameLower.includes("switch")) type = "network";
    else if (nameLower.includes("монитор") || nameLower.includes("monitor") || nameLower.includes("телевизор") || nameLower.includes("tv")) type = "display";

    // Парсим производителя и модель
    const parts = name.split(/\s+/);
    let manufacturer = "";
    let model = "";
    
    // Популярные производители
    const manufacturers = ["Sony", "Canon", "Panasonic", "Blackmagic", "ATEM", "Elgato", "Behringer", "TP-Link", "D-Link", "LG", "Samsung"];
    for (const part of parts) {
      if (manufacturers.some(m => part.toLowerCase().includes(m.toLowerCase()))) {
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

  const filteredEquipment = equipment.filter(item => {
    const matchesSearch = !searchTerm || 
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.model?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilters.length === 0 || typeFilters.includes(item.type);
    return matchesSearch && matchesType;
  });

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
              <div>
                <Input
                  placeholder="Поиск в моем складе..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="mb-4"
                />
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
              <div className="flex gap-2">
                <Input
                  placeholder="Введите название оборудования (например: Sony FX3, Canon EOS R5)..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      searchEquipmentOnline(searchTerm);
                    }
                  }}
                />
                <Button onClick={() => searchEquipmentOnline(searchTerm)} disabled={isSearching}>
                  {isSearching ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </Button>
              </div>

              <ScrollArea className="h-[500px]">
                {searchResults.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Введите название оборудования и нажмите поиск</p>
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

          <TabsContent value="custom" className="flex-1 flex flex-col min-h-0 mt-4">
            <ScrollArea className="flex-1">
              <div className="space-y-4">
                <div>
                  <Label>Название *</Label>
                  <Input
                    value={customEquipment.name}
                    onChange={(e) => setCustomEquipment({ ...customEquipment, name: e.target.value })}
                    placeholder="Например: ECHO_1"
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

