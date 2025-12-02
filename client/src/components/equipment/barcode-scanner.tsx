import { useState, useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, X, Package, MapPin, AlertCircle, CheckCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Equipment } from "@shared/schema";

interface BarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onEquipmentFound?: (equipment: Equipment) => void;
}

export function BarcodeScanner({ isOpen, onClose, onEquipmentFound }: BarcodeScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: equipment, isLoading, isError } = useQuery<Equipment>({
    queryKey: ["/api/equipment/barcode", scannedCode],
    enabled: !!scannedCode,
  });

  useEffect(() => {
    if (isOpen && !scanning) {
      startScanning();
    }
    return () => {
      stopScanning();
    };
  }, [isOpen]);

  const startScanning = async () => {
    try {
      setError(null);
      setScannedCode(null);
      
      if (!containerRef.current) return;
      
      const html5QrCode = new Html5Qrcode("barcode-reader");
      scannerRef.current = html5QrCode;
      
      await html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 150 },
          aspectRatio: 1.777778
        },
        (decodedText) => {
          setScannedCode(decodedText);
          stopScanning();
        },
        () => {}
      );
      
      setScanning(true);
    } catch (err) {
      console.error("Error starting scanner:", err);
      setError("Не удалось получить доступ к камере. Проверьте разрешения.");
    }
  };

  const stopScanning = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (err) {
        console.error("Error stopping scanner:", err);
      }
      scannerRef.current = null;
    }
    setScanning(false);
  };

  const handleClose = () => {
    stopScanning();
    setScannedCode(null);
    setError(null);
    onClose();
  };

  const handleRescan = () => {
    setScannedCode(null);
    setError(null);
    startScanning();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "available": return "bg-green-100 text-green-800";
      case "in-use": return "bg-blue-100 text-blue-800";
      case "maintenance": return "bg-yellow-100 text-yellow-800";
      case "broken": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
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

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Camera className="w-5 h-5" />
              Сканер штрих-кода
            </DialogTitle>
          </div>
        </DialogHeader>
        
        <div className="p-4">
          {/* Scanner View */}
          {!scannedCode && !error && (
            <div className="space-y-4">
              <div 
                id="barcode-reader" 
                ref={containerRef}
                className="w-full rounded-lg overflow-hidden bg-black"
                style={{ minHeight: "250px" }}
              />
              <p className="text-center text-sm text-gray-500">
                Наведите камеру на штрих-код оборудования
              </p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
              <p className="text-red-600 mb-4">{error}</p>
              <Button onClick={handleRescan}>
                Попробовать снова
              </Button>
            </div>
          )}

          {/* Result View */}
          {scannedCode && (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2 p-3 bg-green-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="font-mono text-sm">{scannedCode}</span>
              </div>

              {isLoading && (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              )}

              {isError && (
                <Card className="border-orange-200 bg-orange-50">
                  <CardContent className="py-6 text-center">
                    <Package className="w-12 h-12 mx-auto mb-4 text-orange-400" />
                    <p className="font-medium text-orange-800 mb-2">
                      Оборудование не найдено
                    </p>
                    <p className="text-sm text-orange-600">
                      Штрих-код не зарегистрирован в системе
                    </p>
                  </CardContent>
                </Card>
              )}

              {equipment && (
                <Card data-testid="scanned-equipment-result">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-lg">{equipment.name}</h3>
                        <p className="text-sm text-gray-500">{equipment.model}</p>
                      </div>
                      <Badge className={getStatusColor(equipment.status)}>
                        {getStatusText(equipment.status)}
                      </Badge>
                    </div>

                    <div className="space-y-2 text-sm">
                      {equipment.serialNumber && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Серийный номер:</span>
                          <span className="font-medium">{equipment.serialNumber}</span>
                        </div>
                      )}
                      {equipment.inventoryNumber && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Инв. номер:</span>
                          <span className="font-medium">{equipment.inventoryNumber}</span>
                        </div>
                      )}
                      {equipment.location && (
                        <div className="flex items-center gap-1">
                          <MapPin className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-500">Место:</span>
                          <span className="font-medium ml-1">{equipment.location}</span>
                        </div>
                      )}
                      {equipment.notes && (
                        <div className="mt-3 p-2 bg-gray-50 rounded text-gray-600">
                          {equipment.notes}
                        </div>
                      )}
                    </div>

                    {onEquipmentFound && (
                      <Button 
                        className="w-full mt-4"
                        onClick={() => {
                          onEquipmentFound(equipment);
                          handleClose();
                        }}
                        data-testid="button-view-equipment"
                      >
                        Открыть карточку
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}

              <Button 
                variant="outline" 
                className="w-full"
                onClick={handleRescan}
                data-testid="button-scan-again"
              >
                <Camera className="w-4 h-4 mr-2" />
                Сканировать ещё
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
