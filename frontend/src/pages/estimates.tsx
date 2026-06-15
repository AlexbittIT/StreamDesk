import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, BrainCircuit, Clock3, FileSpreadsheet, Loader2, Network, Package, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Equipment } from "@shared/schema";

type EstimateLine = {
  lineId: string;
  catalogId: string;
  equipmentIds: string[];
  name: string;
  type: string;
  model: string;
  quantity: number;
  availableQty: number;
  totalQty: number;
  unitPrice: number;
  baseTotal: number;
  shiftFactor: number;
  total: number;
  priceSource: string;
  availability: "in_stock" | "partial" | "unavailable";
  priceStatus: "priced" | "no_price";
  confidence: number;
  reason: string;
  locations: string[];
};

type EstimateMissingLine = {
  name: string;
  type?: string;
  quantity: number;
  reason: string;
};

type EstimateShiftSegment = {
  kind: "weekday_day" | "weekday_night" | "weekend_day" | "weekend_night";
  label: string;
  hours: number;
  shifts: number;
  coefficient: number;
  amountFactor: number;
};

type EstimateShiftCalculation = {
  source: "manual" | "dates" | "ai_dates";
  startAt: string | null;
  endAt: string | null;
  actualHours: number;
  shiftHours: number;
  roundingStep: number;
  chargeableShifts: number;
  chargeFactor: number;
  segments: EstimateShiftSegment[];
  warnings: string[];
};

type EstimateResult = {
  title: string;
  source: "ai" | "heuristic";
  summary: string;
  items: EstimateLine[];
  missing: EstimateMissingLine[];
  warnings: string[];
  totals: {
    subtotal: number;
    lines: number;
    quantity: number;
    missingPrices: number;
    availabilityIssues: number;
  };
  catalogStats?: {
    total: number;
    priced: number;
    equipmentTotal: number;
    availableTotal: number;
  };
  document?: {
    name: string;
    extractedChars: number;
  } | null;
  shiftCalculation?: EstimateShiftCalculation;
  aiSchedule?: {
    startAt: string | null;
    endAt: string | null;
    notes: string;
  } | null;
};

type EstimateHistoryEntry = {
  id: string;
  title: string;
  savedAt: string;
  estimate: EstimateResult;
  deliveryDistanceKm: string;
};

type CatalogItem = {
  id: string;
  equipmentIds: string[];
  name: string;
  type: string;
  model: string;
  unitPrice: number;
  priceSource: string;
  availableQty: number;
  totalQty: number;
  locations: string[];
};

function parseMoneyValue(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let cleaned = String(value ?? "")
    .trim()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, "")
    .replace(/[^\d,.\-]/g, "");
  if (!cleaned) return 0;
  if (cleaned.includes(",") && !cleaned.includes(".")) cleaned = cleaned.replace(",", ".");
  const dotCount = (cleaned.match(/\./g) || []).length;
  if (dotCount > 1) {
    const parts = cleaned.split(".");
    const decimal = parts.pop() || "";
    cleaned = `${parts.join("")}.${decimal}`;
  } else if (/^\d+\.\d{3}$/.test(cleaned)) {
    cleaned = cleaned.replace(".", "");
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^0-9a-zа-я]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readEquipmentPrice(item: Equipment): { value: number; source: string } {
  const specifications = asRecord(item.specifications);
  const keys = [
    "estimatePrice",
    "estimate_price",
    "estimateUnitPrice",
    "unitPrice",
    "price",
    "cost",
    "цена",
    "цена за смену",
    "стоимость",
    "стоимость за смену",
    "сметная стоимость",
  ];

  for (const key of keys) {
    if (specifications[key] != null) {
      const value = parseMoneyValue(specifications[key]);
      if (value) return { value, source: key };
    }
  }

  for (const [key, value] of Object.entries(specifications)) {
    const normalizedKey = normalizeText(key);
    if (normalizedKey.includes("цен") || normalizedKey.includes("стоим") || normalizedKey.includes("прайс") || normalizedKey.includes("price") || normalizedKey.includes("cost")) {
      const parsed = parseMoneyValue(value);
      if (parsed) return { value: parsed, source: key };
    }
  }

  return { value: 0, source: "" };
}

function getTypeText(type: string) {
  switch (type) {
    case "camera": return "Камера";
    case "microphone": return "Микрофон";
    case "lighting": return "Свет";
    case "computer": return "Компьютер";
    case "audio": return "Аудио";
    case "video": return "Видео";
    case "network": return "Сеть";
    case "display": return "Экран";
    case "power": return "Питание";
    case "cable": return "Коммутация";
    case "labor": return "Персонал";
    case "transport": return "Доставка";
    default: return type || "Другое";
  }
}

function getEstimateGroup(type: string) {
  if (["audio", "microphone"].includes(type)) return { key: "audio", title: "Звук" };
  if (["video", "camera", "computer", "display"].includes(type)) return { key: "video", title: "Видео" };
  if (type === "lighting") return { key: "lighting", title: "Световое оборудование" };
  if (["network", "power", "cable"].includes(type)) return { key: "technical", title: "Коммутация, сеть и питание" };
  if (type === "labor") return { key: "labor", title: "Персонал" };
  if (type === "transport") return { key: "transport", title: "Доставка" };
  return { key: "other", title: "Дополнительно" };
}

function groupEstimateItems(items: EstimateLine[]) {
  const order = ["audio", "video", "lighting", "technical", "labor", "transport", "other"];
  const groups = new Map<string, { key: string; title: string; items: EstimateLine[]; total: number }>();
  for (const item of items) {
    const group = getEstimateGroup(item.type);
    const existing = groups.get(group.key) || { ...group, items: [], total: 0 };
    existing.items.push(item);
    existing.total += Number(item.total) || 0;
    groups.set(group.key, existing);
  }
  return Array.from(groups.values())
    .map((group) => ({ ...group, total: Math.round(group.total * 100) / 100 }))
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

function shouldExportToSchema(line: EstimateLine) {
  return !["labor", "transport", "cable", "power"].includes(line.type);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(Number(value) || 0);
}

function buildCatalog(equipment: Equipment[]): CatalogItem[] {
  const groups = new Map<string, Omit<CatalogItem, "id">>();

  for (const item of equipment) {
    const price = readEquipmentPrice(item);
    const key = normalizeText([item.type, item.name, item.model, price.value].join("|"));
    const existing = groups.get(key) || {
      equipmentIds: [],
      name: item.name,
      type: item.type,
      model: item.model || "",
      unitPrice: price.value,
      priceSource: price.source,
      availableQty: 0,
      totalQty: 0,
      locations: [],
    };

    existing.equipmentIds.push(item.id);
    existing.totalQty += 1;
    if (item.status === "available") existing.availableQty += 1;
    if (item.location && !existing.locations.includes(item.location)) existing.locations.push(item.location);
    if (!existing.unitPrice && price.value) {
      existing.unitPrice = price.value;
      existing.priceSource = price.source;
    }
    groups.set(key, existing);
  }

  return Array.from(groups.values())
    .sort((left, right) => `${left.type} ${left.name}`.localeCompare(`${right.type} ${right.name}`, "ru"))
    .map((item, index) => ({ ...item, id: `manual-${index + 1}` }));
}

function recalculateTotals(items: EstimateLine[]): EstimateResult["totals"] {
  const subtotal = items.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    lines: items.length,
    quantity: items.reduce((sum, item) => sum + item.quantity, 0),
    missingPrices: items.filter((item) => !item.unitPrice).length,
    availabilityIssues: items.filter((item) => item.availability !== "in_stock").length,
  };
}

function buildLineFromCatalog(item: CatalogItem, index: number, shiftFactor = 1): EstimateLine {
  const baseTotal = Math.round(item.unitPrice * 100) / 100;
  return {
    lineId: `manual-${item.id}-${Date.now()}-${index}`,
    catalogId: item.id,
    equipmentIds: item.equipmentIds,
    name: item.name,
    type: item.type,
    model: item.model,
    quantity: 1,
    availableQty: item.availableQty,
    totalQty: item.totalQty,
    unitPrice: item.unitPrice,
    baseTotal,
    shiftFactor,
    total: Math.round(baseTotal * shiftFactor * 100) / 100,
    priceSource: item.priceSource,
    availability: item.availableQty >= 1 ? "in_stock" : "unavailable",
    priceStatus: item.unitPrice > 0 ? "priced" : "no_price",
    confidence: 1,
    reason: "Добавлено вручную",
    locations: item.locations.slice(0, 5),
  };
}

function calculateDelivery(items: EstimateLine[], distanceKmText: string) {
  const distanceKm = Math.max(0, Number(distanceKmText) || 0);
  const quantity = items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
  const vehicles = quantity > 0 ? Math.max(1, Math.ceil(quantity / 14)) : 0;
  const loadHours = vehicles ? Math.max(2, Math.ceil(quantity / 10)) : 0;
  const driveHours = vehicles ? Math.max(1, Math.ceil((distanceKm * 2) / 45)) : 0;
  const hours = vehicles ? loadHours + driveHours : 0;
  const basePerVehicle = 4500;
  const kmRate = 55;
  const hourlyRate = 1200;
  const total = vehicles ? Math.round((vehicles * basePerVehicle + vehicles * distanceKm * 2 * kmRate + hours * hourlyRate) * 100) / 100 : 0;
  return { distanceKm, quantity, vehicles, hours, total };
}

function inferPortsForEstimateLine(line: EstimateLine) {
  const text = normalizeText([line.type, line.name, line.model].join(" "));
  const portsIn: Array<{ id: string; name: string; type: "in"; portType?: string }> = [];
  const portsOut: Array<{ id: string; name: string; type: "out"; portType?: string }> = [];
  const addIn = (name: string, portType = name) => portsIn.push({ id: `in-${portsIn.length + 1}`, name, type: "in", portType });
  const addOut = (name: string, portType = name) => portsOut.push({ id: `out-${portsOut.length + 1}`, name, type: "out", portType });
  if (text.includes("atem") && text.includes("mini")) {
    ["HDMI IN 1", "HDMI IN 2", "HDMI IN 3", "HDMI IN 4", "LAN", "USB-C", "MIC 1", "MIC 2"].forEach((name) => addIn(name, name.includes("HDMI") ? "HDMI" : name.includes("MIC") ? "3.5mm" : name));
    addOut("HDMI OUT", "HDMI");
    addOut("USB-C OUT", "USB");
  } else if (text.includes("constellation") || text.includes("television studio")) {
    Array.from({ length: 8 }, (_, i) => addIn(`SDI IN ${i + 1}`, "SDI"));
    Array.from({ length: 8 }, (_, i) => addOut(`SDI OUT ${i + 1}`, "SDI"));
    addIn("REF IN", "BNC");
    addIn("LAN", "LAN");
    addOut("MADI OUT", "MADI");
  } else if (text.includes("atem") || text.includes("switcher")) {
    Array.from({ length: 8 }, (_, i) => addIn(`SDI IN ${i + 1}`, "SDI"));
    Array.from({ length: 4 }, (_, i) => addOut(`SDI OUT ${i + 1}`, "SDI"));
    addIn("LAN", "LAN");
  } else if (text.includes("novastar") || text.includes("vx1000") || text.includes("процессор")) {
    addIn("HDMI IN", "HDMI");
    addIn("DVI IN", "DVI");
    addIn("SDI IN", "SDI");
    Array.from({ length: 4 }, (_, i) => addOut(`EtherCON OUT ${i + 1}`, "LAN"));
    addIn("LAN CONTROL", "LAN");
  } else if (text.includes("resolume") || text.includes("vmix") || text.includes("медиасервер") || text.includes("ноутбук")) {
    addIn("LAN", "LAN");
    addOut("HDMI OUT", "HDMI");
    addOut("SDI OUT", "SDI");
    addOut("NDI OUT", "LAN");
  } else if (line.type === "camera" || text.includes("camera")) {
    if (text.includes("sdi") || text.includes("broadcast") || text.includes("studio") || text.includes("ursa") || text.includes("bmpcc")) addOut("SDI OUT", "SDI");
    if (portsOut.length === 0 || text.includes("hdmi") || text.includes("sony") || text.includes("canon")) addOut("HDMI OUT", "HDMI");
    addIn("DC IN", "DC");
    addIn("LAN/CONTROL", "LAN");
  } else if (line.type === "network" || text.includes("router") || text.includes("switch")) {
    Array.from({ length: text.includes("24") ? 24 : text.includes("16") ? 16 : 8 }, (_, i) => addIn(`LAN${i + 1}`, "LAN"));
    Array.from({ length: text.includes("24") ? 24 : text.includes("16") ? 16 : 8 }, (_, i) => addOut(`LAN OUT ${i + 1}`, "LAN"));
  } else if (line.type === "audio" || text.includes("mixer") || text.includes("микшер") || text.includes("пульт")) {
    const inputs = text.includes("x32") || text.includes("wing") ? 32 : text.includes("dlive") || text.includes("midas") ? 48 : 8;
    Array.from({ length: Math.min(inputs, 16) }, (_, i) => addIn(`XLR IN ${i + 1}`, "XLR"));
    Array.from({ length: 6 }, (_, i) => addOut(`XLR OUT ${i + 1}`, "XLR"));
    addIn("AES50 A", "AES50");
    addOut("AES50 A", "AES50");
    addIn("LAN", "LAN");
  } else if (line.type === "microphone" || text.includes("mic")) {
    if (text.includes("радио") || text.includes("wireless") || text.includes("shure") || text.includes("sennheiser")) {
      addOut("XLR OUT", "XLR");
      addOut("Jack OUT", "TRS");
      addIn("ANT A/B", "RF");
    } else {
      addOut("XLR OUT", "XLR");
    }
  } else if (line.type === "display") {
    addIn("HDMI", "HDMI");
    addIn("SDI", "SDI");
    addIn("LAN", "LAN");
  } else if (line.type === "lighting") {
    addIn("DMX IN", "DMX");
    addOut("DMX THRU", "DMX");
    if (text.includes("artnet") || text.includes("landmx")) {
      addIn("LAN/ArtNet", "LAN");
      Array.from({ length: 4 }, (_, i) => addOut(`DMX OUT ${i + 1}`, "DMX"));
    }
  } else {
    addIn("LAN", "LAN");
    addOut("HDMI", "HDMI");
  }
  return { portsIn, portsOut };
}

function isSignalHub(line: EstimateLine, signal: "audio" | "video" | "lighting" | "network") {
  const text = normalizeText([line.type, line.name, line.model].join(" "));
  if (signal === "audio") return line.type === "audio" && /(mixer|mix|x32|wing|midas|allen|пульт|микшер|консоль)/i.test(text);
  if (signal === "video") return line.type === "video" && /(atem|switcher|микшер|коммутатор|процессор|vx|novastar|matrix)/i.test(text);
  if (signal === "lighting") return line.type === "lighting" && /(console|command|wing|пульт|контроллер|dmx|artnet|splitter|сплиттер)/i.test(text);
  if (signal === "network") return line.type === "network" || /(router|switch|роутер|коммутатор|lan|сеть)/i.test(text);
  return false;
}

function getPortId(ports: Array<{ id: string; portType?: string; name: string }>, wanted: string, used: Set<string>) {
  const direct = ports.find((port) => !used.has(port.id) && normalizeText(port.portType || port.name).includes(normalizeText(wanted)));
  const fallback = direct || ports.find((port) => !used.has(port.id)) || ports[0];
  if (fallback) used.add(fallback.id);
  return fallback?.id || "";
}

function getConsideredModel(line: EstimateLine) {
  const explicit = [line.model, line.name].map((value) => String(value || "").trim()).filter(Boolean).join(" / ");
  if (explicit) return explicit;
  return getTypeText(line.type);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeFilePart(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 80) || "estimate";
}

const ESTIMATE_HISTORY_KEY = "streamdesk_estimate_history_v1";

function loadEstimateHistory(): EstimateHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ESTIMATE_HISTORY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 40) : [];
  } catch {
    return [];
  }
}

function persistEstimateHistory(entries: EstimateHistoryEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ESTIMATE_HISTORY_KEY, JSON.stringify(entries.slice(0, 40)));
}

function exportEstimateToExcel(estimate: EstimateResult, delivery?: ReturnType<typeof calculateDelivery>) {
  const rows = groupEstimateItems(estimate.items).map((group) => `
    <tr style="background:#e8eef8;font-weight:bold">
      <td colspan="10">${escapeHtml(group.title)}</td>
      <td>${group.total}</td>
    </tr>
    ${group.items.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(getTypeText(item.type))}</td>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.model)}</td>
      <td>${item.quantity}</td>
      <td>${item.availableQty}</td>
      <td>${item.unitPrice}</td>
      <td>${item.baseTotal ?? Math.round(item.quantity * item.unitPrice * 100) / 100}</td>
      <td>${item.shiftFactor ?? 1}</td>
      <td>${item.total}</td>
      <td>${escapeHtml(item.reason)}</td>
    </tr>
    `).join("")}
  `).join("");
  const missingRows = estimate.missing.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(item.type || "")}</td>
      <td>${escapeHtml(item.name)}</td>
      <td>${item.quantity}</td>
      <td>${escapeHtml(item.reason)}</td>
    </tr>
  `).join("");
  const html = `
    <!doctype html>
    <html>
      <head><meta charset="utf-8" /></head>
      <body>
        <h2>${escapeHtml(estimate.title)}</h2>
        <p>Дата: ${new Date().toLocaleString("ru-RU")}</p>
        <p>Итого: ${estimate.totals.subtotal}</p>
        ${delivery && delivery.total > 0 ? `
          <p>Доставка: ${delivery.vehicles} авто, ${delivery.distanceKm} км, ${delivery.hours} ч, ${delivery.total}</p>
          <p>Итого с доставкой: ${Math.round((estimate.totals.subtotal + delivery.total) * 100) / 100}</p>
        ` : ""}
        ${estimate.shiftCalculation ? `
          <p>Смены: ${estimate.shiftCalculation.chargeableShifts}; коэффициент: ${estimate.shiftCalculation.chargeFactor}; часы: ${estimate.shiftCalculation.actualHours}</p>
          <table border="1" cellspacing="0" cellpadding="6">
            <thead><tr><th>Сегмент</th><th>Часы</th><th>Смены</th><th>Коэфф.</th><th>Начисление</th></tr></thead>
            <tbody>
              ${estimate.shiftCalculation.segments.map((segment) => `
                <tr>
                  <td>${escapeHtml(segment.label)}</td>
                  <td>${segment.hours}</td>
                  <td>${segment.shifts}</td>
                  <td>${segment.coefficient}</td>
                  <td>${segment.amountFactor}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        ` : ""}
        <table border="1" cellspacing="0" cellpadding="6">
          <thead>
            <tr>
              <th>#</th><th>Позиция</th><th>Категория</th><th>Модель</th><th>Кол-во</th><th>Доступно</th><th>Цена</th><th>База</th><th>Коэфф.</th><th>Сумма</th><th>Причина</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        ${estimate.missing.length ? `
          <h3>Не найдено на складе</h3>
          <table border="1" cellspacing="0" cellpadding="6">
            <thead><tr><th>#</th><th>Имя</th><th>Категория</th><th>Кол-во</th><th>Комментарий</th></tr></thead>
            <tbody>${missingRows}</tbody>
          </table>
        ` : ""}
      </body>
    </html>
  `;
  const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFilePart(estimate.title)}_${new Date().toISOString().slice(0, 10)}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function EstimatesPage() {
  const [title, setTitle] = useState(() => `Смета ${new Date().toLocaleDateString("ru-RU")}`);
  const [tzText, setTzText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [manualShiftCount, setManualShiftCount] = useState("1");
  const [shiftHours, setShiftHours] = useState("10");
  const [roundingStep, setRoundingStep] = useState("0.5");
  const [dayStartHour, setDayStartHour] = useState("8");
  const [nightStartHour, setNightStartHour] = useState("22");
  const [weekdayDayCoefficient, setWeekdayDayCoefficient] = useState("1");
  const [weekdayNightCoefficient, setWeekdayNightCoefficient] = useState("1.5");
  const [weekendDayCoefficient, setWeekendDayCoefficient] = useState("1.5");
  const [weekendNightCoefficient, setWeekendNightCoefficient] = useState("2");
  const [holidayDates, setHolidayDates] = useState("");
  const [workdayDates, setWorkdayDates] = useState("");
  const [deliveryDistanceKm, setDeliveryDistanceKm] = useState("0");
  const [estimateHistory, setEstimateHistory] = useState<EstimateHistoryEntry[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    setEstimateHistory(loadEstimateHistory());
  }, []);

  const { data: equipment = [], isLoading: equipmentLoading } = useQuery<Equipment[]>({
    queryKey: ["/api/equipment"],
  });

  const catalog = useMemo(() => buildCatalog(equipment), [equipment]);
  const pricedCount = catalog.filter((item) => item.unitPrice > 0).length;
  const missingPriceCount = Math.max(catalog.length - pricedCount, 0);
  const visibleCatalog = catalog
    .filter((item) => {
      const query = normalizeText(catalogSearch);
      if (!query) return true;
      return normalizeText([item.name, item.model, item.type].join(" ")).includes(query);
    })
    .slice(0, 12);
  const delivery = useMemo(() => calculateDelivery(estimate?.items || [], deliveryDistanceKm), [estimate?.items, deliveryDistanceKm]);
  const estimateGrandTotal = Math.round(((estimate?.totals.subtotal || 0) + delivery.total) * 100) / 100;
  const estimateGroups = useMemo(() => groupEstimateItems(estimate?.items || []), [estimate?.items]);

  const saveEstimateVersion = (entryEstimate = estimate) => {
    if (!entryEstimate) return;
    const entry: EstimateHistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: entryEstimate.title || title || "Смета",
      savedAt: new Date().toISOString(),
      estimate: entryEstimate,
      deliveryDistanceKm,
    };
    setEstimateHistory((current) => {
      const next = [entry, ...current].slice(0, 40);
      persistEstimateHistory(next);
      return next;
    });
  };

  const openEstimateVersion = (entry: EstimateHistoryEntry) => {
    setEstimate(entry.estimate);
    setTitle(entry.estimate.title || entry.title);
    setDeliveryDistanceKm(entry.deliveryDistanceKm || "0");
  };

  const deleteEstimateVersion = (entryId: string) => {
    setEstimateHistory((current) => {
      const next = current.filter((entry) => entry.id !== entryId);
      persistEstimateHistory(next);
      return next;
    });
  };

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("text", tzText);
      formData.append("requireAi", "true");
      formData.append("startAt", startAt);
      formData.append("endAt", endAt);
      formData.append("manualShiftCount", manualShiftCount);
      formData.append("shiftHours", shiftHours);
      formData.append("roundingStep", roundingStep);
      formData.append("dayStartHour", dayStartHour);
      formData.append("nightStartHour", nightStartHour);
      formData.append("weekdayDayCoefficient", weekdayDayCoefficient);
      formData.append("weekdayNightCoefficient", weekdayNightCoefficient);
      formData.append("weekendDayCoefficient", weekendDayCoefficient);
      formData.append("weekendNightCoefficient", weekendNightCoefficient);
      formData.append("holidayDates", holidayDates);
      formData.append("workdayDates", workdayDates);
      if (file) formData.append("file", file);
      const response = await apiRequest("POST", "/api/estimates/analyze", formData, true);
      return response.json() as Promise<EstimateResult>;
    },
    onSuccess: (data) => {
      setEstimate(data);
      saveEstimateVersion(data);
      toast({
        title: "Смета собрана",
        description: `${data.items.length} позиций, итог ${formatMoney(data.totals.subtotal)}.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Не удалось собрать смету",
        description: error?.message || "Проверьте ТЗ и попробуйте снова.",
        variant: "destructive",
      });
    },
  });

  const exportToSchemaMutation = useMutation({
    mutationFn: async () => {
      if (!estimate) throw new Error("Смета не собрана");
      const schemaResponse = await apiRequest("POST", "/api/connection-schemas", {
        name: estimate.title,
        description: `Создано из сметы. Доставка: ${delivery.vehicles} авто, ${delivery.distanceKm} км, ${formatMoney(delivery.total)}.`,
      });
      const schema = await schemaResponse.json();
      if (!schema?.id) throw new Error("Схема не создана");
      const groups = groupEstimateItems(estimate.items.filter(shouldExportToSchema));
      const zoneIds = new Map<string, string>();
      const baseX = 5200;
      const baseY = 3600;
      const zoneGapY = 360;
      const cardGapX = 460;
      const cardGapY = 250;
      const groupAnchors: Record<string, { x: number; y: number }> = {
        audio: { x: baseX - 1700, y: baseY - 850 },
        video: { x: baseX - 250, y: baseY - 520 },
        lighting: { x: baseX - 1700, y: baseY + 520 },
        technical: { x: baseX + 1250, y: baseY + 180 },
        other: { x: baseX + 1250, y: baseY + 980 },
      };
      const groupLayout = new Map<string, { y: number; height: number }>();
      let nextZoneY = baseY + 1400;
      for (const [groupIndex, group] of groups.entries()) {
        const copiesCount = group.items.reduce((sum, line) => sum + Math.min(8, Math.max(1, Number(line.quantity) || 1)), 0);
        const zoneHeight = Math.max(460, Math.ceil(copiesCount / 3) * cardGapY + 220);
        const anchor = groupAnchors[group.key] || { x: baseX - 200, y: nextZoneY };
        groupLayout.set(group.key, { y: anchor.y + 110, height: zoneHeight });
        const zoneResponse = await apiRequest("POST", `/api/connection-schemas/${schema.id}/components`, {
          type: "zone",
          name: group.title,
          position: { x: anchor.x - 100, y: anchor.y },
          properties: {
            width: 1480,
            height: zoneHeight,
            color: group.key === "audio" ? "rgba(37, 99, 235, 0.14)" : group.key === "video" ? "rgba(124, 58, 237, 0.14)" : group.key === "lighting" ? "rgba(245, 158, 11, 0.14)" : "rgba(16, 185, 129, 0.14)",
            source: "estimate",
          },
          connections: [],
        });
        const zone = await zoneResponse.json();
        if (zone?.id) zoneIds.set(group.key, zone.id);
        if (!groupAnchors[group.key]) nextZoneY += zoneHeight + zoneGapY;
      }
      const items = groups.flatMap((group) => {
        const zoneY = groupLayout.get(group.key)?.y ?? baseY;
        const zoneX = (groupAnchors[group.key]?.x ?? baseX) + 10;
        let layoutIndex = 0;
        return group.items.flatMap((line, lineIndex) => {
          const qty = Math.min(8, Math.max(1, Number(line.quantity) || 1));
          return Array.from({ length: qty }, (_, copyIndex) => ({ line, copyIndex, lineIndex, layoutIndex: layoutIndex++, group, zoneY, zoneX }));
        });
      });
      const createdItems: Array<{
        id: string;
        line: EstimateLine;
        groupKey: string;
        portsIn: ReturnType<typeof inferPortsForEstimateLine>["portsIn"];
        portsOut: ReturnType<typeof inferPortsForEstimateLine>["portsOut"];
        connections: any[];
      }> = [];
      for (const item of items) {
        const ports = inferPortsForEstimateLine(item.line);
        const response = await apiRequest("POST", `/api/connection-schemas/${schema.id}/components`, {
          type: item.line.type || "equipment",
          name: item.copyIndex === 0 ? `${item.line.name} ${item.line.model || ""}`.trim() : `${item.line.name} ${item.copyIndex + 1}`.trim(),
          position: {
            x: item.zoneX + (item.layoutIndex % 3) * cardGapX,
            y: item.zoneY + Math.floor(item.layoutIndex / 3) * cardGapY,
          },
          properties: {
            model: item.line.model,
            consideredModel: getConsideredModel(item.line),
            engineerNote: `Распознано из сметы: ${getConsideredModel(item.line)}`,
            source: "estimate",
            estimateLineId: item.line.lineId,
            estimateGroup: item.group.title,
            zoneId: zoneIds.get(item.group.key),
            portsIn: ports.portsIn,
            portsOut: ports.portsOut,
          },
          connections: [],
        });
        const created = await response.json();
        if (created?.id) {
          createdItems.push({ id: created.id, line: item.line, groupKey: item.group.key, portsIn: ports.portsIn, portsOut: ports.portsOut, connections: [] });
        }
      }
      const connect = (from: typeof createdItems[number] | undefined, to: typeof createdItems[number] | undefined, protocol: string, cableType = protocol) => {
        if (!from || !to || !from.portsOut.length || !to.portsIn.length) return;
        const fromUsed = new Set(from.connections.map((connection) => connection.fromPortId).filter(Boolean));
        const toUsed = new Set(createdItems.flatMap((item) => item.connections.filter((connection) => connection.componentId === to.id).map((connection) => connection.port)));
        const fromPortId = getPortId(from.portsOut, protocol, fromUsed);
        const toPortId = getPortId(to.portsIn, protocol, toUsed);
        if (!fromPortId || !toPortId) return;
        from.connections.push({ componentId: to.id, port: toPortId, fromPortId, cableType, protocol });
      };
      const byGroup = (key: string) => createdItems.filter((item) => item.groupKey === key);
      const audio = byGroup("audio");
      const video = byGroup("video");
      const lighting = byGroup("lighting");
      const technical = byGroup("technical");
      const audioHub = audio.find((item) => isSignalHub(item.line, "audio")) || audio.find((item) => item.line.type === "audio");
      const videoHub = video.find((item) => isSignalHub(item.line, "video")) || video.find((item) => item.line.type === "video");
      const lightHub = lighting.find((item) => isSignalHub(item.line, "lighting"));
      const networkHub = technical.find((item) => isSignalHub(item.line, "network"));
      audio.filter((item) => item.id !== audioHub?.id && item.line.type === "microphone").forEach((item) => connect(item, audioHub, "XLR"));
      audio.filter((item) => item.id !== audioHub?.id && item.line.type === "audio").forEach((item) => {
        if (audioHub && item.portsIn.length) connect(audioHub, item, "XLR");
      });
      video.filter((item) => item.id !== videoHub?.id && ["camera", "computer"].includes(item.line.type)).forEach((item) => connect(item, videoHub, item.portsOut.some((p) => p.portType === "SDI") ? "SDI" : "HDMI"));
      video.filter((item) => item.id !== videoHub?.id && ["display", "video"].includes(item.line.type)).forEach((item) => {
        if (videoHub && item.portsIn.length) connect(videoHub, item, item.portsIn.some((p) => p.portType === "SDI") ? "SDI" : "HDMI");
      });
      lighting.filter((item) => item.id !== lightHub?.id).forEach((item) => connect(lightHub, item, "DMX"));
      [audioHub, videoHub, lightHub]
        .filter((item): item is typeof createdItems[number] => Boolean(item))
        .forEach((item) => connect(networkHub, item, "LAN", "Cat6"));
      video.filter((item) => item.line.type === "computer").forEach((item) => connect(networkHub, item, "LAN", "Cat6"));
      for (const item of createdItems.filter((entry) => entry.connections.length > 0)) {
        await apiRequest("PUT", `/api/connection-schemas/components/${item.id}`, {
          connections: item.connections,
        });
      }
      return schema;
    },
    onSuccess: (schema) => {
      toast({ title: "Схема создана", description: "Оборудование из сметы выгружено в схемы подключения." });
      window.location.href = `/connection-schemas?schema=${schema.id}`;
    },
    onError: (error: any) => {
      toast({ title: "Не удалось создать схему", description: error?.message || "Попробуйте еще раз", variant: "destructive" });
    },
  });

  const updateLine = (lineId: string, patch: Partial<Pick<EstimateLine, "quantity" | "unitPrice" | "reason">>) => {
    setEstimate((current) => {
      if (!current) return current;
      const items = current.items.map((item) => {
        if (item.lineId !== lineId) return item;
        const quantity = patch.quantity != null ? Math.max(1, Math.round(Number(patch.quantity) || 1)) : item.quantity;
        const unitPrice = patch.unitPrice != null ? Math.max(0, Number(patch.unitPrice) || 0) : item.unitPrice;
        const parsedShiftFactor = Number(item.shiftFactor);
        const shiftFactor = Number.isFinite(parsedShiftFactor) ? parsedShiftFactor : 1;
        const baseTotal = Math.round(quantity * unitPrice * 100) / 100;
        return {
          ...item,
          ...patch,
          quantity,
          unitPrice,
          baseTotal,
          shiftFactor,
          total: Math.round(baseTotal * shiftFactor * 100) / 100,
          priceStatus: unitPrice > 0 ? "priced" as const : "no_price" as const,
          availability:
            item.availableQty >= quantity
              ? "in_stock" as const
              : item.availableQty > 0
                ? "partial" as const
                : "unavailable" as const,
        };
      });
      return { ...current, items, totals: recalculateTotals(items) };
    });
  };

  const removeLine = (lineId: string) => {
    setEstimate((current) => {
      if (!current) return current;
      const items = current.items.filter((item) => item.lineId !== lineId);
      return { ...current, items, totals: recalculateTotals(items) };
    });
  };

  const addCatalogLine = (item: CatalogItem) => {
    setEstimate((current) => {
      const base: EstimateResult = current || {
        title,
        source: "heuristic",
        summary: "Смета собрана вручную.",
        items: [],
        missing: [],
        warnings: [],
        totals: recalculateTotals([]),
      };
      const shiftFactor = base.shiftCalculation?.chargeFactor ?? 1;
      const items = [...base.items, buildLineFromCatalog(item, base.items.length, shiftFactor)];
      return { ...base, title, items, totals: recalculateTotals(items) };
    });
  };

  const canAnalyze = Boolean(tzText.trim() || file) && !analyzeMutation.isPending;

  return (
    <div className="w-full max-w-full space-y-4 p-3 sm:p-4 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-normal text-slate-900 dark:text-white">Смета</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Соберите комплект по ТЗ, цены и коэффициенты пересчитаются автоматически.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            disabled={!estimate}
            onClick={() => {
              saveEstimateVersion();
              toast({ title: "Версия сметы сохранена" });
            }}
          >
            <Clock3 className="mr-2 h-4 w-4" />
            Сохранить версию
          </Button>
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            disabled={!estimate?.items.length || exportToSchemaMutation.isPending}
            onClick={() => exportToSchemaMutation.mutate()}
          >
            {exportToSchemaMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Network className="mr-2 h-4 w-4" />}
            В схемы
          </Button>
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            disabled={!estimate?.items.length}
            onClick={() => estimate && exportEstimateToExcel(estimate, delivery)}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Excel
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,260px)_1fr]">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Название</label>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Файл ТЗ</label>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".txt,.md,.csv,.json,.docx,.pdf,.rtf,.html,.xml,text/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="mr-2 h-4 w-4" />
                  Загрузить
                </Button>
                {file && (
                  <div className="flex min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
                    <span className="max-w-[280px] truncate">{file.name}</span>
                    <button type="button" className="text-slate-500 hover:text-red-600" onClick={() => setFile(null)}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Текст ТЗ</label>
            <Textarea
              value={tzText}
              onChange={(event) => setTzText(event.target.value)}
              placeholder="Вставьте ТЗ: формат мероприятия, количество камер, звук, свет, экраны, трансляция, запись..."
              className="min-h-44 resize-y bg-white dark:bg-slate-950"
            />
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="rounded-md bg-slate-100 px-2 py-1 dark:bg-slate-800">Склад: {equipment.length}</span>
              <span className="rounded-md bg-slate-100 px-2 py-1 dark:bg-slate-800">С ценой: {pricedCount}</span>
            </div>
            <Button type="button" disabled={!canAnalyze} onClick={() => analyzeMutation.mutate()}>
              {analyzeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BrainCircuit className="mr-2 h-4 w-4" />}
              Собрать смету
            </Button>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white">История смет</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Откройте прошлую версию, поправьте строки и сохраните новую.</p>
            </div>
            <Badge variant="secondary">{estimateHistory.length} версий</Badge>
          </div>
          {estimateHistory.length === 0 ? (
            <div className="mt-3 rounded-md border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500 dark:border-slate-700">
              История появится после первой сборки сметы или ручного сохранения версии.
            </div>
          ) : (
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {estimateHistory.slice(0, 9).map((entry) => (
                <div key={entry.id} className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-900 dark:text-white">{entry.title}</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {new Date(entry.savedAt).toLocaleString("ru-RU")} · {entry.estimate.items.length} поз. · {formatMoney(entry.estimate.totals.subtotal)}
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => openEstimateVersion(entry)}>
                      Открыть
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => deleteEstimateVersion(entry.id)}>
                      Удалить
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)_minmax(320px,420px)]">
          <div className="border-b border-slate-200 pb-4 dark:border-slate-800 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
            <div className="flex items-center gap-2">
              <Clock3 className="h-5 w-5 text-primary" />
              <h2 className="font-semibold text-slate-900 dark:text-white">Смены</h2>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-slate-500 dark:text-slate-400">Начало</label>
                <Input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} className="h-9" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500 dark:text-slate-400">Окончание</label>
                <Input type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} className="h-9" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500 dark:text-slate-400">Смен вручную</label>
                <Input type="number" min="0.25" step="0.25" value={manualShiftCount} onChange={(event) => setManualShiftCount(event.target.value)} className="h-9" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500 dark:text-slate-400">Часов/смена</label>
                <Input type="number" min="1" max="24" step="0.5" value={shiftHours} onChange={(event) => setShiftHours(event.target.value)} className="h-9" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500 dark:text-slate-400">День с</label>
                <Input type="number" min="0" max="23" step="1" value={dayStartHour} onChange={(event) => setDayStartHour(event.target.value)} className="h-9" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500 dark:text-slate-400">Ночь с</label>
                <Input type="number" min="0" max="23" step="1" value={nightStartHour} onChange={(event) => setNightStartHour(event.target.value)} className="h-9" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500 dark:text-slate-400">Округление</label>
                <Input type="number" min="0.25" max="24" step="0.25" value={roundingStep} onChange={(event) => setRoundingStep(event.target.value)} className="h-9" />
              </div>
              <div className="hidden space-y-1">
                <label className="text-xs text-slate-500 dark:text-slate-400">Буд. день</label>
                <Input type="number" min="0" step="0.1" value={weekdayDayCoefficient} onChange={(event) => setWeekdayDayCoefficient(event.target.value)} className="h-9" />
              </div>
              <div className="hidden space-y-1">
                <label className="text-xs text-slate-500 dark:text-slate-400">Буд. ночь</label>
                <Input type="number" min="0" step="0.1" value={weekdayNightCoefficient} onChange={(event) => setWeekdayNightCoefficient(event.target.value)} className="h-9" />
              </div>
              <div className="hidden space-y-1">
                <label className="text-xs text-slate-500 dark:text-slate-400">Вых. день</label>
                <Input type="number" min="0" step="0.1" value={weekendDayCoefficient} onChange={(event) => setWeekendDayCoefficient(event.target.value)} className="h-9" />
              </div>
              <div className="hidden space-y-1">
                <label className="text-xs text-slate-500 dark:text-slate-400">Вых. ночь</label>
                <Input type="number" min="0" step="0.1" value={weekendNightCoefficient} onChange={(event) => setWeekendNightCoefficient(event.target.value)} className="h-9" />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs text-slate-500 dark:text-slate-400">Доп. выходные даты</label>
                <Input value={holidayDates} onChange={(event) => setHolidayDates(event.target.value)} placeholder="2026-05-25, 12.06.2026" className="h-9" />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs text-slate-500 dark:text-slate-400">Рабочие выходные</label>
                <Input value={workdayDates} onChange={(event) => setWorkdayDates(event.target.value)} placeholder="2026-05-23, 23.05.2026" className="h-9" />
              </div>
            </div>
          </div>

          <div className="border-b border-slate-200 pb-4 dark:border-slate-800 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
            <div className="flex items-center gap-2">
              <Network className="h-5 w-5 text-primary" />
              <h2 className="font-semibold text-slate-900 dark:text-white">Доставка</h2>
            </div>
            <div className="mt-3 space-y-2">
              <label className="text-xs text-slate-500 dark:text-slate-400">Дальность, км в одну сторону</label>
              <Input type="number" min="0" step="1" value={deliveryDistanceKm} onChange={(event) => setDeliveryDistanceKm(event.target.value)} className="h-9" />
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-md bg-slate-50 p-2 dark:bg-slate-800">
                  <div className="text-xs text-slate-500">Авто</div>
                  <div className="font-semibold">{delivery.vehicles}</div>
                </div>
                <div className="rounded-md bg-slate-50 p-2 dark:bg-slate-800">
                  <div className="text-xs text-slate-500">Время</div>
                  <div className="font-semibold">{delivery.hours} ч</div>
                </div>
                <div className="rounded-md bg-slate-50 p-2 dark:bg-slate-800">
                  <div className="text-xs text-slate-500">Сумма</div>
                  <div className="font-semibold">{formatMoney(delivery.total)}</div>
                </div>
              </div>
            </div>
          </div>
          <div>
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-slate-900 dark:text-white">Готовность склада</h2>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400">Позиций</div>
              <div className="mt-1 text-xl font-semibold">{catalog.length}</div>
            </div>
            <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400">С ценой</div>
              <div className="mt-1 text-xl font-semibold">{pricedCount}</div>
            </div>
          </div>
          {missingPriceCount > 0 && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              Без цены: {missingPriceCount}. Эти позиции попадут в смету с нулевой стоимостью.
            </div>
          )}
          <div className="mt-4 space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Добавить позицию</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={catalogSearch}
                onChange={(event) => setCatalogSearch(event.target.value)}
                placeholder="Поиск по складу"
                className="pl-9"
              />
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {equipmentLoading ? (
                <div className="flex items-center justify-center py-6 text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Загрузка
                </div>
              ) : visibleCatalog.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500 dark:border-slate-700">
                  Ничего не найдено
                </div>
              ) : (
                visibleCatalog.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="flex w-full items-start gap-2 rounded-md border border-slate-200 px-3 py-2 text-left transition-colors hover:border-primary/60 hover:bg-primary/5 dark:border-slate-800"
                    onClick={() => addCatalogLine(item)}
                  >
                    <Plus className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">{item.name}</span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                        {[getTypeText(item.type), item.model, formatMoney(item.unitPrice)].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
          </div>
          </div>
        </aside>
      </div>

      {estimate && (
        <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-slate-800 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{estimate.title}</h2>
                <Badge variant="secondary">{estimate.source === "ai" ? "ИИ" : "Локальный анализ"}</Badge>
              </div>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{estimate.summary}</p>
              {estimate.document && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Файл: {estimate.document.name}, извлечено {estimate.document.extractedChars} символов
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:w-[620px]">
              <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-800">
                <div className="text-xs text-slate-500 dark:text-slate-400">Итого</div>
                <div className="mt-1 font-semibold">{formatMoney(estimateGrandTotal)}</div>
                {delivery.total > 0 && <div className="mt-1 text-[11px] text-slate-500">оборудование {formatMoney(estimate.totals.subtotal)} + доставка</div>}
              </div>
              <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-800">
                <div className="text-xs text-slate-500 dark:text-slate-400">Смены</div>
                <div className="mt-1 font-semibold">{estimate.shiftCalculation?.chargeableShifts ?? 1}</div>
              </div>
              <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-800">
                <div className="text-xs text-slate-500 dark:text-slate-400">Коэфф.</div>
                <div className="mt-1 font-semibold">x{estimate.shiftCalculation?.chargeFactor ?? 1}</div>
              </div>
              <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-800">
                <div className="text-xs text-slate-500 dark:text-slate-400">Строк</div>
                <div className="mt-1 font-semibold">{estimate.totals.lines}</div>
              </div>
              <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-800">
                <div className="text-xs text-slate-500 dark:text-slate-400">Без цены</div>
                <div className="mt-1 font-semibold">{estimate.totals.missingPrices}</div>
              </div>
              <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-800">
                <div className="text-xs text-slate-500 dark:text-slate-400">Дефицит</div>
                <div className="mt-1 font-semibold">{estimate.totals.availabilityIssues}</div>
              </div>
            </div>
          </div>

          {estimate.warnings.length > 0 && (
            <div className="space-y-2 border-b border-slate-200 p-4 dark:border-slate-800">
              {estimate.warnings.map((warning, index) => (
                <div key={`${warning}-${index}`} className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0 break-words">{warning}</span>
                </div>
              ))}
            </div>
          )}

          {estimate.shiftCalculation && (
            <div className="border-b border-slate-200 p-4 dark:border-slate-800">
              <div className="grid gap-2 md:grid-cols-4">
                {estimate.shiftCalculation.segments.map((segment) => (
                  <div key={segment.kind} className="rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-800">
                    <div className="font-medium text-slate-900 dark:text-white">{segment.label}</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {segment.hours} ч · {segment.shifts} см · x{segment.coefficient}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-normal text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Позиция</th>
                  <th className="px-4 py-3">Кол-во</th>
                  <th className="px-4 py-3">Цена</th>
                  <th className="px-4 py-3">База</th>
                  <th className="px-4 py-3">Коэфф.</th>
                  <th className="px-4 py-3">Сумма</th>
                  <th className="px-4 py-3">Комментарий</th>
                  <th className="px-4 py-3 text-right"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {estimate.items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                      Позиции пока не добавлены
                    </td>
                  </tr>
                ) : (
                  estimateGroups.map((group) => (
                    <Fragment key={group.key}>
                      <tr className="bg-slate-100 dark:bg-slate-800/80">
                        <td className="px-4 py-2 font-semibold text-slate-900 dark:text-white" colSpan={5}>{group.title}</td>
                        <td className="px-4 py-2 font-semibold text-slate-900 dark:text-white">{formatMoney(group.total)}</td>
                        <td colSpan={2} />
                      </tr>
                      {group.items.map((line) => (
                    <tr key={line.lineId} className="align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-white">{line.name}</div>
                        <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                          <span>{getTypeText(line.type)}</span>
                          {line.model && <span>· {line.model}</span>}
                          {line.locations.length > 0 && <span>· {line.locations.join(", ")}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(event) => updateLine(line.lineId, { quantity: Number(event.target.value) })}
                          className="h-9 w-20"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.unitPrice}
                          onChange={(event) => updateLine(line.lineId, { unitPrice: Number(event.target.value) })}
                          className={cn("h-9 w-32", !line.unitPrice && "border-amber-300")}
                        />
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                        {formatMoney(line.baseTotal ?? line.quantity * line.unitPrice)}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                        x{line.shiftFactor ?? 1}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                        {formatMoney(line.total ?? line.quantity * line.unitPrice)}
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          value={line.reason}
                          onChange={(event) => updateLine(line.lineId, { reason: event.target.value })}
                          className="h-9 min-w-64"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(line.lineId)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                      ))}
                    </Fragment>
                  ))
                )}
              </tbody>
              <tfoot className="border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800">
                <tr>
                  <td className="px-4 py-3 font-semibold" colSpan={5}>Итого</td>
                  <td className="px-4 py-3 font-semibold">{formatMoney(estimate.totals.subtotal)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>

          {estimate.missing.length > 0 && (
            <div className="border-t border-slate-200 p-4 dark:border-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-white">Не найдено на складе</h3>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {estimate.missing.map((item, index) => (
                  <div key={`${item.name}-${index}`} className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
                    <div className="font-medium">{item.name} x{item.quantity}</div>
                    <div className="mt-1 text-xs">{item.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
