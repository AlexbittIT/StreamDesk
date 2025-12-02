import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Printer, QrCode, RefreshCw } from "lucide-react";
import type { Equipment } from "@shared/schema";

interface BarcodeGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  equipment: Equipment | null;
}

export function BarcodeGenerator({ isOpen, onClose, onBarcodeGenerated }: BarcodeGeneratorProps & { onBarcodeGenerated?: (barcode: string) => void }) {
  const barcodeRef = useRef<SVGSVGElement>(null);
  const [barcodeFormat, setBarcodeFormat] = useState("CODE128");
  const [barcodeValue, setBarcodeValue] = useState("");
  const [equipmentInfo, setEquipmentInfo] = useState<Equipment | null>(null);

  useEffect(() => {
    if (isOpen && equipmentInfo) {
      const value = equipmentInfo.inventoryNumber || equipmentInfo.serialNumber || equipmentInfo.id.slice(0, 12).toUpperCase();
      setBarcodeValue(value);
    }
  }, [isOpen, equipmentInfo]);

  useEffect(() => {
    if (barcodeRef.current && barcodeValue) {
      try {
        JsBarcode(barcodeRef.current, barcodeValue, {
          format: barcodeFormat,
          width: 2,
          height: 80,
          displayValue: true,
          fontSize: 14,
          margin: 10,
          background: "#ffffff",
          lineColor: "#000000",
        });
      } catch (error) {
        console.error("Error generating barcode:", error);
      }
    }
  }, [barcodeValue, barcodeFormat]);

  const handleDownload = () => {
    if (!barcodeRef.current) return;
    
    const svgData = new XMLSerializer().serializeToString(barcodeRef.current);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      
      const link = document.createElement("a");
      link.download = `barcode-${barcodeValue}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };
    
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handlePrint = () => {
    if (!barcodeRef.current) return;
    
    const svgData = new XMLSerializer().serializeToString(barcodeRef.current);
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Печать штрих-кода</title>
          <style>
            body {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              font-family: system-ui, -apple-system, sans-serif;
            }
            .barcode-container {
              text-align: center;
              padding: 20px;
            }
            .equipment-name {
              font-size: 16px;
              font-weight: bold;
              margin-bottom: 10px;
            }
            .equipment-model {
              font-size: 14px;
              color: #666;
              margin-bottom: 15px;
            }
            @media print {
              body { margin: 0; padding: 20mm; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="barcode-container">
            ${equipmentInfo ? `
              <div class="equipment-name">${equipmentInfo.name}</div>
              <div class="equipment-model">${equipmentInfo.model || ""}</div>
            ` : ""}
            ${svgData}
          </div>
          <button class="no-print" onclick="window.print()">Печать</button>
        </body>
      </html>
    `);
    printWindow.document.close();
    
    setTimeout(() => {
      printWindow.print();
    }, 250);
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
      <DialogContent className="max-w-md bg-white dark:bg-slate-900">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
            <QrCode className="w-5 h-5" />
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
            <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 flex justify-center">
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

  useEffect(() => {
    if (isOpen && equipment) {
      const value = equipment.inventoryNumber || equipment.barcode || equipment.serialNumber || `EQ${equipment.id.slice(0, 10).toUpperCase()}`;
      setBarcodeValue(value);
    }
  }, [isOpen, equipment]);

  useEffect(() => {
    if (barcodeRef.current && barcodeValue) {
      try {
        JsBarcode(barcodeRef.current, barcodeValue, {
          format: "CODE128",
          width: 2,
          height: 80,
          displayValue: true,
          fontSize: 14,
          margin: 10,
          background: "#ffffff",
          lineColor: "#000000",
        });
      } catch (error) {
        console.error("Error generating barcode:", error);
      }
    }
  }, [barcodeValue]);

  const handleDownload = () => {
    if (!barcodeRef.current) return;
    
    const svgData = new XMLSerializer().serializeToString(barcodeRef.current);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      
      const link = document.createElement("a");
      link.download = `barcode-${equipment?.name || 'equipment'}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };
    
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handlePrint = () => {
    if (!barcodeRef.current) return;
    
    const svgData = new XMLSerializer().serializeToString(barcodeRef.current);
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Печать штрих-кода</title>
          <style>
            body {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              font-family: system-ui, -apple-system, sans-serif;
            }
            .barcode-container {
              text-align: center;
              padding: 20px;
            }
            .equipment-name {
              font-size: 18px;
              font-weight: bold;
              margin-bottom: 8px;
            }
            .equipment-model {
              font-size: 14px;
              color: #666;
              margin-bottom: 15px;
            }
            @media print {
              body { margin: 0; padding: 20mm; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="barcode-container">
            ${equipment ? `
              <div class="equipment-name">${equipment.name}</div>
              <div class="equipment-model">${equipment.model || ""}</div>
            ` : ""}
            ${svgData}
          </div>
          <button class="no-print" onclick="window.print()">Печать</button>
        </body>
      </html>
    `);
    printWindow.document.close();
    
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  if (!equipment) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-white dark:bg-slate-900">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
            <QrCode className="w-5 h-5" />
            Штрих-код оборудования
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400">
            {equipment.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-center">
            <div className="font-semibold text-lg text-slate-900 dark:text-white">{equipment.name}</div>
            {equipment.model && (
              <div className="text-sm text-slate-500 dark:text-slate-400">{equipment.model}</div>
            )}
            {equipment.serialNumber && (
              <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                S/N: {equipment.serialNumber}
              </div>
            )}
          </div>

          <div className="p-4 bg-white rounded-lg border border-slate-200 flex justify-center">
            <svg ref={barcodeRef} data-testid="equipment-barcode" />
          </div>

          <div className="text-center text-sm font-mono text-slate-600 dark:text-slate-400">
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
