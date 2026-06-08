import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Package, Plus, Mic, Camera, Lightbulb, Monitor, Gavel, Edit, MapPin, ScanBarcode, QrCode, ArrowRightLeft, ShoppingCart, Send, Trash2, User, Calendar, AlertTriangle, FileSpreadsheet, PackageCheck, FileText, Search, X, Clock, SlidersHorizontal, History, MessageSquare, Printer } from "lucide-react";
import { EquipmentForm } from "@/components/forms/equipment-form";
import { BarcodeScanner } from "@/components/equipment/barcode-scanner";
import { EquipmentBarcodeModal } from "@/components/equipment/barcode-generator";
import { canCreateEquipment, canEditEquipment, canReserveEquipment } from "@/lib/equipment-permissions";
import { buildBarcodeLabelBitmapPayload, renderCompactBarcodeLabel } from "@/lib/barcode-label";
import { apiRequest, apiUrl, encodeUserHeader } from "@/lib/queryClient";
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

function toLocalDateTimeInputValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function formatDateTime(value: string | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatReturnDateTime(dateValue: string, timeValue?: string) {
  if (!dateValue) return "";
  const date = new Date(`${dateValue}T${timeValue || "23:59"}`);
  if (Number.isNaN(date.getTime())) return [dateValue, timeValue].filter(Boolean).join(" ");
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSpecificationValue(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item && typeof item === "object") {
          const record = item as Record<string, unknown>;
          return String(record.name || record.caption || record.model || record.description || "").trim();
        }
        return String(item ?? "").trim();
      })
      .filter(Boolean)
      .join(", ");
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, itemValue]) => {
        if (itemValue && typeof itemValue === "object") return "";
        return `${key}: ${String(itemValue ?? "").trim()}`;
      })
      .filter(Boolean)
      .join(", ");
  }
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

const INTERNAL_SPECIFICATION_KEYS = new Set([
  "agent",
  "agentKey",
  "checkout",
  "checkoutHistory",
  "companyId",
  "createdBy",
  "createdByUserId",
  "noteAudit",
  "notesHistory",
  "equipmentComments",
  "isSuperPosition",
  "bundleType",
  "bundleComponentIds",
  "bundleComponents",
  "assembledAt",
  "assembledByUserId",
  "assembledByName",
  "parentBundleId",
  "parentBundleName",
  "parentBundleCreatedAt",
  "hardware",
  "metrics",
  "metricsHistory",
  "workspace",
  "localIps",
  "syncedAt",
  "systemId",
  "source",
  "deviceType",
]);

type EquipmentComment = {
  id: string;
  text: string;
  authorId?: string | null;
  authorName?: string | null;
  createdAt: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getSpecificationEntries(specifications: unknown): Array<[string, string]> {
  if (!specifications || typeof specifications !== "object" || Array.isArray(specifications)) {
    return [];
  }

  return Object.entries(specifications as Record<string, unknown>)
    .filter(([key]) => !INTERNAL_SPECIFICATION_KEYS.has(String(key ?? "").trim()))
    .map(([key, value]) => [String(key).trim(), formatSpecificationValue(value)] as [string, string])
    .filter(([key, value]) => key && value);
}

function getEquipmentPhotos(item: Equipment | null | undefined): string[] {
  return Array.isArray(item?.photos)
    ? (item?.photos as unknown[])
        .map((photo) => String(photo || "").trim())
        .filter(Boolean)
        .filter((photo) => !photo.startsWith("blob:"))
        .map((photo) => {
          const normalized = photo.replace(/\\/g, "/");
          if (/^(https?:)?\/\//i.test(normalized) || normalized.startsWith("/")) return normalized;
          if (normalized.includes("uploads/")) return `/${normalized.replace(/^\/+/, "")}`;
          return `/uploads/${normalized.replace(/^\/+/, "")}`;
        })
    : [];
}

function getEquipmentComments(item: Equipment | null | undefined): EquipmentComment[] {
  const comments = asRecord(item?.specifications).equipmentComments;
  if (!Array.isArray(comments)) return [];
  return comments
    .map((comment: any) => ({
      id: String(comment?.id || `comment-${comment?.createdAt || Math.random()}`),
      text: String(comment?.text || "").trim(),
      authorId: comment?.authorId ? String(comment.authorId) : null,
      authorName: comment?.authorName ? String(comment.authorName) : null,
      createdAt: String(comment?.createdAt || new Date().toISOString()),
    }))
    .filter((comment) => comment.text);
}

function isSuperPosition(item: Equipment | null | undefined) {
  const specs = asRecord(item?.specifications);
  return specs.isSuperPosition === true || specs.bundleType === "super_position";
}

function getParentBundleName(item: Equipment | null | undefined) {
  return String(asRecord(item?.specifications).parentBundleName || "").trim();
}

function getBundleComponents(item: Equipment | null | undefined, allEquipment: Equipment[]) {
  const specs = asRecord(item?.specifications);
  const snapshots = Array.isArray(specs.bundleComponents) ? specs.bundleComponents as any[] : [];
  const ids = Array.isArray(specs.bundleComponentIds) ? specs.bundleComponentIds.map((id) => String(id)) : [];
  const byId = new Map(allEquipment.map((entry) => [entry.id, entry]));

  const rows = snapshots.length > 0
    ? snapshots.map((entry) => {
        const id = String(entry?.id || "").trim();
        const live = id ? byId.get(id) : undefined;
        return {
          id,
          name: String(live?.name || entry?.name || "Позиция").trim(),
          model: String(live?.model || entry?.model || "").trim(),
          inventoryNumber: String(live?.inventoryNumber || entry?.inventoryNumber || "").trim(),
          type: String(live?.type || entry?.type || "other").trim(),
        };
      })
    : ids.map((id) => {
        const live = byId.get(id);
        return {
          id,
          name: String(live?.name || "Позиция").trim(),
          model: String(live?.model || "").trim(),
          inventoryNumber: String(live?.inventoryNumber || "").trim(),
          type: String(live?.type || "other").trim(),
        };
      });

  return rows.filter((entry) => entry.id || entry.name);
}

export default function EquipmentPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"full" | "take_return">("full");
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
  const [barcodeEquipment, setBarcodeEquipment] = useState<Equipment | null>(null);
  const [detailsEquipment, setDetailsEquipment] = useState<Equipment | null>(null);
  const [detailsNote, setDetailsNote] = useState("");
  const [detailsComment, setDetailsComment] = useState("");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [cart, setCart] = useState<Equipment[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [sendToProjectId, setSendToProjectId] = useState<string>("");
  const [handoffAt, setHandoffAt] = useState<string>(() => toLocalDateTimeInputValue());
  const [returnDate, setReturnDate] = useState<string>("");
  const [returnTime, setReturnTime] = useState<string>("18:00");
  const [passDirection, setPassDirection] = useState<"in" | "out">("out");
  const [passBasis, setPassBasis] = useState<string>("");
  const [passResponsiblePhone, setPassResponsiblePhone] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [requestEquipment, setRequestEquipment] = useState<Equipment | null>(null);
  const [requestLocation, setRequestLocation] = useState<string>("");
  const [requestNote, setRequestNote] = useState<string>("");
  const [bundleDialogOpen, setBundleDialogOpen] = useState(false);
  const [bundleName, setBundleName] = useState("");
  const [bundleType, setBundleType] = useState("computer");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    setCurrentUser(getCurrentUser());
  }, []);

  useEffect(() => {
    setDetailsNote(String(detailsEquipment?.notes ?? ""));
  }, [detailsEquipment?.id, detailsEquipment?.notes]);

  const { data: equipment = [], isLoading } = useQuery<Equipment[]>({
    queryKey: ["/api/equipment"],
  });

  const { data: companyData } = useQuery<any>({
    queryKey: ["/api/companies/me"],
    enabled: Boolean(currentUser?.id),
  });

  const { data: projects = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/projects"],
  });

  const { data: equipmentOnProjects = [] } = useQuery<Array<{ equipmentId: string; projectId: string; projectName?: string; sentAt?: string; returnDate: string; returnTime?: string; assignedByName: string; assignedByUserId?: string }>>({
    queryKey: ["/api/equipment-on-projects"],
  });

  const equipmentCountByProject = equipmentOnProjects.reduce<Record<string, number>>((acc, item) => {
    const key = String(item.projectId || "").trim();
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const { data: users = [] } = useQuery<Array<{ id: string; name?: string | null; username?: string | null }>>({
    queryKey: ["/api/users"],
  });

  const { data: checkoutRequests = [] } = useQuery<Array<{
    id: string;
    equipmentId: string;
    companyId?: string | null;
    requestedBy: string;
    requestType?: string | null;
    currentHolder?: string | null;
    reviewedBy?: string | null;
    status: string;
    location?: string | null;
    note?: string | null;
    decisionNote?: string | null;
    createdAt?: string;
    updatedAt?: string;
    reviewedAt?: string | null;
  }>>({
    queryKey: ["/api/equipment-checkout-requests"],
    enabled: Boolean(currentUser?.id),
  });

  const companyMemberships = Array.isArray(companyData?.companies) ? companyData.companies : [];
  const activeCompanyIds = companyMemberships
    .map((item: any) => String(item?.company?.id || "").trim())
    .filter(Boolean);
  const manageableCompanyIds = companyMemberships
    .filter((item: any) => ["owner", "admin"].includes(String(item?.membership?.role || "")))
    .map((item: any) => String(item?.company?.id || "").trim())
    .filter(Boolean);
  const primaryCompanyId = activeCompanyIds[0] || "";
  const canApproveCheckout = manageableCompanyIds.length > 0;
  const userCanCreate = canCreateEquipment(currentUser) || canApproveCheckout || currentUser?.workspaceMode === "company_owner";
  const userCanEdit = canEditEquipment(currentUser) || canApproveCheckout;
  const userCanReserve = canReserveEquipment(currentUser) || canApproveCheckout;
  const canRequestCheckout = activeCompanyIds.length > 0;

  const updateEquipmentNoteMutation = useMutation({
    mutationFn: async ({ equipmentId, notes }: { equipmentId: string; notes: string }) => {
      const response = await apiRequest("PUT", `/api/equipment/${equipmentId}`, { notes });
      return response.json();
    },
    onSuccess: (updated: Equipment) => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      if (updated?.id) {
        setDetailsEquipment(updated);
      }
      toast({ title: "Сохранено", description: "Примечание обновлено." });
    },
    onError: (e: any) => {
      toast({ title: "Ошибка", description: e?.message || "Не удалось сохранить примечание", variant: "destructive" });
    },
  });

  const addEquipmentCommentMutation = useMutation({
    mutationFn: async ({ equipmentItem, text }: { equipmentItem: Equipment; text: string }) => {
      const commentText = text.trim();
      if (!commentText) throw new Error("Введите комментарий");
      const currentComments = getEquipmentComments(equipmentItem);
      const nextComment: EquipmentComment = {
        id: `comment-${Date.now()}`,
        text: commentText,
        authorId: currentUser?.id || null,
        authorName: currentUser?.name || currentUser?.username || "Сотрудник",
        createdAt: new Date().toISOString(),
      };
      const response = await apiRequest("PUT", `/api/equipment/${equipmentItem.id}`, {
        specifications: {
          ...asRecord(equipmentItem.specifications),
          equipmentComments: [...currentComments, nextComment],
        },
      });
      return response.json();
    },
    onSuccess: (updated: Equipment) => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      setDetailsEquipment(updated);
      setDetailsComment("");
      toast({ title: "Комментарий добавлен" });
    },
    onError: (e: any) => {
      toast({ title: "Ошибка", description: e?.message || "Не удалось добавить комментарий", variant: "destructive" });
    },
  });

  const sendToProjectMutation = useMutation({
    mutationFn: async ({
      projectId,
      equipmentIds,
      handoffAt,
      returnDate,
      returnTime,
      assignedByName,
      assignedByUserId,
    }: {
      projectId: string;
      equipmentIds: string[];
      handoffAt?: string;
      returnDate: string;
      returnTime?: string;
      assignedByName: string;
      assignedByUserId?: string;
    }) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/equipment-bundle`, {
        equipmentIds,
        handoffAt,
        returnDate,
        returnTime,
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
      setHandoffAt(toLocalDateTimeInputValue());
      setReturnDate("");
      setReturnTime("18:00");
    },
    onError: (e: any) => {
      toast({ title: "Ошибка", description: e?.message || "Не удалось отправить", variant: "destructive" });
    },
  });

  const passDocumentMutation = useMutation({
    mutationFn: async () => {
      if (cart.length === 0) throw new Error("Добавьте оборудование в корзину");
      const user = getCurrentUser();
      const res = await fetch(apiUrl("/api/equipment/pass-document"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipmentIds: cart.map((item) => item.id),
          direction: passDirection,
          projectId: sendToProjectId || undefined,
          basis: passBasis || undefined,
          handoffAt,
          returnDate: returnDate || undefined,
          returnTime: returnTime || undefined,
          responsibleName: user?.name || user?.username,
          responsiblePhone: passResponsiblePhone || user?.phone || undefined,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        let message = text;
        try {
          const json = text ? JSON.parse(text) : null;
          if (json?.message) message = json.message;
        } catch (_) {}
        throw new Error(message || "Не удалось сформировать пропуск");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Пропуск_${passDirection === "in" ? "внос" : "вынос"}_${new Date().toISOString().slice(0, 10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast({ title: "Готово", description: "Пропуск сформирован. Его можно открыть, распечатать или сохранить." });
    },
    onError: (e: any) => {
      toast({ title: "Ошибка", description: e?.message || "Не удалось сформировать пропуск", variant: "destructive" });
    },
  });

  const addToCart = (item: Equipment) => {
    if (cart.some((e) => e.id === item.id)) return;
    setCart((prev) => [...prev, item]);
    toast({ title: "В корзине", description: `${item.name} добавлено в корзину` });
  };
  const removeFromCart = (id: string) => setCart((prev) => prev.filter((e) => e.id !== id));
  const clearCart = () => { setCart([]); setCartOpen(false); };

  const matchesAssignedUser = (
    assignedTo: string | null | undefined,
    user: { id?: string | null; name?: string | null; username?: string | null },
  ) => {
    const normalized = String(assignedTo ?? "").trim();
    if (!normalized) return false;
    return [user.id, user.name, user.username]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .includes(normalized);
  };

  const matchesEmployeeFilter = (item: Equipment) => {
    if (!canApproveCheckout || employeeFilter === "all") return true;
    const assignedTo = String(item.assignedTo ?? "").trim();
    if (employeeFilter === "unassigned") return !assignedTo;
    if (employeeFilter.startsWith("raw:")) return assignedTo === employeeFilter.slice(4);
    const user = users.find((entry) => entry.id === employeeFilter);
    return user ? matchesAssignedUser(assignedTo, user) : assignedTo === employeeFilter;
  };

  const filteredEquipment = equipment.filter((item: Equipment) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = item.name.toLowerCase().includes(searchLower) ||
                         item.model?.toLowerCase().includes(searchLower) ||
                         item.serialNumber?.toLowerCase().includes(searchLower) ||
                         item.inventoryNumber?.toLowerCase().includes(searchLower) ||
                         item.barcode?.toLowerCase().includes(searchLower);
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;
    const matchesType = typeFilter === "all" || item.type === typeFilter;
    
    return matchesSearch && matchesStatus && matchesType && matchesEmployeeFilter(item);
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
  const selectedEquipmentForLabels = equipment.filter((e: Equipment) => selectedIds.has(e.id));
  const selectedEquipmentForBundle = equipment.filter((e: Equipment) => selectedIds.has(e.id));

  const exportBarcodesToExcel = () => {
    const BOM = "\uFEFF";
    const headers = [
      "Категория",
      "Название",
      "Модель",
      "Статус",
      "Сотрудник",
      "Проект",
      "Серийный номер",
      "Инв. номер",
      "Штрихкод",
      "Место",
      "Тех. характеристики",
      "Комментарий",
    ];
    const rows = toExport
      .map((item: Equipment) => {
        const projectInfo = getOnProjectInfo(item.id);
        return [
          getTypeText(item.type ?? "other"),
          item.name ?? "",
          item.model ?? "",
          getStatusText(item.status ?? ""),
          getAssignedUserName(item.assignedTo),
          projectInfo?.projectName ?? "",
          item.serialNumber ?? "",
          item.inventoryNumber ?? "",
          String(item.barcode ?? "").trim(),
          item.location ?? "",
          getSpecificationEntries(item.specifications).map(([key, value]) => `${key}: ${value}`).join("\n"),
          String(item.notes ?? "").trim(),
        ];
      })
      .sort((left, right) =>
        `${left[0]}|${left[4]}|${left[1]}`.localeCompare(`${right[0]}|${right[4]}|${right[1]}`, "ru"),
      );
    const csv = [headers.join(";"), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))].join("\r\n");
    const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `склад_штрихкоды_и_характеристики_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: "Выгружено",
      description: selectedIds.size > 0
        ? `Подготовлен отчёт по ${toExport.length} отмеченным позициям.`
        : `Подготовлен отчёт по ${toExport.length} позициям текущего списка.`,
    });
  };

  const printEquipmentLabelsMutation = useMutation({
    mutationFn: async (items: Equipment[]) => {
      if (items.length === 0) throw new Error("Выберите оборудование для печати этикеток");
      const holder = document.createElement("div");
      holder.style.position = "fixed";
      holder.style.left = "-10000px";
      holder.style.top = "0";
      holder.style.pointerEvents = "none";
      document.body.appendChild(holder);

      try {
        const labels = [];
        for (const item of items) {
          const value = String(item.inventoryNumber || item.barcode || item.serialNumber || `EQ${item.id.slice(0, 10).toUpperCase()}`).trim();
          if (!value) continue;
          const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          holder.appendChild(svg);
          renderCompactBarcodeLabel(svg, value);
          labels.push(await buildBarcodeLabelBitmapPayload(svg, value));
        }

        if (labels.length === 0) throw new Error("Нет инвентарника для печати этикетки");
        const response = await apiRequest("POST", "/api/equipment/labels/print-bitmaps", { labels });
        return response.json();
      } finally {
        holder.remove();
      }
    },
    onSuccess: (data: any) => {
      toast({
        title: "Этикетки отправлены",
        description: `Принтер: ${data?.printer || "TSC"}. Количество: ${data?.count || 0}.`,
      });
    },
    onError: (e: any) => {
      toast({
        title: "Ошибка печати",
        description: e?.message || "Не удалось отправить этикетки на принтер",
        variant: "destructive",
      });
    },
  });

  const calibrateLabelPrinterMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/equipment/labels/calibrate", {});
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Калибровка отправлена",
        description: `Принтер: ${data?.printer || "TSC"}.`,
      });
    },
    onError: (e: any) => {
      toast({
        title: "Ошибка калибровки",
        description: e?.message || "Не удалось откалибровать принтер",
        variant: "destructive",
      });
    },
  });

  const printEquipmentLabels = (items: Equipment[]) => {
    const printableItems = items.filter(Boolean);
    if (printableItems.length === 0) {
      toast({
        title: "Нечего печатать",
        description: "Выберите оборудование или нажмите печать на карточке.",
        variant: "destructive",
      });
      return;
    }
    printEquipmentLabelsMutation.mutate(printableItems);
  };

  const createBundleMutation = useMutation({
    mutationFn: async ({ name, type, items }: { name: string; type: string; items: Equipment[] }) => {
      if (items.length < 2) throw new Error("Выберите минимум две позиции для сборки");
      const cleanName = name.trim();
      if (!cleanName) throw new Error("Введите название сборки");

      const assembledAt = new Date().toISOString();
      const componentSnapshots = items.map((item) => ({
        id: item.id,
        name: item.name,
        model: item.model,
        inventoryNumber: item.inventoryNumber,
        serialNumber: item.serialNumber,
        type: item.type,
      }));

      const createResponse = await apiRequest("POST", "/api/equipment", {
        name: cleanName,
        type,
        model: `Сборка из ${items.length} позиций`,
        status: "available",
        location: items[0]?.location || "Склад",
        specifications: {
          isSuperPosition: true,
          bundleType: "super_position",
          bundleComponentIds: items.map((item) => item.id),
          bundleComponents: componentSnapshots,
          assembledAt,
          assembledByUserId: currentUser?.id || null,
          assembledByName: currentUser?.name || currentUser?.username || null,
          companyId: primaryCompanyId || undefined,
        },
        notes: `Супер позиция из ${items.length} комплектующих.`,
      });
      const bundle = await createResponse.json();

      await Promise.all(items.map((item) => {
        const specs = asRecord(item.specifications);
        return apiRequest("PUT", `/api/equipment/${item.id}`, {
          status: "in-use",
          location: `В составе: ${cleanName}`,
          specifications: {
            ...specs,
            parentBundleId: bundle.id,
            parentBundleName: cleanName,
            parentBundleCreatedAt: assembledAt,
          },
        });
      }));

      return bundle;
    },
    onSuccess: (bundle: Equipment) => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      setBundleDialogOpen(false);
      setBundleName("");
      setBundleType("computer");
      setSelectedIds(new Set());
      setDetailsEquipment(bundle);
      toast({
        title: "Сборка создана",
        description: "Комплектующие объединены в супер позицию на складе.",
      });
    },
    onError: (e: any) => {
      toast({
        title: "Ошибка сборки",
        description: e?.message || "Не удалось объединить позиции",
        variant: "destructive",
      });
    },
  });

  const openBundleDialog = () => {
    if (selectedEquipmentForBundle.length < 2) {
      toast({
        title: "Выберите позиции",
        description: "Для супер позиции нужно отметить минимум две складские карточки.",
      });
      return;
    }
    if (!bundleName.trim()) {
      const first = selectedEquipmentForBundle[0];
      setBundleName(first?.type === "computer" ? `Сборка ${first.name}` : `Комплект ${selectedEquipmentForBundle.length} поз.`);
    }
    setBundleDialogOpen(true);
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

  const requestCheckoutMutation = useMutation({
    mutationFn: async ({
      equipmentId,
      location,
      note,
      companyId,
      requestType,
    }: {
      equipmentId: string;
      location?: string;
      note?: string;
      companyId?: string;
      requestType?: "checkout" | "transfer";
    }) => {
      const response = await apiRequest("POST", "/api/equipment-checkout-requests", {
        equipmentId,
        location,
        note,
        companyId,
        requestType,
      });
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment-checkout-requests"] });
      const isTransfer = variables.requestType === "transfer";
      toast({
        title: isTransfer ? "Запрос на перенос отправлен" : "Запрос отправлен",
        description: isTransfer
          ? "Главный по компании увидит запрос и решит, можно ли перенести оборудование вам."
          : "Главный по компании увидит запрос и сможет подтвердить выдачу.",
      });
      setRequestEquipment(null);
      setRequestLocation("");
      setRequestNote("");
    },
    onError: (e: any) => {
      toast({ title: "Ошибка", description: e?.message || "Не удалось отправить запрос", variant: "destructive" });
    },
  });

  const approveCheckoutMutation = useMutation({
    mutationFn: async (requestIdOrIds: string | string[]) => {
      const requestIds = Array.isArray(requestIdOrIds) ? requestIdOrIds : [requestIdOrIds];
      const responses = await Promise.all(
        requestIds.map((requestId) => apiRequest("POST", `/api/equipment-checkout-requests/${requestId}/approve`, {})),
      );
      return Promise.all(responses.map((response) => response.json().catch(() => null)));
    },
    onSuccess: (_, requestIdOrIds) => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment-checkout-requests"] });
      const requestId = Array.isArray(requestIdOrIds) ? requestIdOrIds[0] : requestIdOrIds;
      const request = checkoutRequests.find((item) => item.id === requestId);
      const isTransfer = request?.requestType === "transfer";
      const count = Array.isArray(requestIdOrIds) ? requestIdOrIds.length : 1;
      toast({
        title: isTransfer ? "Перенос подтверждён" : "Выдача подтверждена",
        description: isTransfer
          ? "Оборудование переназначено сотруднику."
          : "Оборудование закреплено за сотрудником.",
      });
    },
    onError: (e: any) => {
      toast({ title: "Ошибка", description: e?.message || "Не удалось подтвердить выдачу", variant: "destructive" });
    },
  });

  const rejectCheckoutMutation = useMutation({
    mutationFn: async (requestIdOrIds: string | string[]) => {
      const requestIds = Array.isArray(requestIdOrIds) ? requestIdOrIds : [requestIdOrIds];
      const responses = await Promise.all(
        requestIds.map((requestId) => apiRequest("POST", `/api/equipment-checkout-requests/${requestId}/reject`, {})),
      );
      return Promise.all(responses.map((response) => response.json().catch(() => null)));
    },
    onSuccess: (_, requestIdOrIds) => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment-checkout-requests"] });
      const requestId = Array.isArray(requestIdOrIds) ? requestIdOrIds[0] : requestIdOrIds;
      const request = checkoutRequests.find((item) => item.id === requestId);
      const count = Array.isArray(requestIdOrIds) ? requestIdOrIds.length : 1;
      toast({
        title: request?.requestType === "transfer" ? "Перенос отклонён" : "Запрос отклонён",
        description: "Сотрудник увидит решение в уведомлениях.",
      });
    },
    onError: (e: any) => {
      toast({ title: "Ошибка", description: e?.message || "Не удалось отклонить запрос", variant: "destructive" });
    },
  });

  const quickReturnMutation = useMutation({
    mutationFn: async (equipmentId: string) => {
      const response = await apiRequest("PUT", `/api/equipment/${equipmentId}`, {
        status: "available",
        assignedTo: null,
        lastUsed: new Date(),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast({ title: "Оборудование возвращено", description: "Позиция снова доступна на складе." });
    },
    onError: (e: any) => {
      toast({ title: "Ошибка", description: e?.message || "Не удалось вернуть оборудование", variant: "destructive" });
    },
  });

  const deleteEquipmentMutation = useMutation({
    mutationFn: async (equipmentId: string) => {
      const response = await apiRequest("DELETE", `/api/equipment/${equipmentId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment-checkout-requests"] });
      toast({ title: "Удалено", description: "Позиция убрана со склада." });
    },
    onError: (e: any) => {
      toast({ title: "Ошибка", description: e?.message || "Не удалось удалить оборудование", variant: "destructive" });
    },
  });

  const takeCartForSelfMutation = useMutation({
    mutationFn: async (items: Equipment[]) => {
      const direct = userCanReserve;
      const requests = items.map((item) =>
        direct
          ? apiRequest("PUT", `/api/equipment/${item.id}`, {
              status: "in-use",
              assignedTo: currentUser?.id,
              lastUsed: new Date(),
              location: item.location || `У сотрудника ${currentUser?.name || currentUser?.username || ""}`.trim(),
            })
          : apiRequest("POST", "/api/equipment-checkout-requests", {
              equipmentId: item.id,
              companyId: primaryCompanyId,
              location: item.location || `У сотрудника ${currentUser?.name || currentUser?.username || ""}`.trim(),
            }),
      );
      const responses = await Promise.all(requests);
      return Promise.all(responses.map((response) => response.json().catch(() => null)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment-checkout-requests"] });
      setCart([]);
      setCartOpen(false);
      toast({
        title: userCanReserve ? "Оборудование выдано" : "Запросы отправлены",
        description: userCanReserve
          ? "Позиции закреплены за сотрудником."
          : "Главный по компании увидит запросы на выдачу.",
      });
    },
    onError: (e: any) => {
      toast({ title: "Ошибка", description: e?.message || "Не удалось оформить выдачу", variant: "destructive" });
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

  const getAssignedUserName = (assignedTo: string | null | undefined) => {
    const normalized = String(assignedTo ?? "").trim();
    if (!normalized) return "";

    const matchedUser = users.find((user) => {
      const candidates = [user.id, user.name, user.username]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean);
      return candidates.includes(normalized);
    });

    return matchedUser?.name?.trim() || matchedUser?.username?.trim() || normalized;
  };

  const isCurrentUserMatch = (value: string | null | undefined) => {
    const normalized = String(value ?? "").trim();
    if (!normalized || !currentUser) return false;
    return [currentUser.id, currentUser.name, currentUser.username]
      .map((item: unknown) => String(item ?? "").trim())
      .filter(Boolean)
      .includes(normalized);
  };

  const getCheckoutRequestType = (request?: { requestType?: string | null }, item?: Equipment | null) => {
    if (request?.requestType === "transfer") return "transfer";
    if (item?.status === "in-use" && item.assignedTo && !isCurrentUserMatch(item.assignedTo)) return "transfer";
    return "checkout";
  };

  const canRequestEquipmentItem = (item: Equipment, projectInfo?: { projectId?: string } | undefined) => {
    if (!canRequestCheckout || projectInfo) return false;
    if (item.status === "available") return true;
    return item.status === "in-use" && Boolean(item.assignedTo) && !isCurrentUserMatch(item.assignedTo);
  };

  const pendingRequests = checkoutRequests.filter((item) => item.status === "pending");
  const managedPendingRequests = pendingRequests.filter((item) =>
    manageableCompanyIds.includes(String(item.companyId || "").trim()),
  );
  const requestGroupTime = (value?: string | null) => {
    const date = value ? new Date(value) : new Date(0);
    if (Number.isNaN(date.getTime())) return "no-date";
    date.setSeconds(0, 0);
    return date.toISOString();
  };
  const managedPendingRequestGroups = Object.values(
    managedPendingRequests.reduce<Record<string, {
      id: string;
      requests: typeof managedPendingRequests;
      requester: string;
      requestType: string;
      location?: string | null;
      createdAt?: string;
    }>>((acc, request) => {
      const key = [
        request.requestedBy,
        request.requestType || "checkout",
        request.location || "",
        requestGroupTime(request.createdAt),
      ].join("|");
      if (!acc[key]) {
        acc[key] = {
          id: key,
          requests: [],
          requester: request.requestedBy,
          requestType: request.requestType || "checkout",
          location: request.location,
          createdAt: request.createdAt,
        };
      }
      acc[key].requests.push(request);
      return acc;
    }, {}),
  ).sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime());
  const getPendingRequestForEquipment = (equipmentId: string) =>
    pendingRequests.find((item) => item.equipmentId === equipmentId);

  const canDeleteEquipmentItem = (item: Equipment) => {
    const specifications = (item.specifications && typeof item.specifications === "object" && !Array.isArray(item.specifications))
      ? item.specifications as Record<string, unknown>
      : {};
    const creatorId = String(specifications.createdByUserId ?? "").trim();
    const companyId = String(specifications.companyId ?? "").trim();
    if (creatorId && currentUser?.id === creatorId) return true;
    if (manageableCompanyIds.includes(companyId)) return true;
    return Array.isArray(currentUser?.permissions) && currentUser.permissions.includes("equipment:delete");
  };

  const employeeFilterOptions = users
    .map((user) => ({
      id: user.id,
      label: user.name || user.username || "Сотрудник",
      count: equipment.filter((item) => matchesAssignedUser(item.assignedTo, user)).length,
    }))
    .filter((option) => option.count > 0)
    .sort((left, right) => left.label.localeCompare(right.label, "ru"));

  const unknownEmployeeFilterOptions = Array.from(
    new Set(
      equipment
        .map((item) => String(item.assignedTo ?? "").trim())
        .filter(Boolean)
        .filter((assignedTo) => !users.some((user) => matchesAssignedUser(assignedTo, user))),
    ),
  ).map((assignedTo) => ({
    id: `raw:${assignedTo}`,
    label: assignedTo,
    count: equipment.filter((item) => String(item.assignedTo ?? "").trim() === assignedTo).length,
  }));

  const getRequestStatusText = (status: string | null | undefined) => {
    switch (status) {
      case "approved": return "Подтверждено";
      case "rejected": return "Отклонено";
      case "pending": return "Ожидает решения";
      default: return status || "История";
    }
  };

  const myCurrentEquipment = equipment.filter((item) => item.status === "in-use" && isCurrentUserMatch(item.assignedTo));
  const myHistoryItems = [
    ...myCurrentEquipment.map((item) => ({
      id: `current-${item.id}`,
      equipmentName: item.name,
      model: item.model,
      status: "Сейчас у вас",
      tone: "current",
      date: item.lastUsed ? new Date(item.lastUsed) : null,
      location: item.location,
      note: "",
    })),
    ...checkoutRequests
      .filter((request) => isCurrentUserMatch(request.requestedBy))
      .map((request) => {
        const item = equipment.find((entry) => entry.id === request.equipmentId);
        return {
          id: `request-${request.id}`,
          equipmentName: item?.name || "Оборудование",
          model: item?.model,
          status: request.requestType === "transfer"
            ? `Перенос: ${getRequestStatusText(request.status)}`
            : `Выдача: ${getRequestStatusText(request.status)}`,
          tone: request.status || "history",
          date: request.createdAt ? new Date(request.createdAt) : null,
          location: request.location,
          note: request.decisionNote || request.note || "",
        };
      }),
  ].sort((left, right) => (right.date?.getTime() || 0) - (left.date?.getTime() || 0));

  const myHistoryGroups = Object.values(
    myHistoryItems.reduce<Record<string, {
      id: string;
      status: string;
      tone: string;
      date: Date | null;
      location?: string | null;
      note?: string;
      items: typeof myHistoryItems;
    }>>((acc, entry) => {
      const date = entry.date ? new Date(entry.date) : null;
      if (date && !Number.isNaN(date.getTime())) date.setSeconds(0, 0);
      const key = [
        entry.status,
        entry.location || "",
        date ? date.toISOString() : "no-date",
      ].join("|");
      if (!acc[key]) {
        acc[key] = {
          id: key,
          status: entry.status,
          tone: entry.tone,
          date: entry.date,
          location: entry.location,
          note: entry.note,
          items: [],
        };
      }
      acc[key].items.push(entry);
      if (!acc[key].note && entry.note) acc[key].note = entry.note;
      return acc;
    }, {}),
  ).sort((left, right) => (right.date?.getTime() || 0) - (left.date?.getTime() || 0));

  const equipmentByEmployee = equipment
    .filter((item) => item.status === "in-use" && item.assignedTo)
    .reduce<Record<string, Equipment[]>>((acc, item) => {
      const key = String(item.assignedTo || "").trim();
      if (!key) return acc;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});

  const isReturnOverdue = (returnDateStr: string, returnTimeStr?: string) => {
    const due = new Date(`${returnDateStr}T${returnTimeStr || "23:59"}`);
    if (Number.isNaN(due.getTime())) {
      const today = new Date().toISOString().slice(0, 10);
      return returnDateStr < today;
    }
    return due.getTime() < Date.now();
  };

  const overdueCount = equipmentOnProjects.filter((x) => isReturnOverdue(x.returnDate, x.returnTime)).length;
  const activeFilterCount =
    Number(statusFilter !== "all") +
    Number(typeFilter !== "all") +
    Number(Boolean(searchTerm.trim())) +
    Number(canApproveCheckout && employeeFilter !== "all");
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
    <div className="flex flex-col min-h-0 h-full gap-4">
      {/* Header: фиксированная шапка и фильтры, скролл только у списка */}
      <div className="flex flex-col gap-3 flex-shrink-0">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white truncate">Склад техники</h2>
          {userCanCreate && (
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
          <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="flex-1 min-w-0 sm:flex-none border-slate-300 dark:border-slate-600">
                <History className="w-4 h-4 mr-1.5 sm:mr-2" />
                Моя история
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-lg flex flex-col p-0">
              <SheetHeader>
                <SheetTitle className="px-4 pt-4">Моя история склада</SheetTitle>
              </SheetHeader>
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
                {myHistoryGroups.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    Пока нет выдач и запросов.
                  </div>
                ) : (
                  myHistoryGroups.map((group) => (
                    <div key={group.id} className="rounded-md border bg-card p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium leading-snug text-slate-900 dark:text-white">
                            {group.items.length === 1 ? group.items[0].equipmentName : `${group.items.length} позиций оборудования`}
                          </div>
                          <div className="mt-1 space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {group.items.slice(0, 8).map((item) => (
                              <div key={item.id} className="break-words">
                                {item.equipmentName}{item.model ? ` · ${item.model}` : ""}
                              </div>
                            ))}
                            {group.items.length > 8 && (
                              <div>+ ещё {group.items.length - 8}</div>
                            )}
                          </div>
                        </div>
                        <Badge variant={group.tone === "rejected" ? "destructive" : "outline"} className="shrink-0">
                          {group.status}
                        </Badge>
                      </div>
                      <div className="mt-3 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                        {group.date && (
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            Забрал: {formatDateTime(group.date.toISOString())}
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          Вернул: {group.status.includes("Сейчас") ? "пока на руках" : "по отметке склада"}
                        </div>
                        {group.location && (
                          <div className="flex items-start gap-1.5">
                            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span className="break-words">{group.location}</span>
                          </div>
                        )}
                        {group.note && (
                          <div className="break-words text-slate-600 dark:text-slate-300">{group.note}</div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </SheetContent>
          </Sheet>
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
            <SheetContent className="w-full sm:max-w-lg flex flex-col p-0">
              <SheetHeader>
                <SheetTitle className="px-4 pt-4">Корзина оборудования</SheetTitle>
              </SheetHeader>
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-2">
                {cart.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Добавьте оборудование с карточек кнопкой «Корзина»</p>
                ) : (
                  cart.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-2 p-3 rounded-md border bg-card">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium leading-snug break-words">{item.name}</p>
                        <p className="text-xs text-muted-foreground break-words">
                          {[item.model, getTypeText(item.type)].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => removeFromCart(item.id)}>
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
              {cart.length > 0 && (
                <div className="border-t px-4 py-4 space-y-3 bg-background">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Позиций: {cart.length}</span>
                    {sendToProjectId && <span className="truncate ml-3">{projects.find((p) => p.id === sendToProjectId)?.name}</span>}
                  </div>
                  {userCanReserve && (
                    <>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Отправить на проект</label>
                        <Select value={sendToProjectId} onValueChange={setSendToProjectId}>
                          <SelectTrigger className="bg-white dark:bg-slate-800">
                            <SelectValue placeholder={projects.length > 0 ? "Выберите проект" : "Нет доступных проектов"} />
                          </SelectTrigger>
                          <SelectContent>
                            {projects.length > 0 ? (
                              projects.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name}
                                  {equipmentCountByProject[p.id] ? ` (${equipmentCountByProject[p.id]})` : ""}
                                </SelectItem>
                              ))
                            ) : (
                              <SelectItem value="_empty" disabled>Нет доступных проектов</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        {projects.length === 0 && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            В рабочем пространстве пока нет проектов. Можно забрать оборудование себе.
                          </p>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Выдать</label>
                          <Input
                            type="datetime-local"
                            value={handoffAt}
                            onChange={(e) => setHandoffAt(e.target.value)}
                            className="bg-white dark:bg-slate-800"
                          />
                        </div>
                        <div className="grid grid-cols-[1fr_92px] gap-2">
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Вернуть до <span className="text-red-500">*</span></label>
                            <Input
                              type="date"
                              value={returnDate}
                              onChange={(e) => setReturnDate(e.target.value)}
                              min={new Date().toISOString().slice(0, 10)}
                              className="bg-white dark:bg-slate-800"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Время</label>
                            <Input
                              type="time"
                              value={returnTime}
                              onChange={(e) => setReturnTime(e.target.value)}
                              className="bg-white dark:bg-slate-800 px-2"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="rounded-md border bg-muted/20 p-3 space-y-3">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          Пропуск на материальные ценности
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Направление</label>
                            <Select value={passDirection} onValueChange={(value) => setPassDirection(value === "in" ? "in" : "out")}>
                              <SelectTrigger className="bg-white dark:bg-slate-800">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="out">Вынос</SelectItem>
                                <SelectItem value="in">Внос</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Телефон ответственного</label>
                            <Input
                              value={passResponsiblePhone}
                              onChange={(e) => setPassResponsiblePhone(e.target.value)}
                              placeholder="+7..."
                              className="bg-white dark:bg-slate-800"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Основание</label>
                          <Input
                            value={passBasis}
                            onChange={(e) => setPassBasis(e.target.value)}
                            placeholder="Например: работы по проекту"
                            className="bg-white dark:bg-slate-800"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          disabled={passDocumentMutation.isPending}
                          onClick={() => passDocumentMutation.mutate()}
                        >
                          <FileText className="w-4 h-4 mr-2" />
                          {passDocumentMutation.isPending ? "Формирование..." : "Скачать пропуск DOCX"}
                        </Button>
                      </div>
                    </>
                  )}
                  <div className={cn("grid gap-2", userCanReserve ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2")}>
                    <Button variant="outline" onClick={clearCart}>Очистить</Button>
                    <Button
                      variant="outline"
                      disabled={!canRequestCheckout || takeCartForSelfMutation.isPending}
                      onClick={() => takeCartForSelfMutation.mutate(cart)}
                    >
                      {takeCartForSelfMutation.isPending ? (
                        "Оформление..."
                      ) : (
                        <>
                          <User className="w-4 h-4 mr-2" />
                          {userCanReserve ? "Забрать себе" : "Запросить себе"}
                        </>
                      )}
                    </Button>
                    {userCanReserve && (
                      <Button
                        disabled={!sendToProjectId || !returnDate || sendToProjectMutation.isPending}
                        onClick={() => {
                          const user = getCurrentUser();
                          const name = user?.name || user?.username || "Сотрудник";
                          if (sendToProjectId && returnDate) {
                            sendToProjectMutation.mutate({
                              projectId: sendToProjectId,
                              equipmentIds: cart.map((e) => e.id),
                              handoffAt,
                              returnDate,
                              returnTime,
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
                    )}
                  </div>
                </div>
              )}
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Mobile Filters */}
      <div className="sm:hidden">
        <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-between border-slate-200 bg-slate-50 text-left dark:border-slate-700 dark:bg-slate-900/50"
            >
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4" />
                Фильтры и поиск
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {activeFilterCount > 0 ? `${activeFilterCount} активно` : "Все позиции"}
              </span>
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl border-slate-200 bg-white px-4 pb-6 pt-4 dark:border-slate-700 dark:bg-slate-950">
            <SheetHeader>
              <SheetTitle>Фильтры склада</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Поиск: название, модель, серийник, штрихкод"
                  className="pl-9 pr-9 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                    aria-label="Очистить поиск"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
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
                <SelectTrigger className="w-full bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
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

              {canApproveCheckout && (
                <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                  <SelectTrigger className="w-full bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                    <SelectValue placeholder="Сотрудник" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все сотрудники</SelectItem>
                    <SelectItem value="unassigned">Без сотрудника</SelectItem>
                    {employeeFilterOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label} ({option.count})
                      </SelectItem>
                    ))}
                    {unknownEmployeeFilterOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label} ({option.count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <div className="grid grid-cols-1 gap-2">
                <Button
                  variant="outline"
                  className="border-slate-200 dark:border-slate-700"
                  onClick={() => {
                    setSearchTerm("");
                    setStatusFilter("all");
                    setTypeFilter("all");
                    setEmployeeFilter("all");
                  }}
                >
                  Сбросить
                </Button>
                <Button variant="outline" className="border-slate-200 dark:border-slate-700" onClick={toggleSelectAll}>
                  {selectedIds.size >= filteredEquipment.length && filteredEquipment.length > 0 ? "Снять выбор" : "Выбрать все"}
                </Button>
                <Button
                  variant="outline"
                  className="border-slate-200 dark:border-slate-700"
                  onClick={exportBarcodesToExcel}
                  disabled={toExport.length === 0}
                >
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  {selectedIds.size > 0 ? `Отчёт Excel (${selectedIds.size})` : "Отчёт в Excel"}
                </Button>
                <Button
                  variant="outline"
                  className="border-slate-200 dark:border-slate-700"
                  onClick={() => printEquipmentLabels(selectedEquipmentForLabels)}
                  disabled={selectedEquipmentForLabels.length === 0 || printEquipmentLabelsMutation.isPending}
                  title="Выберите карточки галочками, чтобы напечатать пачку этикеток"
                >
                  <Printer className="mr-2 h-4 w-4" />
                  {selectedEquipmentForLabels.length > 0 ? `Печать (${selectedEquipmentForLabels.length})` : "Печать этикеток"}
                </Button>
                <Button
                  variant="outline"
                  className="border-slate-200 dark:border-slate-700"
                  onClick={openBundleDialog}
                  disabled={selectedEquipmentForBundle.length < 2 || createBundleMutation.isPending}
                  title="Отметьте комплектующие и соберите их в одну складскую позицию"
                >
                  <Package className="mr-2 h-4 w-4" />
                  {selectedEquipmentForBundle.length >= 2 ? `Собрать (${selectedEquipmentForBundle.length})` : "Собрать комплект"}
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Filters */}
      <div className="hidden sm:flex flex-col sm:flex-row sm:flex-wrap gap-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-md border border-slate-200 dark:border-slate-800">
        <div className="relative w-full sm:min-w-[260px] sm:flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Поиск: название, модель, серийник, штрихкод"
            className="pl-9 pr-9 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              aria-label="Очистить поиск"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
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

        {canApproveCheckout && (
          <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
            <SelectTrigger className="w-full sm:w-[190px] bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <SelectValue placeholder="Сотрудник" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все сотрудники</SelectItem>
              <SelectItem value="unassigned">Без сотрудника</SelectItem>
              {employeeFilterOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label} ({option.count})
                </SelectItem>
              ))}
              {unknownEmployeeFilterOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label} ({option.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button 
          variant="outline" 
          className="border-slate-300 dark:border-slate-600"
          onClick={() => {
            setSearchTerm("");
            setStatusFilter("all");
            setTypeFilter("all");
            setEmployeeFilter("all");
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
          title={selectedIds.size > 0 ? "Выгрузить отмеченное оборудование в Excel" : "Выгрузить текущий список оборудования в Excel"}
        >
          <FileSpreadsheet className="w-4 h-4 mr-1.5 sm:mr-2" />
          {selectedIds.size > 0 ? `Отчёт Excel (${selectedIds.size})` : "Отчёт в Excel"}
        </Button>
        <Button
          variant="outline"
          className="border-slate-300 dark:border-slate-600"
          onClick={() => printEquipmentLabels(selectedEquipmentForLabels)}
          disabled={selectedEquipmentForLabels.length === 0 || printEquipmentLabelsMutation.isPending}
          title="Выберите карточки галочками, чтобы напечатать пачку этикеток"
        >
          <Printer className="w-4 h-4 mr-1.5 sm:mr-2" />
          {selectedEquipmentForLabels.length > 0 ? `Печать (${selectedEquipmentForLabels.length})` : "Печать этикеток"}
        </Button>
        <Button
          variant="outline"
          className="border-slate-300 dark:border-slate-600"
          onClick={openBundleDialog}
          disabled={selectedEquipmentForBundle.length < 2 || createBundleMutation.isPending}
          title="Отметьте комплектующие и соберите их в одну складскую позицию"
        >
          <Package className="w-4 h-4 mr-1.5 sm:mr-2" />
          {selectedEquipmentForBundle.length >= 2 ? `Собрать (${selectedEquipmentForBundle.length})` : "Собрать комплект"}
        </Button>
      </div>

      {canApproveCheckout && managedPendingRequestGroups.length > 0 && (
        <Card className="border-violet-200/70 bg-violet-50/60 dark:border-violet-900 dark:bg-violet-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-slate-900 dark:text-white">
              Запросы на выдачу и перенос оборудования
            </CardTitle>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Сотрудники ждут решения. После апрува позиция либо выдаётся, либо переносится на нового сотрудника.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {managedPendingRequestGroups.map((group) => {
              const request = group.requests[0];
              const groupRequestIds = group.requests.map((entry) => entry.id);
              const groupItems = group.requests
                .map((entry) => equipment.find((item) => item.id === entry.equipmentId))
                .filter(Boolean) as Equipment[];
              const item = equipment.find((entry) => entry.id === request.equipmentId);
              const requester = getAssignedUserName(request.requestedBy);
              const requestType = getCheckoutRequestType(request, item);
              const currentHolderName = getAssignedUserName(request.currentHolder || item?.assignedTo);
              return (
                <div
                  key={group.id}
                  className="flex flex-col gap-3 rounded-xl border border-violet-200/70 bg-white/90 p-4 dark:border-violet-900/60 dark:bg-slate-900/80 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="font-medium text-slate-900 dark:text-white">
                      {groupItems.length <= 1 ? (item?.name || "Оборудование") : `${groupItems.length} позиций оборудования`}
                    </div>
                    {groupItems.length > 1 && (
                      <div className="space-y-0.5 text-sm text-slate-500 dark:text-slate-400">
                        {groupItems.slice(0, 8).map((entry) => (
                          <div key={entry.id} className="break-words">
                            {entry.name}{entry.model ? ` · ${entry.model}` : ""}
                          </div>
                        ))}
                        {groupItems.length > 8 && <div>+ ещё {groupItems.length - 8}</div>}
                      </div>
                    )}
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      {requestType === "transfer" ? "Просит перенести" : "Запросил"}: {requester || "Сотрудник"}
                    </div>
                    {requestType === "transfer" && currentHolderName && (
                      <div className="text-sm text-slate-500 dark:text-slate-400">
                        Сейчас у сотрудника: {currentHolderName}
                      </div>
                    )}
                    {request.location && (
                      <div className="text-sm text-slate-500 dark:text-slate-400">
                        {requestType === "transfer" ? "Куда переносит" : "Куда берёт"}: {request.location}
                      </div>
                    )}
                    {request.note && (
                      <div className="text-sm text-slate-500 dark:text-slate-400 break-words">
                        Комментарий: {request.note}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                      disabled={approveCheckoutMutation.isPending}
                      onClick={() => approveCheckoutMutation.mutate(groupRequestIds)}
                    >
                      <PackageCheck className="mr-2 h-4 w-4" />
                      Разрешить
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={rejectCheckoutMutation.isPending}
                      onClick={() => rejectCheckoutMutation.mutate(groupRequestIds)}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Отклонить
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {false && canApproveCheckout && Object.keys(equipmentByEmployee).length > 0 && (
        <Card className="border-slate-200/80 bg-white/90 dark:border-slate-800 dark:bg-slate-900/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-slate-900 dark:text-white">
              Что сейчас на руках у сотрудников
            </CardTitle>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Здесь видно, кто что забрал себе вне проектных наборов.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 lg:grid-cols-2">
            {Object.entries(equipmentByEmployee).map(([userId, items]) => (
              <div
                key={userId}
                className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/40"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="font-medium text-slate-900 dark:text-white">
                    {getAssignedUserName(userId) || "Сотрудник"}
                  </div>
                  <Badge variant="outline">{items.length}</Badge>
                </div>
                <div className="space-y-1.5 text-sm text-slate-500 dark:text-slate-400">
                  {items.map((item) => (
                    <div key={item.id} className="break-words">
                      {item.name}
                      {item.model ? ` · ${item.model}` : ""}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Equipment Grid: скролл только здесь, контент не съезжает за края */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="grid grid-cols-1 gap-3 pb-4 sm:grid-cols-2 sm:gap-4 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {filteredEquipment.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <Package className="w-12 h-12 mx-auto mb-4 text-slate-300 dark:text-slate-600" />
            <p className="text-slate-500 dark:text-slate-400">Оборудование не найдено</p>
          </div>
        ) : (
          filteredEquipment.map((item: Equipment) => {
            const projectInfo = getOnProjectInfo(item.id);
            const pendingRequest = getPendingRequestForEquipment(item.id);
            const requestType = getCheckoutRequestType(pendingRequest, item);
            const requestedByMe = pendingRequest?.requestedBy && isCurrentUserMatch(pendingRequest.requestedBy);
            const canReturnOwnItem = item.status === "in-use" && isCurrentUserMatch(item.assignedTo);
            const takenByName =
              !projectInfo && item.status === "in-use"
                ? getAssignedUserName(item.assignedTo)
                : "";
            const hasDescription = Boolean(
              String(item.notes ?? "").trim() ||
                getSpecificationEntries(item.specifications).length > 0,
            );
            const itemComments = getEquipmentComments(item);
            const canRequestThisItem = !userCanReserve && !canReturnOwnItem && canRequestEquipmentItem(item, projectInfo);

            return (
              <Card
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => setDetailsEquipment(item)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setDetailsEquipment(item);
                  }
                }}
                className="cursor-pointer overflow-hidden border border-slate-200 bg-white transition-all hover:border-slate-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:border-slate-700 dark:bg-slate-800/90 dark:hover:border-slate-600"
              >
              <CardHeader className="space-y-2 p-3 pb-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    <div
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                      className="shrink-0"
                    >
                      <Checkbox
                        checked={selectedIds.has(item.id)}
                        onCheckedChange={() => toggleSelect(item.id)}
                        className="shrink-0"
                        title="Выбрать для выгрузки в Excel"
                      />
                    </div>
                    {projectInfo ? (
                      <Badge className="max-w-full bg-violet-100 text-[11px] text-violet-800 dark:bg-violet-900/40 dark:text-violet-300">
                        На проекте
                      </Badge>
                    ) : pendingRequest ? (
                      <Badge className="max-w-full bg-amber-100 text-[11px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                        {requestedByMe
                          ? requestType === "transfer" ? "Ждёт перенос" : "Ждёт апрув"
                          : requestType === "transfer" ? "Есть перенос" : "Есть запрос"}
                      </Badge>
                    ) : (
                      <Badge className={`${getStatusColor(item.status)} text-[11px]`}>
                        {getStatusText(item.status)}
                      </Badge>
                    )}
                    {isSuperPosition(item) && (
                      <Badge className="bg-emerald-100 text-[11px] text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                        Сборка
                      </Badge>
                    )}
                    {getParentBundleName(item) && (
                      <Badge className="bg-blue-100 text-[11px] text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                        В сборке
                      </Badge>
                    )}
                  </div>

                  <div className="flex w-full flex-wrap items-center justify-end gap-1 sm:w-auto sm:max-w-[220px]">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 hover:bg-slate-100 dark:hover:bg-slate-700 sm:h-7 sm:w-7"
                      onClick={(event) => {
                        event.stopPropagation();
                        setDetailsEquipment(item);
                      }}
                      title={hasDescription ? "Описание и тех. характеристики" : "Открыть описание"}
                      data-testid={`button-details-${item.id}`}
                    >
                      <FileText className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 hover:bg-slate-100 dark:hover:bg-slate-700 sm:h-7 sm:w-7"
                      onClick={(event) => {
                        event.stopPropagation();
                        setBarcodeEquipment(item);
                        setIsBarcodeModalOpen(true);
                      }}
                      title="Штрих-код"
                      data-testid={`button-barcode-${item.id}`}
                    >
                      <QrCode className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 hover:bg-slate-100 dark:hover:bg-slate-700 sm:h-7 sm:w-7"
                      onClick={(event) => {
                        event.stopPropagation();
                        printEquipmentLabels([item]);
                      }}
                      title="Напечатать этикетку"
                      disabled={printEquipmentLabelsMutation.isPending}
                      data-testid={`button-print-label-${item.id}`}
                    >
                      <Printer className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 hover:bg-slate-100 dark:hover:bg-slate-700 sm:h-7 sm:w-7"
                      onClick={(event) => {
                        event.stopPropagation();
                        calibrateLabelPrinterMutation.mutate();
                      }}
                      title="Калибровка принтера этикеток"
                      disabled={calibrateLabelPrinterMutation.isPending}
                      data-testid={`button-calibrate-label-${item.id}`}
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 hover:bg-slate-100 dark:hover:bg-slate-700 sm:h-7 sm:w-7"
                      onClick={(event) => {
                        event.stopPropagation();
                        addToCart(item);
                      }}
                      title="В корзину"
                      disabled={cart.some((e) => e.id === item.id) || !!projectInfo}
                    >
                      <ShoppingCart className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                    </Button>
                    {userCanReserve && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 hover:bg-slate-100 dark:hover:bg-slate-700 sm:h-7 sm:w-7"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedEquipment(item);
                          setFormMode("take_return");
                          setIsFormOpen(true);
                        }}
                        title={item.status === "in-use" ? "Вернуть" : "Взять"}
                        data-testid={`button-take-return-${item.id}`}
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                      </Button>
                    )}
                    {!userCanReserve && canReturnOwnItem && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 hover:bg-slate-100 dark:hover:bg-slate-700 sm:h-7 sm:w-7"
                        onClick={(event) => {
                          event.stopPropagation();
                          quickReturnMutation.mutate(item.id);
                        }}
                        title="Вернуть"
                        disabled={quickReturnMutation.isPending}
                      >
                        <PackageCheck className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                      </Button>
                    )}
                    {canRequestThisItem && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 hover:bg-slate-100 dark:hover:bg-slate-700 sm:h-7 sm:w-7"
                        onClick={(event) => {
                          event.stopPropagation();
                          setRequestEquipment(item);
                          setRequestLocation(item.location || "");
                          setRequestNote("");
                        }}
                        title={
                          pendingRequest
                            ? requestType === "transfer" ? "Запрос на перенос уже отправлен" : "Запрос уже отправлен"
                            : requestType === "transfer" ? "Запросить перенос" : "Запросить выдачу"
                        }
                        disabled={Boolean(pendingRequest)}
                      >
                        {pendingRequest ? (
                          <Clock className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                        ) : (
                          <Send className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                        )}
                      </Button>
                    )}
                    {userCanEdit ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 hover:bg-slate-100 dark:hover:bg-slate-700 sm:h-7 sm:w-7"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedEquipment(item);
                          setFormMode("full");
                          setIsFormOpen(true);
                        }}
                        title="Редактировать"
                        data-testid={`button-edit-${item.id}`}
                      >
                        <Edit className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                      </Button>
                    ) : null}
                    {canDeleteEquipmentItem(item) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 hover:bg-red-50 dark:hover:bg-red-950/30 sm:h-7 sm:w-7"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (window.confirm(`Удалить «${item.name}» со склада?`)) {
                            deleteEquipmentMutation.mutate(item.id);
                          }
                        }}
                        title="Удалить"
                        disabled={deleteEquipmentMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary dark:bg-primary/20">
                    {getTypeIcon(item.type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="break-words text-sm leading-tight text-slate-900 dark:text-white sm:text-base">
                      {item.name}
                    </CardTitle>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 sm:text-xs">
                      {getTypeText(item.type)}
                    </p>
                  </div>
                </div>

                {projectInfo && (userCanReserve || (currentUser?.id && projectInfo.assignedByUserId === currentUser.id)) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    title="Вернуть на склад"
                    disabled={returnToWarehouseMutation.isPending}
                    onClick={(event) => {
                      event.stopPropagation();
                      returnToWarehouseMutation.mutate(item.id);
                    }}
                  >
                    <PackageCheck className="mr-1 h-3.5 w-3.5" />
                    Вернуть
                  </Button>
                )}
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0">
                <div className="space-y-2.5 text-[12px] text-slate-700 dark:text-slate-300 sm:text-sm">
                  {projectInfo && (() => {
                    const info = projectInfo;
                    const overdue = isReturnOverdue(info.returnDate, info.returnTime);
                    return (
                      <div className={cn("rounded-md p-2 space-y-1.5", overdue ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800" : "bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800")}>
                        <div className="flex items-start gap-1.5 text-violet-700 dark:text-violet-300">
                          <User className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span className="min-w-0 break-words">Отправил: {info.assignedByName}</span>
                        </div>
                        {info.sentAt && (
                          <div className="flex items-start gap-1.5 text-slate-600 dark:text-slate-400">
                            <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span className="min-w-0 break-words">Выдано: {formatDateTime(info.sentAt)}</span>
                          </div>
                        )}
                        <div className="flex items-start gap-1.5 text-slate-600 dark:text-slate-400">
                          <Calendar className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span className="min-w-0 break-words">
                            Возврат: {formatReturnDateTime(info.returnDate, info.returnTime)}
                            {info.projectName ? ` · ${info.projectName}` : ""}
                          </span>
                        </div>
                        {overdue && (
                          <div className="flex items-start gap-1.5 text-red-600 dark:text-red-400 font-medium">
                            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span className="min-w-0 break-words">Просрочено возвращение</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {item.model && (
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <span className="text-slate-500 dark:text-slate-400 shrink-0">Модель:</span>
                      <span className="max-w-full min-w-0 break-words text-left font-medium sm:max-w-[68%] sm:text-right">{item.model}</span>
                    </div>
                  )}
                  {item.serialNumber && (
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <span className="text-slate-500 dark:text-slate-400 shrink-0">Серийный номер:</span>
                      <span className="max-w-full min-w-0 break-all text-left font-mono text-xs font-medium sm:max-w-[68%] sm:text-right">{item.serialNumber}</span>
                    </div>
                  )}
                  {item.inventoryNumber && (
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <span className="text-slate-500 dark:text-slate-400 shrink-0">Инв. номер:</span>
                      <span className="max-w-full min-w-0 break-all text-left font-medium sm:max-w-[68%] sm:text-right">{item.inventoryNumber}</span>
                    </div>
                  )}
                  {item.location && (
                    <div className="flex items-start gap-1.5">
                      <MapPin className="w-3 h-3 text-slate-400 mt-1 shrink-0" />
                      <span className="text-slate-500 dark:text-slate-400 shrink-0">Место:</span>
                      <span className="ml-auto max-w-[68%] min-w-0 break-words text-right font-medium">{item.location}</span>
                    </div>
                  )}
                  {itemComments.length > 0 && (
                    <div className="flex items-start gap-1.5 text-slate-500 dark:text-slate-400">
                      <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 break-words">
                        {itemComments.length} комм., последний: {itemComments[itemComments.length - 1]?.authorName || "сотрудник"}
                      </span>
                    </div>
                  )}
                  {item.lastUsed && (
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <span className="text-slate-500 dark:text-slate-400 shrink-0">Последнее использование:</span>
                      <span className="font-medium min-w-0 text-left sm:text-right">{new Date(item.lastUsed).toLocaleDateString("ru-RU")}</span>
                    </div>
                  )}
                  {!projectInfo && takenByName && (
                    <div className="rounded-md border border-blue-200 bg-blue-50/80 px-3 py-2 dark:border-blue-900 dark:bg-blue-950/20">
                      <div className="flex items-start gap-1.5 text-blue-700 dark:text-blue-300">
                        <User className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 break-words">Забрал: {takenByName}</span>
                      </div>
                    </div>
                  )}
                  {pendingRequest && !projectInfo && (
                    <div className="rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/20">
                      <div className="flex items-start gap-1.5 text-amber-700 dark:text-amber-300">
                        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 break-words">
                          {requestedByMe
                            ? requestType === "transfer"
                              ? "Ваш запрос на перенос отправлен и ждёт решения главного"
                              : "Ваш запрос на выдачу отправлен и ждёт подтверждения"
                            : requestType === "transfer"
                              ? `Ожидает решения по переносу для ${getAssignedUserName(pendingRequest.requestedBy) || "сотрудника"}`
                              : `Ожидает решения по запросу от ${getAssignedUserName(pendingRequest.requestedBy) || "сотрудника"}`}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
              </Card>
            );
          })
        )}
        </div>
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
        companyManager={canApproveCheckout}
      />

      {/* Barcode Scanner */}
      <BarcodeScanner
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onEquipmentFound={(foundEquipment: Equipment) => {
          if (userCanReserve) {
            setSelectedEquipment(foundEquipment);
            setFormMode("take_return");
            setIsFormOpen(true);
          } else if (userCanEdit) {
            setSelectedEquipment(foundEquipment);
            setFormMode("full");
            setIsFormOpen(true);
          } else if (canRequestEquipmentItem(foundEquipment, getOnProjectInfo(foundEquipment.id))) {
            setRequestEquipment(foundEquipment);
            setRequestLocation(foundEquipment.location || "");
            setRequestNote("");
          } else {
            setDetailsEquipment(foundEquipment);
          }
          setIsScannerOpen(false);
        }}
        onBarcodeScanned={(barcode: string) => {
          setSearchTerm(barcode);
          setIsScannerOpen(false);
        }}
        companyManager={canApproveCheckout}
        canRequestCheckout={canRequestCheckout}
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

      <Dialog open={bundleDialogOpen} onOpenChange={setBundleDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg bg-white dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">
              Создать супер позицию
            </DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400">
              Выбранные позиции будут объединены в одну складскую карточку, а комплектующие пометятся как входящие в сборку.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Название сборки</label>
              <Input
                value={bundleName}
                onChange={(event) => setBundleName(event.target.value)}
                placeholder="Например: PC ECHO_1, комплект режиссерского ПК"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Тип карточки</label>
              <Select value={bundleType} onValueChange={setBundleType}>
                <SelectTrigger className="bg-white dark:bg-slate-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="computer">Компьютер</SelectItem>
                  <SelectItem value="camera">Камера</SelectItem>
                  <SelectItem value="microphone">Микрофон</SelectItem>
                  <SelectItem value="lighting">Освещение</SelectItem>
                  <SelectItem value="other">Другое</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
              <div className="mb-2 text-sm font-medium text-slate-900 dark:text-white">
                Состав: {selectedEquipmentForBundle.length}
              </div>
              <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                {selectedEquipmentForBundle.map((item) => (
                  <div key={item.id} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900">
                    <div className="font-medium text-slate-900 dark:text-white">{item.name}</div>
                    <div className="mt-0.5 text-slate-500 dark:text-slate-400">
                      {[item.model, item.inventoryNumber].filter(Boolean).join(" · ") || getTypeText(item.type)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setBundleDialogOpen(false)}
              >
                Отмена
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={createBundleMutation.isPending || selectedEquipmentForBundle.length < 2 || !bundleName.trim()}
                onClick={() => createBundleMutation.mutate({
                  name: bundleName,
                  type: bundleType,
                  items: selectedEquipmentForBundle,
                })}
              >
                {createBundleMutation.isPending ? "Сборка..." : "Создать сборку"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(requestEquipment)}
        onOpenChange={(open) => {
          if (!open) {
            setRequestEquipment(null);
            setRequestLocation("");
            setRequestNote("");
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md bg-white dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">
              {requestEquipment && getCheckoutRequestType(undefined, requestEquipment) === "transfer"
                ? "Запросить перенос оборудования"
                : "Запросить выдачу оборудования"}
            </DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400">
              {requestEquipment && getCheckoutRequestType(undefined, requestEquipment) === "transfer"
                ? "Запрос уйдёт главному по компании. После подтверждения оборудование будет перенесено на вас."
                : "Запрос уйдёт главному по компании. После подтверждения оборудование закрепится за вами."}
            </DialogDescription>
          </DialogHeader>

          {requestEquipment && (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/70">
                <div className="font-medium text-slate-900 dark:text-white">{requestEquipment.name}</div>
                {requestEquipment.model && (
                  <div className="text-sm text-slate-500 dark:text-slate-400">{requestEquipment.model}</div>
                )}
              </div>

              {getCheckoutRequestType(undefined, requestEquipment) === "transfer" && requestEquipment.assignedTo && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
                  Сейчас у сотрудника: {getAssignedUserName(requestEquipment.assignedTo)}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {getCheckoutRequestType(undefined, requestEquipment) === "transfer" ? "Куда переносите" : "Куда берёте"}
                </label>
                <Input
                  value={requestLocation}
                  onChange={(event) => setRequestLocation(event.target.value)}
                  placeholder="Например: студия А, выезд, монтажная"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Комментарий</label>
                <Input
                  value={requestNote}
                  onChange={(event) => setRequestNote(event.target.value)}
                  placeholder={
                    getCheckoutRequestType(undefined, requestEquipment) === "transfer"
                      ? "Например: для моей смены, под эфир, под монтаж"
                      : "Если нужно, уточните задачу или проект"
                  }
                />
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setRequestEquipment(null);
                    setRequestLocation("");
                    setRequestNote("");
                  }}
                >
                  Отмена
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  disabled={!primaryCompanyId || requestCheckoutMutation.isPending}
                  onClick={() =>
                    requestCheckoutMutation.mutate({
                      equipmentId: requestEquipment.id,
                      location: requestLocation,
                      note: requestNote,
                      companyId: primaryCompanyId,
                      requestType: getCheckoutRequestType(undefined, requestEquipment),
                    })
                  }
                >
                  {requestCheckoutMutation.isPending
                    ? "Отправка..."
                    : getCheckoutRequestType(undefined, requestEquipment) === "transfer"
                      ? "Отправить запрос на перенос"
                      : "Отправить"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {cart.length > 0 && (
        <Button
          type="button"
          onClick={() => setCartOpen(true)}
          className="fixed bottom-20 right-5 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90 sm:bottom-6 sm:right-6"
          data-testid="floating-cart-button"
        >
          <ShoppingCart className="h-5 w-5" />
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-semibold text-primary shadow dark:bg-slate-950">
            {cart.length}
          </span>
        </Button>
      )}

      <Dialog
        open={Boolean(detailsEquipment)}
        onOpenChange={(open) => {
          if (!open) {
            setDetailsEquipment(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[88vh] w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-hidden bg-white dark:bg-slate-900">
          {detailsEquipment && (
            <>
              <DialogHeader>
                <DialogTitle className="text-slate-900 dark:text-white">
                  {detailsEquipment.name}
                </DialogTitle>
                <DialogDescription className="text-slate-500 dark:text-slate-400">
                  {[detailsEquipment.model, getTypeText(detailsEquipment.type)].filter(Boolean).join(" · ")}
                </DialogDescription>
              </DialogHeader>

              <div className="min-h-0 space-y-4 overflow-y-auto pr-1 text-sm text-slate-700 dark:text-slate-300">
                {getEquipmentPhotos(detailsEquipment).length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {getEquipmentPhotos(detailsEquipment).map((photo, index) => (
                      <a
                        key={`${detailsEquipment.id}-photo-${index}`}
                        href={photo}
                        target="_blank"
                        rel="noreferrer"
                        className="block overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-900"
                      >
                        <img
                          src={photo}
                          alt={`${detailsEquipment.name} ${index + 1}`}
                          className="h-48 w-full object-contain"
                          loading="lazy"
                          onError={(event) => {
                            const image = event.currentTarget;
                            if (image.dataset.retry === "api") return;
                            image.dataset.retry = "api";
                            image.src = apiUrl(photo);
                          }}
                        />
                      </a>
                    ))}
                  </div>
                )}

                {isSuperPosition(detailsEquipment) && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/25">
                    <div className="mb-2 flex items-center gap-2 font-medium text-emerald-900 dark:text-emerald-200">
                      <Package className="h-4 w-4" />
                      Состав супер позиции
                    </div>
                    <div className="space-y-2">
                      {getBundleComponents(detailsEquipment, equipment).map((component, index) => (
                        <div key={component.id || index} className="rounded-md border border-emerald-200/70 bg-white px-3 py-2 text-xs dark:border-emerald-900/70 dark:bg-slate-900">
                          <div className="font-medium text-slate-900 dark:text-white">{component.name}</div>
                          <div className="mt-0.5 text-slate-500 dark:text-slate-400">
                            {[component.model, component.inventoryNumber].filter(Boolean).join(" · ") || getTypeText(component.type)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {getParentBundleName(detailsEquipment) && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/25 dark:text-blue-200">
                    Входит в сборку: <span className="font-medium">{getParentBundleName(detailsEquipment)}</span>
                  </div>
                )}

                {detailsEquipment.status === "in-use" && getAssignedUserName(detailsEquipment.assignedTo) && (
                  <div className="rounded-md border border-blue-200 bg-blue-50/80 px-4 py-3 dark:border-blue-900 dark:bg-blue-950/20">
                    <div className="flex items-start gap-2 text-blue-700 dark:text-blue-300">
                      <User className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium">Сейчас забрал</div>
                        <div className="break-words">{getAssignedUserName(detailsEquipment.assignedTo)}</div>
                      </div>
                    </div>
                  </div>
                )}

                {userCanEdit && String(detailsEquipment.notes ?? "").trim() && (
                  <div className="rounded-md border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/70">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                      Описание
                    </div>
                    {(() => {
                      const audit = asRecord(asRecord(detailsEquipment.specifications).noteAudit);
                      const authorName = String(audit.authorName || "").trim();
                      const at = String(audit.at || "").trim();
                      if (!authorName && !at) return null;
                      return (
                        <div className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                          Примечание: {authorName || "пользователь"}{at ? `, ${formatDateTime(at)}` : ""}
                        </div>
                      );
                    })()}
                    <p className="whitespace-pre-wrap break-words leading-6 text-slate-700 dark:text-slate-200">
                      {detailsEquipment.notes}
                    </p>
                  </div>
                )}

                {!userCanEdit && (
                  <div className="rounded-md border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/70">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                      Примечание
                    </div>
                    {(() => {
                      const audit = asRecord(asRecord(detailsEquipment.specifications).noteAudit);
                      const authorName = String(audit.authorName || "").trim();
                      const at = String(audit.at || "").trim();
                      if (!authorName && !at) return null;
                      return (
                        <div className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                          Последнее изменение: {authorName || "пользователь"}{at ? `, ${formatDateTime(at)}` : ""}
                        </div>
                      );
                    })()}
                    <Textarea
                      value={detailsNote}
                      onChange={(event) => setDetailsNote(event.target.value)}
                      placeholder="Напишите примечание по оборудованию"
                      className="min-h-28 resize-y bg-white dark:bg-slate-950"
                    />
                    <div className="mt-3 flex justify-end">
                      <Button
                        type="button"
                        onClick={() => updateEquipmentNoteMutation.mutate({ equipmentId: detailsEquipment.id, notes: detailsNote })}
                        disabled={
                          updateEquipmentNoteMutation.isPending ||
                          detailsNote === String(detailsEquipment.notes ?? "")
                        }
                      >
                        {updateEquipmentNoteMutation.isPending ? "Сохранение..." : "Сохранить"}
                      </Button>
                    </div>
                  </div>
                )}

                {getSpecificationEntries(detailsEquipment.specifications).length > 0 && (
                  <div className="rounded-md border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/70">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                      Технические характеристики
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {getSpecificationEntries(detailsEquipment.specifications).map(([label, value]) => (
                        <div
                          key={`${detailsEquipment.id}-${label}`}
                          className="rounded-md border border-slate-200/70 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                        >
                          <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
                          <div className="mt-1 break-words font-medium text-slate-900 dark:text-slate-100">{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-md border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/70">
                  <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Комментарии
                  </div>
                  <div className="space-y-3">
                    {getEquipmentComments(detailsEquipment).length > 0 ? (
                      getEquipmentComments(detailsEquipment).map((comment) => (
                        <div key={comment.id} className="rounded-md border border-slate-200/70 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                          <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-medium text-slate-700 dark:text-slate-200">{comment.authorName || getAssignedUserName(comment.authorId) || "Сотрудник"}</span>
                            <span>{formatDateTime(comment.createdAt)}</span>
                          </div>
                          <div className="whitespace-pre-wrap break-words leading-5 text-slate-700 dark:text-slate-200">{comment.text}</div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-md border border-dashed border-slate-300 px-3 py-4 text-center text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        Комментариев пока нет.
                      </div>
                    )}
                    <Textarea
                      value={detailsComment}
                      onChange={(event) => setDetailsComment(event.target.value)}
                      placeholder="Оставить комментарий по оборудованию"
                      className="min-h-20 resize-y bg-white dark:bg-slate-950"
                    />
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        onClick={() => addEquipmentCommentMutation.mutate({ equipmentItem: detailsEquipment, text: detailsComment })}
                        disabled={addEquipmentCommentMutation.isPending || !detailsComment.trim()}
                      >
                        {addEquipmentCommentMutation.isPending ? "Добавление..." : "Добавить комментарий"}
                      </Button>
                    </div>
                  </div>
                </div>

                {userCanEdit &&
                  !String(detailsEquipment.notes ?? "").trim() &&
                  getSpecificationEntries(detailsEquipment.specifications).length === 0 && (
                    <div className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      Для этой позиции описание и технические характеристики пока не заполнены.
                    </div>
                  )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
