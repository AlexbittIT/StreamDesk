import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Package, Plus, Mic, Camera, Lightbulb, Monitor, Gavel, Edit, MapPin, ScanBarcode, QrCode, ArrowRightLeft, ShoppingCart, Send, Trash2, User, Calendar, AlertTriangle, FileSpreadsheet, PackageCheck } from "lucide-react";
import { EquipmentForm } from "@/components/forms/equipment-form";
import { BarcodeScanner } from "@/components/equipment/barcode-scanner";
import { EquipmentBarcodeModal } from "@/components/equipment/barcode-generator";
import { apiUrl, encodeUserHeader } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Equipment } from "@shared/schema";

function getCurrentUser() {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem('streamstudio_user') || '{}');
  } catch {
    return null;
  }
}

function canEditEquipment(userRole: string | undefined): boolean {
  return userRole === 'admin' || userRole === 'tech_director';
}

export default function EquipmentPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"full" | "take_return">("full");
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
  const [barcodeEquipment, setBarcodeEquipment] = useState<Equipment | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [cart, setCart] = useState<Equipment[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [sendToProjectId, setSendToProjectId] = useState<string>("");
  const [returnDate, setReturnDate] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    setCurrentUser(getCurrentUser());
  }, []);

  const userCanEdit = canEditEquipment(currentUser?.role);

  const { data: equipment = [], isLoading } = useQuery<Equipment[]>({
    queryKey: ["/api/equipment"],
  });

  const { data: projects = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/projects"],
  });

  const { data: equipmentOnProjects = [] } = useQuery<Array<{ equipmentId: string; projectId: string; projectName?: string; returnDate: string; assignedByName: string; assignedByUserId?: string }>>({
    queryKey: ["/api/equipment-on-projects"],
  });

  const sendToProjectMutation = useMutation({
    mutationFn: async ({
      projectId,
      equipmentIds,
      returnDate,
      assignedByName,
      assignedByUserId,
    }: {
      projectId: string;
      equipmentIds: string[];
      returnDate: string;
      assignedByName: string;
      assignedByUserId?: string;
    }) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/equipment-bundle`, {
        equipmentIds,
        returnDate,
        assignedByName,
        assignedByUserId,
      });
      return res.json();
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment-on-projects"] });
      const project = projects.find((p) => p.id === projectId);
      toast({
        title: "Отправлено",
        description: `Оборудование привязано к проекту «${project?.name || projectId}». Не забудьте вернуть к указанной дате.`,
      });
      setCart([]);
      setCartOpen(false);
      setSendToProjectId("");
      setReturnDate("");
    },
    onError: (e: any) => {
      toast({ title: "Ошибка", description: e?.message || "Не удалось отправить", variant: "destructive" });
    },
  });

  const addToCart = (item: Equipment) => {
    if (cart.some((e) => e.id === item.id)) return;
    setCart((prev) => [...prev, item]);
    toast({ title: "В корзине", description: `${item.name} добавлено в корзину` });
  };
  const removeFromCart = (id: string) => setCart((prev) => prev.filter((e) => e.id !== id));
  const clearCart = () => { setCart([]); setCartOpen(false); };

  const filteredEquipment = equipment.filter((item: Equipment) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = item.name.toLowerCase().includes(searchLower) ||
                         item.model?.toLowerCase().includes(searchLower) ||
                         item.serialNumber?.toLowerCase().includes(searchLower) ||
                         item.inventoryNumber?.toLowerCase().includes(searchLower) ||
                         item.barcode?.toLowerCase().includes(searchLower);
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;
    const matchesType = typeFilter === "all" || item.type === typeFilter;
    
    return matchesSearch && matchesStatus && matchesType;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "available": return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
      case "in-use": return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
      case "maintenance": return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
      case "broken": return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
      default: return "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "available": return "Доступно";
      case "in-use": return "Используется";
      case "maintenance": return "Обслуживание";
      case "broken": return "Сломано";
      default: return status;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "microphone": return <Mic className="w-5 h-5" />;
      case "camera": return <Camera className="w-5 h-5" />;
      case "lighting": return <Lightbulb className="w-5 h-5" />;
      case "computer": return <Monitor className="w-5 h-5" />;
      default: return <Gavel className="w-5 h-5" />;
    }
  };

  const getTypeText = (type: string) => {
    switch (type) {
      case "microphone": return "Микрофон";
      case "camera": return "Камера";
      case "lighting": return "Освещение";
      case "computer": return "Компьютер";
      default: return "Другое";
    }
  };

  const toExport = selectedIds.size > 0
    ? filteredEquipment.filter((e: Equipment) => selectedIds.has(e.id))
    : filteredEquipment;

  const BARCODE_FIXED_LENGTH = 20;
  const normalizeBarcode = (value: string | null | undefined): string => {
    const s = String(value ?? "").trim();
    if (s.length >= BARCODE_FIXED_LENGTH) return s.slice(0, BARCODE_FIXED_LENGTH);
    return s.padEnd(BARCODE_FIXED_LENGTH, " ");
  };

  const exportBarcodesToExcel = () => {
    const BOM = "\uFEFF";
    const headers = ["Штрихкод", "Название", "Модель", "Тип"];
    const rows = toExport.map((item: Equipment) => [
      normalizeBarcode(item.barcode ?? item.serialNumber ?? item.inventoryNumber ?? ""),
      item.name ?? "",
      item.model ?? "",
      getTypeText(item.type ?? "other"),
    ]);
    const csv = [headers.join(";"), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))].join("\r\n");
    const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `штрихкоды_оборудование_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Выгружено", description: `Экспорт ${toExport.length} позиций. Откройте файл в Excel для печати.` });
  };

  const returnToWarehouseMutation = useMutation({
    mutationFn: async (equipmentId: string) => {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (currentUser) (headers as Record<string, string>)["x-user"] = encodeUserHeader(currentUser);
      const res = await fetch(apiUrl("/api/equipment-return"), {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ equipmentId, userId: currentUser?.id }),
      });
      const text = await res.text();
      if (!res.ok) {
        let msg = text;
        try {
          const j = text ? JSON.parse(text) : null;
          if (j && typeof j.message === "string") msg = j.message;
        } catch (_) {}
        throw new Error(msg.slice(0, 300) || `Ошибка ${res.status}`);
      }
      try {
        return text ? JSON.parse(text) : {};
      } catch {
        throw new Error("Сервер вернул неверный ответ. Попробуйте обновить страницу.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment-on-projects"] });
      toast({ title: "Готово", description: "Оборудование возвращено на склад" });
    },
    onError: (e: any) => {
      toast({ title: "Ошибка", description: e?.message || "Не удалось вернуть", variant: "destructive" });
    },
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size >= filteredEquipment.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredEquipment.map((e: Equipment) => e.id)));
  };

  const getOnProjectInfo = (equipmentId: string) =>
    equipmentOnProjects.find((x) => x.equipmentId === equipmentId);
  const isReturnOverdue = (returnDateStr: string) => {
    const today = new Date().toISOString().slice(0, 10);
    return returnDateStr < today;
  };

  const overdueCount = equipmentOnProjects.filter((x) => isReturnOverdue(x.returnDate)).length;
  const hasShownOverdueRef = useRef(false);
  useEffect(() => {
    if (overdueCount > 0 && equipment.length > 0 && !hasShownOverdueRef.current) {
      hasShownOverdueRef.current = true;
      toast({
        title: "Напоминание: просрочено возвращение оборудования",
        description: `Оборудование по ${overdueCount} позиции(ям) не возвращено в срок. Проверьте карточки с меткой «Просрочено возвращение».`,
        variant: "destructive",
      });
    }
  }, [overdueCount, equipment.length]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header: на мобильном кнопка «Добавить» отдельно не съезжает */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white truncate">Склад техники</h2>
          {userCanEdit && (
            <Button 
              className="shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
              onClick={() => { setSelectedEquipment(null); setIsFormOpen(true); }} 
              data-testid="button-add-equipment"
            >
              <Plus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Добавить</span>
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            className="flex-1 min-w-0 sm:flex-none border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={() => setIsScannerOpen(true)}
            data-testid="button-scan-barcode"
          >
            <ScanBarcode className="w-4 h-4 mr-1.5 sm:mr-2" />
            Сканировать
          </Button>
          <Sheet open={cartOpen} onOpenChange={setCartOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="relative flex-1 min-w-0 sm:flex-none border-slate-300 dark:border-slate-600">
                <ShoppingCart className="w-4 h-4 mr-1.5 sm:mr-2" />
                Корзина
                {cart.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                    {cart.length}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-md flex flex-col">
              <SheetHeader>
                <SheetTitle>Корзина оборудования</SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto py-4 space-y-2">
                {cart.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Добавьте оборудование с карточек кнопкой «Корзина»</p>
                ) : (
                  cart.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border bg-card">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.model} · {getTypeText(item.type)}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => removeFromCart(item.id)}>
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
              {cart.length > 0 && (
                <div className="border-t pt-4 space-y-3">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Отправить на проект</label>
                    <Select value={sendToProjectId} onValueChange={setSendToProjectId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Выберите проект" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Дата возврата оборудования <span className="text-red-500">*</span></label>
                    <Input
                      type="date"
                      value={returnDate}
                      onChange={(e) => setReturnDate(e.target.value)}
                      min={new Date().toISOString().slice(0, 10)}
                      className="bg-white dark:bg-slate-800"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={clearCart} className="flex-1">Очистить</Button>
                    <Button
                      className="flex-1"
                      disabled={!sendToProjectId || !returnDate || sendToProjectMutation.isPending}
                      onClick={() => {
                        const user = getCurrentUser();
                        const name = user?.name || user?.username || "Сотрудник";
                        if (sendToProjectId && returnDate) {
                          sendToProjectMutation.mutate({
                            projectId: sendToProjectId,
                            equipmentIds: cart.map((e) => e.id),
                            returnDate,
                            assignedByName: name,
                            assignedByUserId: user?.id,
                          });
                        }
                      }}
                    >
                      {sendToProjectMutation.isPending ? (
                        "Отправка…"
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-2" />
                          Отправить на проект
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[150px] bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <SelectValue placeholder="Статус" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="available">Доступно</SelectItem>
            <SelectItem value="in-use">Используется</SelectItem>
            <SelectItem value="maintenance">Обслуживание</SelectItem>
            <SelectItem value="broken">Сломано</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-[140px] bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <SelectValue placeholder="Тип" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все типы</SelectItem>
            <SelectItem value="microphone">Микрофоны</SelectItem>
            <SelectItem value="camera">Камеры</SelectItem>
            <SelectItem value="lighting">Освещение</SelectItem>
            <SelectItem value="computer">Компьютеры</SelectItem>
            <SelectItem value="other">Другое</SelectItem>
          </SelectContent>
        </Select>

        <Button 
          variant="outline" 
          className="border-slate-300 dark:border-slate-600"
          onClick={() => {
            setStatusFilter("all");
            setTypeFilter("all");
          }}
        >
          Сбросить
        </Button>

        <Button variant="outline" size="sm" className="border-slate-300 dark:border-slate-600" onClick={toggleSelectAll}>
          {selectedIds.size >= filteredEquipment.length && filteredEquipment.length > 0 ? "Снять выбор" : "Выбрать все"}
        </Button>
        <Button 
          variant="outline" 
          className="border-slate-300 dark:border-slate-600"
          onClick={exportBarcodesToExcel}
          disabled={toExport.length === 0}
          title={selectedIds.size > 0 ? "Выгрузить выбранные штрихкоды в Excel" : "Выгрузить штрихкоды текущего списка в CSV (Excel)"}
        >
          <FileSpreadsheet className="w-4 h-4 mr-1.5 sm:mr-2" />
          {selectedIds.size > 0 ? `В Excel (${selectedIds.size})` : "Выгрузить в Excel"}
        </Button>
      </div>

      {/* Equipment Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredEquipment.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <Package className="w-12 h-12 mx-auto mb-4 text-slate-300 dark:text-slate-600" />
            <p className="text-slate-500 dark:text-slate-400">Оборудование не найдено</p>
          </div>
        ) : (
          filteredEquipment.map((item: Equipment) => (
            <Card key={item.id} className="hover:shadow-lg transition-all bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 outline-none ring-0 focus-within:ring-0 focus-visible:ring-0">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3 min-w-0">
                    <Checkbox
                      checked={selectedIds.has(item.id)}
                      onCheckedChange={() => toggleSelect(item.id)}
                      className="shrink-0"
                      title="Выбрать для выгрузки в Excel"
                    />
                    <div className="w-12 h-12 bg-primary/10 dark:bg-primary/20 rounded-lg flex items-center justify-center text-primary shrink-0">
                      {getTypeIcon(item.type)}
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-lg text-slate-900 dark:text-white truncate">{item.name}</CardTitle>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{getTypeText(item.type)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap shrink-0">
                    {getOnProjectInfo(item.id) ? (
                      <>
                        <Badge className="bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300">
                          На проекте
                        </Badge>
                        {(userCanEdit || (currentUser?.id && getOnProjectInfo(item.id)?.assignedByUserId === currentUser.id)) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            title="Вернуть на склад (только тот, кто отправил, или администратор)"
                            disabled={returnToWarehouseMutation.isPending}
                            onClick={() => returnToWarehouseMutation.mutate(item.id)}
                          >
                            <PackageCheck className="w-3.5 h-3.5 mr-1" />
                            Вернуть
                          </Button>
                        )}
                      </>
                    ) : (
                      <Badge className={getStatusColor(item.status)}>
                        {getStatusText(item.status)}
                      </Badge>
                    )}
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="hover:bg-slate-100 dark:hover:bg-slate-700 h-8 w-8 p-0"
                      onClick={() => {
                        setBarcodeEquipment(item);
                        setIsBarcodeModalOpen(true);
                      }}
                      title="Штрих-код"
                      data-testid={`button-barcode-${item.id}`}
                    >
                      <QrCode className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="hover:bg-slate-100 dark:hover:bg-slate-700 h-8 w-8 p-0"
                      onClick={() => addToCart(item)}
                      title="В корзину"
                      disabled={cart.some((e) => e.id === item.id) || !!getOnProjectInfo(item.id)}
                    >
                      <ShoppingCart className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    </Button>
                    {userCanEdit ? (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="hover:bg-slate-100 dark:hover:bg-slate-700 h-8 w-8 p-0"
                        onClick={() => {
                          setSelectedEquipment(item);
                          setFormMode("full");
                          setIsFormOpen(true);
                        }}
                        title="Редактировать"
                        data-testid={`button-edit-${item.id}`}
                      >
                        <Edit className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      </Button>
                    ) : (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="hover:bg-slate-100 dark:hover:bg-slate-700 h-8 w-8 p-0"
                        onClick={() => {
                          setSelectedEquipment(item);
                          setFormMode("take_return");
                          setIsFormOpen(true);
                        }}
                        title={item.status === 'in-use' ? 'Вернуть' : 'Взять'}
                        data-testid={`button-take-return-${item.id}`}
                      >
                        <ArrowRightLeft className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
                  {getOnProjectInfo(item.id) && (() => {
                    const info = getOnProjectInfo(item.id)!;
                    const overdue = isReturnOverdue(info.returnDate);
                    return (
                      <div className={cn("rounded-lg p-2 space-y-1", overdue ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800" : "bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800")}>
                        <div className="flex items-center gap-1.5 text-violet-700 dark:text-violet-300">
                          <User className="w-3.5 h-3.5" />
                          <span>Отправил: {info.assignedByName}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>Возврат: {info.returnDate}</span>
                          {info.projectName && <span> · {info.projectName}</span>}
                        </div>
                        {overdue && (
                          <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400 font-medium">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Просрочено возвращение
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {item.model && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Модель:</span>
                      <span className="font-medium">{item.model}</span>
                    </div>
                  )}
                  {item.serialNumber && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Серийный номер:</span>
                      <span className="font-medium font-mono text-xs">{item.serialNumber}</span>
                    </div>
                  )}
                  {item.inventoryNumber && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Инв. номер:</span>
                      <span className="font-medium">{item.inventoryNumber}</span>
                    </div>
                  )}
                  {item.location && (
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-slate-400" />
                      <span className="text-slate-500 dark:text-slate-400">Место:</span>
                      <span className="font-medium ml-auto">{item.location}</span>
                    </div>
                  )}
                  {item.lastUsed && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Последнее использование:</span>
                      <span className="font-medium">{new Date(item.lastUsed).toLocaleDateString("ru-RU")}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Equipment Form */}
      <EquipmentForm
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setSelectedEquipment(null);
        }}
        equipment={selectedEquipment}
        mode={formMode}
      />

      {/* Barcode Scanner */}
      <BarcodeScanner
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onEquipmentFound={(foundEquipment: Equipment) => {
          setSelectedEquipment(foundEquipment);
          setFormMode(userCanEdit ? "full" : "take_return");
          setIsFormOpen(true);
          setIsScannerOpen(false);
        }}
        onBarcodeScanned={(barcode: string) => {
          setSearchTerm(barcode);
          setIsScannerOpen(false);
        }}
      />

      {/* Barcode Generator Modal */}
      <EquipmentBarcodeModal
        isOpen={isBarcodeModalOpen}
        onClose={() => {
          setIsBarcodeModalOpen(false);
          setBarcodeEquipment(null);
        }}
        equipment={barcodeEquipment}
      />
    </div>
  );
}