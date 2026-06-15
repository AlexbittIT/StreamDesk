import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Printer, ScanBarcode, RefreshCw } from "lucide-react";
import {
  buildBarcodeLabelBitmapPayload,
  downloadBarcodeLabelPng,
  openBarcodePrintWindow,
  renderCompactBarcodeLabel,
  sanitizeBarcodeFilePart,
} from "@/lib/barcode-label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Equipment } from "@shared/schema";

interface BarcodeGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  equipment: Equipment | null;
}

export function BarcodeGenerator({ isOpen, onClose, equipment, onBarcodeGenerated }: BarcodeGeneratorProps & { onBarcodeGenerated?: (barcode: string) => void }) {
  const barcodeRef = useRef<SVGSVGElement>(null);
  const [barcodeFormat, setBarcodeFormat] = useState("CODE128");
  const [barcodeValue, setBarcodeValue] = useState("");
  const [equipmentInfo, setEquipmentInfo] = useState<Equipment | null>(null);

  useEffect(() => {
    if (isOpen && equipment) {
      setEquipmentInfo(equipment);
      const value = equipment.inventoryNumber || equipment.barcode || equipment.serialNumber || equipment.id.slice(0, 12).toUpperCase();
      setBarcodeValue(value);
    } else if (!isOpen) {
      setEquipmentInfo(null);
    }
  }, [isOpen, equipment]);

  useEffect(() => {
    if (!isOpen || !barcodeRef.current || !barcodeValue) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      if (!barcodeRef.current) return;
      try {
        renderCompactBarcodeLabel(barcodeRef.current, barcodeValue, { format: barcodeFormat });
      } catch (error) {
        console.error("Error generating barcode:", error);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, barcodeValue, barcodeFormat]);

  const handleDownload = () => {
    if (!barcodeRef.current) return;
    downloadBarcodeLabelPng(barcodeRef.current, `barcode-${sanitizeBarcodeFilePart(barcodeValue)}.png`);
  };

  const handlePrint = () => {
    if (!barcodeRef.current) return;
    openBarcodePrintWindow({
      svg: barcodeRef.current,
      name: equipmentInfo?.name,
      model: equipmentInfo?.model || "",
    });
  };

  const generateRandomBarcode = () => {
    const prefix = "EQ";
    const randomNum = Math.floor(Math.random() * 1000000).toString().padStart(6, "0");
    const newValue = `${prefix}${randomNum}`;
    setBarcodeValue(newValue);
    if (onBarcodeGenerated) {
      onBarcodeGenerated(newValue);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[430px] bg-white dark:bg-slate-900">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
            <ScanBarcode className="w-5 h-5" />
            Генератор штрих-кода
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400">
            Создайте и сохраните штрих-код для оборудования
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {equipmentInfo && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <div className="font-medium text-slate-900 dark:text-white">{equipmentInfo.name}</div>
              {equipmentInfo.model && (
                <div className="text-sm text-slate-500 dark:text-slate-400">{equipmentInfo.model}</div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="barcode-value" className="text-slate-700 dark:text-slate-300">
              Значение штрих-кода
            </Label>
            <div className="flex gap-2">
              <Input
                id="barcode-value"
                value={barcodeValue}
                onChange={(e) => setBarcodeValue(e.target.value.toUpperCase())}
                placeholder="Введите или сгенерируйте"
                className="font-mono bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600"
                data-testid="input-barcode-value"
              />
              <Button 
                variant="outline" 
                size="icon" 
                onClick={generateRandomBarcode}
                title="Сгенерировать новый"
                data-testid="button-generate-barcode"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-700 dark:text-slate-300">Формат</Label>
            <Select value={barcodeFormat} onValueChange={setBarcodeFormat}>
              <SelectTrigger className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CODE128">Code 128</SelectItem>
                <SelectItem value="EAN13">EAN-13</SelectItem>
                <SelectItem value="EAN8">EAN-8</SelectItem>
                <SelectItem value="CODE39">Code 39</SelectItem>
                <SelectItem value="ITF14">ITF-14</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {barcodeValue && (
            <div className="p-3 bg-white rounded-md border border-slate-200 flex justify-center overflow-hidden">
              <svg ref={barcodeRef} data-testid="barcode-preview" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Button 
              variant="outline"
              onClick={handleDownload}
              disabled={!barcodeValue}
              className="w-full"
              data-testid="button-download-barcode"
            >
              <Download className="w-4 h-4 mr-2" />
              Скачать
            </Button>
            <Button 
              onClick={handlePrint}
              disabled={!barcodeValue}
              className="w-full"
              data-testid="button-print-barcode"
            >
              <Printer className="w-4 h-4 mr-2" />
              Печать
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function EquipmentBarcodeModal({ 
  isOpen, 
  onClose, 
  equipment 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  equipment: Equipment | null;
}) {
  const barcodeRef = useRef<SVGSVGElement>(null);
  const [barcodeValue, setBarcodeValue] = useState("");
  const [isPrinting, setIsPrinting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && equipment) {
      const value = equipment.inventoryNumber || equipment.barcode || equipment.serialNumber || `EQ${equipment.id.slice(0, 10).toUpperCase()}`;
      setBarcodeValue(value);
    } else if (!isOpen) {
      setBarcodeValue("");
    }
  }, [isOpen, equipment]);

  useEffect(() => {
    if (!isOpen || !barcodeRef.current || !barcodeValue) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      if (!barcodeRef.current) return;
      try {
        renderCompactBarcodeLabel(barcodeRef.current, barcodeValue);
      } catch (error) {
        console.error("Error generating barcode:", error);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, barcodeValue]);

  const handleDownload = () => {
    if (!barcodeRef.current) return;
    downloadBarcodeLabelPng(
      barcodeRef.current,
      `barcode-${sanitizeBarcodeFilePart(equipment?.name || barcodeValue)}.png`,
    );
  };

  const handlePrint = async () => {
    if (!barcodeRef.current) return;
    setIsPrinting(true);
    try {
      const label = await buildBarcodeLabelBitmapPayload(barcodeRef.current, barcodeValue);
      const response = await apiRequest("POST", "/api/equipment/labels/print-bitmaps", {
        labels: [label],
      });
      const data = await response.json();
      toast({
        title: "Этикетка отправлена",
        description: `Принтер: ${data?.printer || "TSC"}.`,
      });
    } catch (error: any) {
      toast({
        title: "Ошибка печати",
        description: error?.message || "Не удалось отправить PNG-этикетку на принтер",
        variant: "destructive",
      });
    } finally {
      setIsPrinting(false);
    }
  };

  if (!equipment) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[430px] bg-white dark:bg-slate-900">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
            <ScanBarcode className="w-5 h-5" />
            Штрих-код оборудования
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400">
            {equipment.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-md text-center">
            <div className="font-semibold text-base sm:text-lg text-slate-900 dark:text-white truncate">{equipment.name}</div>
            {equipment.model && (
              <div className="text-sm text-slate-500 dark:text-slate-400 truncate">{equipment.model}</div>
            )}
            {equipment.serialNumber && (
              <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                S/N: {equipment.serialNumber}
              </div>
            )}
          </div>

          <div className="p-3 bg-white rounded-md border border-slate-200 flex justify-center overflow-hidden">
            <svg ref={barcodeRef} data-testid="equipment-barcode" />
          </div>

          <div className="text-center text-xs font-mono text-slate-600 dark:text-slate-400 break-all">
            {barcodeValue}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button 
              variant="outline"
              onClick={handleDownload}
              className="w-full"
              data-testid="button-download-equipment-barcode"
            >
              <Download className="w-4 h-4 mr-2" />
              Скачать PNG
            </Button>
            <Button 
              onClick={handlePrint}
              disabled={isPrinting}
              className="w-full"
              data-testid="button-print-equipment-barcode"
            >
              <Printer className="w-4 h-4 mr-2" />
              Печать
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
